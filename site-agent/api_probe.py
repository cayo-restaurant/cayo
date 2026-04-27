#!/usr/bin/env python3
"""
CAYO Bar - Live API surface probe.

For every detected route at app/api/**/route.ts on the live site, makes an
unauthenticated request and verifies the response is appropriate.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent
RESULTS_DIR = ROOT / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

BASE_URL = os.environ.get("CAYO_URL", "https://www.cayobar.com").rstrip("/")
TIMEOUT = 10

PUBLIC_ROUTES = {
    "/api/availability",
    "/api/ping",
    "/api/auth/[...nextauth]",
    "/api/auth/session",
    "/api/auth/csrf",
    "/api/auth/providers",
    "/api/auth/signin",
    "/api/auth/signout",
}

LOGIN_ROUTES = {
    "/api/host/login",
    "/api/admin/login",
}

# Session-status routes: legitimately return 200 with `{authenticated: false}`
# for unauthenticated users. We verify the body shows a "not logged in" state
# to make sure it's actually a status check, not a data leak.
SESSION_STATUS_ROUTES = {
    "/api/admin/session",
    "/api/host/me",
}

# Query params to attach for routes that require them, so probing doesn't
# return 400 from missing params.
ROUTE_QUERY_PARAMS = {
    "/api/availability": "date=2099-12-31",
}

SKIP_ROUTES: set[str] = set()


def discover_routes():
    out = []
    api_dir = PROJECT_ROOT / "app" / "api"
    if not api_dir.exists():
        return out
    for p in sorted(api_dir.rglob("route.ts")):
        rel = p.relative_to(api_dir).parent
        url = "/api/" + str(rel).replace("\\", "/") if str(rel) != "." else "/api"
        out.append(url)
    return out


def url_with_params(path):
    if "[..." in path:
        if path == "/api/auth/[...nextauth]":
            return BASE_URL + "/api/auth/session"
        return None
    fake = "00000000-0000-0000-0000-000000000000"
    fixed = re.sub(r"\[[^\]]+\]", fake, path)
    qs = ROUTE_QUERY_PARAMS.get(path)
    return BASE_URL + fixed + (("?" + qs) if qs else "")


def probe(url, method="GET", timeout=TIMEOUT):
    started = time.perf_counter()
    headers = {"User-Agent": "CAYO-Site-Agent/1.0 (+probe)"}
    try:
        req = urllib.request.Request(url, method=method, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read(4096)
            elapsed = int((time.perf_counter() - started) * 1000)
            return {
                "url": url, "method": method, "status": resp.status,
                "elapsed_ms": elapsed, "ok": True,
                "body_preview": body.decode("utf-8", errors="replace")[:300],
            }
    except urllib.error.HTTPError as e:
        elapsed = int((time.perf_counter() - started) * 1000)
        try:
            body = e.read(4096).decode("utf-8", errors="replace")[:300]
        except Exception:
            body = ""
        return {
            "url": url, "method": method, "status": e.code,
            "elapsed_ms": elapsed, "ok": True, "body_preview": body,
        }
    except Exception as e:
        elapsed = int((time.perf_counter() - started) * 1000)
        return {
            "url": url, "method": method, "status": None,
            "elapsed_ms": elapsed, "ok": False, "error": str(e),
        }


def assess(route_path, response):
    if not response.get("ok"):
        return {
            "verdict": "error", "severity": "info",
            "reason": f"בקשה נכשלה ברמת רשת: {response.get('error')}",
        }

    status = response["status"]
    is_public = route_path in PUBLIC_ROUTES
    is_login = route_path in LOGIN_ROUTES
    is_admin = route_path.startswith("/api/admin/")
    is_host = route_path.startswith("/api/host/")

    if status is None:
        return {"verdict": "error", "severity": "info", "reason": "ללא קוד סטטוס."}

    if 500 <= status < 600:
        return {
            "verdict": "server_error", "severity": "high",
            "reason": f"שגיאת שרת ({status}) - חוסר טיפול בשגיאה או auth לקוי.",
        }

    if 200 <= status < 300:
        if is_public or is_login:
            return {"verdict": "ok", "severity": "info",
                    "reason": f"סטטוס {status} צפוי במסלול ציבורי."}
        if route_path in SESSION_STATUS_ROUTES:
            body = response.get("body_preview", "")
            unauth_markers = (
                '"authenticated":false', '"loggedIn":false',
                '"authenticated": false', '"loggedIn": false',
                '"user":null', '"session":null',
            )
            if any(m in body for m in unauth_markers):
                return {"verdict": "ok", "severity": "info",
                        "reason": "מסלול session-status - מחזיר 'לא מחובר' בלי דליפת מידע."}
            return {
                "verdict": "session_status_unexpected_body", "severity": "medium",
                "reason": f"מסלול session-status החזיר 200 אבל ה-body לא מצביע על 'לא מחובר': {body[:80]}",
            }
        return {
            "verdict": "auth_bypass_suspect", "severity": "high",
            "reason": f"מסלול מוגן החזיר {status} ללא auth - חשד לדליפת מידע או auth bypass.",
        }

    if status in (401, 403):
        if is_public:
            return {
                "verdict": "unexpected_protected", "severity": "low",
                "reason": f"מסלול שסומן כציבורי החזיר {status}.",
            }
        return {"verdict": "ok", "severity": "info",
                "reason": f"מסלול מוגן דחה ב-{status} - כצפוי."}

    if status == 405:
        return {"verdict": "ok", "severity": "info",
                "reason": "405 - שיטה לא מותרת, צפוי."}

    if status == 404:
        return {
            "verdict": "not_deployed", "severity": "low",
            "reason": "404 - מסלול לא נמצא בפרודקשן.",
        }

    if 300 <= status < 400:
        return {"verdict": "ok", "severity": "info", "reason": f"redirect ({status})"}

    return {
        "verdict": "unexpected", "severity": "medium",
        "reason": f"קוד תגובה לא צפוי: {status}",
    }


def main():
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    today = dt.date.today().isoformat()

    routes = discover_routes()
    print(f"[api_probe] discovered {len(routes)} routes; probing live site at {BASE_URL}")

    probes = []
    for path in routes:
        if path in SKIP_ROUTES:
            continue
        url = url_with_params(path)
        if url is None:
            probes.append({
                "path": path, "skipped": True,
                "reason": "לא ניתן לחשב URL בטוח",
            })
            continue
        resp = probe(url, "GET")
        verdict = assess(path, resp)
        probes.append({
            "path": path, "url": url, "method": "GET",
            "response": resp, **verdict,
        })

    bug_count = sum(1 for p in probes if p.get("severity") == "high")
    warn_count = sum(1 for p in probes if p.get("severity") == "medium")
    info_count = sum(1 for p in probes if p.get("severity") in (None, "info", "low"))

    out = {
        "started_at": started,
        "finished_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "date": today, "base_url": BASE_URL,
        "summary": {
            "routes_total": len(routes),
            "probed": sum(1 for p in probes if not p.get("skipped")),
            "skipped": sum(1 for p in probes if p.get("skipped")),
            "high_severity": bug_count,
            "medium_severity": warn_count,
            "info": info_count,
        },
        "probes": probes,
    }
    out_path = RESULTS_DIR / "api_probe.json"
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[api_probe] high={bug_count}, med={warn_count}, info={info_count}")
    print(f"  wrote {out_path}")


if __name__ == "__main__":
    main()
