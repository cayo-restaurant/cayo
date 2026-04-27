#!/usr/bin/env python3
"""
CAYO Bar - Daily site-check agent.

Runs four families of checks against the live site and writes a single
results.json for the report generator to consume.

Checks performed
----------------
1. Functional / E2E       HTTP fetch, redirects, status, response time,
                          HTML parse (title, lang, meta, h1, links, images),
                          broken-image scan.
2. Performance            Google PageSpeed Insights API (mobile + desktop)
                          for Core Web Vitals and Lighthouse score.
3. Accessibility          Lighthouse a11y category + axe-style audits
                          included in the PSI response.
4. Visual regression      Saves the Lighthouse final-screenshot, hashes it
                          with a perceptual hash, and diffs against the
                          baseline (first run becomes the baseline).
"""

from __future__ import annotations

import base64
import datetime as dt
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

URL = os.environ.get("CAYO_URL", "https://www.cayobar.com")
PAGESPEED_API_KEY = os.environ.get("PAGESPEED_API_KEY", "")
PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
TIMEOUT = 30

ROOT = Path(__file__).resolve().parent
RESULTS_DIR = ROOT / "results"
SCREENSHOT_DIR = ROOT / "screenshots"
BASELINE_DIR = ROOT / "baselines"
for d in (RESULTS_DIR, SCREENSHOT_DIR, BASELINE_DIR):
    d.mkdir(parents=True, exist_ok=True)

TODAY = dt.date.today().isoformat()


class MetaParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title_parts = []
        self._in_title = False
        self.lang = None
        self.meta_desc = None
        self.og_title = None
        self.og_image = None
        self.h1 = []
        self.h2 = []
        self._in_h1 = False
        self._in_h2 = False
        self.links = []
        self.images = []
        self.body_text_parts = []
        self._in_body = False
        self._skip_depth = 0

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "html":
            self.lang = a.get("lang")
        elif tag == "title":
            self._in_title = True
        elif tag == "meta":
            name = a.get("name", "").lower()
            prop = a.get("property", "").lower()
            content = a.get("content", "")
            if name == "description":
                self.meta_desc = content
            elif prop == "og:title":
                self.og_title = content
            elif prop == "og:image":
                self.og_image = content
        elif tag == "h1":
            self._in_h1 = True
            self.h1.append("")
        elif tag == "h2":
            self._in_h2 = True
            self.h2.append("")
        elif tag == "a":
            href = a.get("href")
            if href:
                self.links.append(href)
        elif tag == "img":
            src = a.get("src")
            if src:
                self.images.append(src)
        elif tag == "body":
            self._in_body = True
        elif tag in ("script", "style", "noscript"):
            self._skip_depth += 1

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag == "h1":
            self._in_h1 = False
        elif tag == "h2":
            self._in_h2 = False
        elif tag == "body":
            self._in_body = False
        elif tag in ("script", "style", "noscript") and self._skip_depth > 0:
            self._skip_depth -= 1

    def handle_data(self, data):
        if self._in_title:
            self.title_parts.append(data)
        if self._in_h1 and self.h1:
            self.h1[-1] += data
        if self._in_h2 and self.h2:
            self.h2[-1] += data
        if self._in_body and self._skip_depth == 0:
            self.body_text_parts.append(data)

    @property
    def title(self):
        return "".join(self.title_parts).strip()

    @property
    def body_text(self):
        return re.sub(r"\s+", " ", " ".join(self.body_text_parts)).strip()


def http_get(url, timeout=TIMEOUT):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (CAYO-Bar-Site-Agent/1.0)",
            "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
        },
    )
    started = time.perf_counter()
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read()
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return {
            "url": resp.geturl(),
            "status": resp.status,
            "headers": dict(resp.headers),
            "body": body,
            "elapsed_ms": elapsed_ms,
        }


def head_check(url):
    try:
        req = urllib.request.Request(url, method="HEAD",
                                     headers={"User-Agent": "CAYO-Site-Agent/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return {"url": url, "status": resp.status, "ok": resp.status < 400}
    except Exception as e:
        return {"url": url, "status": None, "ok": False, "error": str(e)}


def run_pagespeed(url, strategy):
    params = {
        "url": url,
        "strategy": strategy,
        "category": ["performance", "accessibility", "best-practices", "seo"],
    }
    if PAGESPEED_API_KEY:
        params["key"] = PAGESPEED_API_KEY
    qs = urllib.parse.urlencode(params, doseq=True)
    full_url = f"{PSI_ENDPOINT}?{qs}"
    req = urllib.request.Request(full_url, headers={"User-Agent": "CAYO-Site-Agent/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def summarize_lighthouse(psi):
    lh = psi.get("lighthouseResult", {})
    cats = lh.get("categories", {})
    audits = lh.get("audits", {})

    def score(key):
        s = cats.get(key, {}).get("score")
        return None if s is None else round(s * 100)

    def numeric(audit_id, default=None):
        return audits.get(audit_id, {}).get("numericValue", default)

    def display(audit_id, default=""):
        return audits.get(audit_id, {}).get("displayValue", default)

    failures = []
    for audit_id, audit in audits.items():
        s = audit.get("score")
        if s is None or audit.get("scoreDisplayMode") in ("notApplicable", "informative", "manual"):
            continue
        if s >= 0.9:
            continue
        failures.append({
            "id": audit_id,
            "title": audit.get("title"),
            "description": audit.get("description"),
            "score": s,
            "display": audit.get("displayValue", ""),
        })
    failures.sort(key=lambda f: (f["score"], f["id"]))

    screenshot_b64 = None
    fs = audits.get("final-screenshot", {}).get("details", {})
    data_url = fs.get("data") if isinstance(fs, dict) else None
    if data_url and isinstance(data_url, str) and data_url.startswith("data:image"):
        screenshot_b64 = data_url.split(",", 1)[1]

    return {
        "scores": {
            "performance": score("performance"),
            "accessibility": score("accessibility"),
            "best_practices": score("best-practices"),
            "seo": score("seo"),
        },
        "core_web_vitals": {
            "lcp_ms": numeric("largest-contentful-paint"),
            "lcp_display": display("largest-contentful-paint"),
            "fcp_ms": numeric("first-contentful-paint"),
            "fcp_display": display("first-contentful-paint"),
            "cls": numeric("cumulative-layout-shift"),
            "cls_display": display("cumulative-layout-shift"),
            "tbt_ms": numeric("total-blocking-time"),
            "tbt_display": display("total-blocking-time"),
            "speed_index_ms": numeric("speed-index"),
            "speed_index_display": display("speed-index"),
            "tti_ms": numeric("interactive"),
            "tti_display": display("interactive"),
        },
        "failures": failures,
        "screenshot_b64": screenshot_b64,
    }


def perceptual_hash(png_bytes):
    try:
        from PIL import Image
    except Exception:
        return None
    img = Image.open(io.BytesIO(png_bytes)).convert("L").resize((9, 8))
    pixels = list(img.getdata())
    bits = []
    for row in range(8):
        for col in range(8):
            left = pixels[row * 9 + col]
            right = pixels[row * 9 + col + 1]
            bits.append(1 if left > right else 0)
    n = 0
    for b in bits:
        n = (n << 1) | b
    return f"{n:016x}"


def hamming(a, b):
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def visual_check(screenshot_b64):
    if not screenshot_b64:
        return {"status": "skipped", "reason": "no screenshot in PSI response"}
    png = base64.b64decode(screenshot_b64)
    today_path = SCREENSHOT_DIR / f"{TODAY}.png"
    today_path.write_bytes(png)
    today_hash = perceptual_hash(png)
    baseline_path = BASELINE_DIR / "baseline.png"
    if not baseline_path.exists():
        baseline_path.write_bytes(png)
        return {
            "status": "baseline_created",
            "today_hash": today_hash,
            "today_path": str(today_path),
            "baseline_path": str(baseline_path),
            "message": "First run, saved as baseline.",
        }
    baseline_hash = perceptual_hash(baseline_path.read_bytes())
    distance = None
    if today_hash and baseline_hash:
        distance = hamming(today_hash, baseline_hash)
    if distance is None:
        status = "compared_no_hash"
    elif distance == 0:
        status = "identical"
    elif distance < 5:
        status = "minor_change"
    elif distance < 12:
        status = "noticeable_change"
    else:
        status = "major_change"
    return {
        "status": status,
        "today_hash": today_hash,
        "baseline_hash": baseline_hash,
        "hamming_distance": distance,
        "today_path": str(today_path),
        "baseline_path": str(baseline_path),
    }


def functional_checks(fetch, parsed):
    body_text = parsed.body_text
    title = parsed.title
    assertions = [
        ("status_200", fetch["status"] == 200, f"HTTP {fetch['status']}"),
        ("uses_https", fetch["url"].startswith("https://"), fetch["url"]),
        ("title_present", bool(title), title),
        ("title_contains_cayo", "CAYO" in title or "cayo" in title.lower(), title),
        ("lang_he", parsed.lang == "he", parsed.lang or "(missing)"),
        ("meta_description", bool(parsed.meta_desc), parsed.meta_desc or "(missing)"),
        ("og_title", bool(parsed.og_title), parsed.og_title or "(missing)"),
        ("og_image", bool(parsed.og_image), parsed.og_image or "(missing)"),
        ("h1_present", len(parsed.h1) > 0, parsed.h1[:3]),
        ("body_has_content", len(body_text) >= 50, f"{len(body_text)} chars"),
        ("response_under_3s", fetch["elapsed_ms"] < 3000, f"{fetch['elapsed_ms']}ms"),
    ]

    image_status = []
    for src in parsed.images[:10]:
        absolute = urllib.parse.urljoin(fetch["url"], src)
        image_status.append(head_check(absolute))
    broken_images = [i for i in image_status if not i["ok"]]
    assertions.append(("no_broken_images", len(broken_images) == 0, f"{len(broken_images)} broken"))

    internal_links = []
    base = urllib.parse.urlparse(fetch["url"])
    for href in parsed.links:
        absolute = urllib.parse.urljoin(fetch["url"], href)
        u = urllib.parse.urlparse(absolute)
        if u.netloc == base.netloc and u.scheme in ("http", "https"):
            internal_links.append(absolute)
    sample = list(dict.fromkeys(internal_links))[:8]
    link_status = [head_check(u) for u in sample]
    broken_links = [l for l in link_status if not l["ok"]]
    assertions.append(("no_broken_links", len(broken_links) == 0,
                       f"{len(broken_links)} broken of {len(sample)} sampled"))

    return {
        "url_final": fetch["url"],
        "status": fetch["status"],
        "elapsed_ms": fetch["elapsed_ms"],
        "title": title,
        "lang": parsed.lang,
        "meta_description": parsed.meta_desc,
        "og_title": parsed.og_title,
        "og_image": parsed.og_image,
        "h1": parsed.h1,
        "h2": parsed.h2,
        "link_count": len(parsed.links),
        "image_count": len(parsed.images),
        "body_text_len": len(body_text),
        "body_text": body_text[:500],
        "assertions": [{"name": n, "passed": bool(p), "actual": str(a)} for n, p, a in assertions],
        "image_status": image_status,
        "broken_images": broken_images,
        "link_status": link_status,
        "broken_links": broken_links,
    }


def write_results(result):
    out_path = RESULTS_DIR / f"results-{TODAY}.json"
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    (RESULTS_DIR / "latest.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_path


def run():
    started_at = dt.datetime.now(dt.timezone.utc).isoformat()
    print(f"[{started_at}] Starting CAYO site agent for {URL}")

    try:
        fetch = http_get(URL)
    except Exception as e:
        print(f"FATAL: could not fetch {URL}: {e}", file=sys.stderr)
        result = {
            "started_at": started_at,
            "finished_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "url": URL,
            "date": TODAY,
            "overall": "fail",
            "fatal_error": str(e),
            "summary": {
                "functional_passed": 0,
                "functional_total": 0,
                "performance_score_mobile": None,
                "performance_score_desktop": None,
                "accessibility_score_mobile": None,
                "accessibility_score_desktop": None,
                "visual_status": "skipped",
            },
            "functional": None,
            "performance": None,
            "accessibility": None,
            "visual": {"status": "skipped", "reason": "fetch failed"},
        }
        write_results(result)
        return result

    html = fetch["body"].decode("utf-8", errors="replace")
    parser = MetaParser()
    try:
        parser.feed(html)
    except Exception as e:
        print(f"WARNING: HTML parse error: {e}", file=sys.stderr)

    functional = functional_checks(fetch, parser)
    print(f"  functional: {sum(1 for a in functional['assertions'] if a['passed'])}/{len(functional['assertions'])} passed")

    perf = {}
    a11y = {}
    visual = {"status": "skipped", "reason": "PSI failed"}
    a11y_audit_keys = (
        "color-contrast", "image-alt", "label", "link-name", "button-name",
        "html-has-lang", "html-lang-valid", "meta-viewport", "tabindex", "aria-",
        "heading-order", "list", "listitem", "document-title", "valid-lang",
        "duplicate-id", "form-field-multiple-labels", "frame-title", "object-alt",
    )

    for strategy in ("mobile", "desktop"):
        try:
            psi = run_pagespeed(URL, strategy)
            summary = summarize_lighthouse(psi)
            perf[strategy] = {
                "score": summary["scores"]["performance"],
                "core_web_vitals": summary["core_web_vitals"],
                "best_practices": summary["scores"]["best_practices"],
                "seo": summary["scores"]["seo"],
                "all_failures": summary["failures"],
            }
            a11y[strategy] = {
                "score": summary["scores"]["accessibility"],
                "failures": [f for f in summary["failures"]
                             if any(k in f["id"] for k in a11y_audit_keys)],
            }
            print(f"  PSI {strategy}: perf={perf[strategy]['score']}, a11y={a11y[strategy]['score']}")
            if strategy == "mobile":
                visual = visual_check(summary["screenshot_b64"])
        except Exception as e:
            print(f"  PSI {strategy} FAILED: {e}", file=sys.stderr)
            perf[strategy] = {"error": str(e)}
            a11y[strategy] = {"error": str(e)}

    finished_at = dt.datetime.now(dt.timezone.utc).isoformat()
    func_pass = sum(1 for a in functional["assertions"] if a["passed"])
    func_total = len(functional["assertions"])
    func_fail = func_total - func_pass
    perf_score = perf.get("mobile", {}).get("score") or perf.get("desktop", {}).get("score")
    a11y_score = a11y.get("mobile", {}).get("score") or a11y.get("desktop", {}).get("score")

    overall = "ok"
    if func_fail > 0 or visual.get("status") == "major_change":
        overall = "fail"
    elif (perf_score is not None and perf_score < 70) or \
         (a11y_score is not None and a11y_score < 80) or \
         visual.get("status") == "noticeable_change":
        overall = "warn"

    result = {
        "started_at": started_at,
        "finished_at": finished_at,
        "url": URL,
        "date": TODAY,
        "overall": overall,
        "summary": {
            "functional_passed": func_pass,
            "functional_total": func_total,
            "performance_score_mobile": perf.get("mobile", {}).get("score"),
            "performance_score_desktop": perf.get("desktop", {}).get("score"),
            "accessibility_score_mobile": a11y.get("mobile", {}).get("score"),
            "accessibility_score_desktop": a11y.get("desktop", {}).get("score"),
            "visual_status": visual.get("status"),
        },
        "functional": functional,
        "performance": perf,
        "accessibility": a11y,
        "visual": visual,
    }

    out_path = write_results(result)
    print(f"  wrote {out_path}")
    print(f"  overall: {overall.upper()}")
    return result


if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print(f"FATAL: {e}", file=sys.stderr)
        raise
