#!/usr/bin/env python3
"""CAYO Bar - Static code review module."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent
RESULTS_DIR = ROOT / "results"
STATE_DIR = ROOT / "state"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)
STATE_DIR.mkdir(parents=True, exist_ok=True)

SCAN_GLOBS = [
    "app/admin/**/*.ts", "app/admin/**/*.tsx",
    "app/host/**/*.ts", "app/host/**/*.tsx",
    "app/api/**/*.ts", "lib/**/*.ts",
]

PUBLIC_API_ALLOWLIST = {
    "app/api/reservations/route.ts",
    "app/api/availability/route.ts",
    "app/api/ping/route.ts",
    "app/api/auth/[...nextauth]/route.ts",
    "app/api/host/login/route.ts",
    "app/api/admin/login/route.ts",
    "app/api/admin/session/route.ts",
}

# Routes where auth is enforced via a helper called inside each handler. We
# allowlist these because the heuristic walks function bodies and may not
# follow indirection into helpers like canAccess().
INDIRECT_AUTH_ALLOWLIST = {
    "app/api/admin/map/tables/[id]/route.ts",  # uses canAccess() -> isAdminRequest/isHostRequest
}

AUTH_PATTERNS = [
    r"\brequireAdmin\s*\(", r"\brequireHost\s*\(",
    r"\bisAdminRequest\s*\(", r"\bisHostRequest\s*\(",
    r"\bgetServerSession\s*\(", r"\bgetHostSession\s*\(",
    r"\bverifyHostCookie\s*\(", r"\bauthOptions\b",
    r"\bcanAccess\s*\(",  # local helper in some routes
    r"\bauthorizeReservationMutation\s*\(",  # reservation-specific gate
    r"\bgetHostEmployeeId\s*\(",  # returns id or null; routes 401 on null
    r"\bgetAdminEmployeeId\s*\(",
]

VALIDATION_PATTERNS = [r"\.parse\s*\(", r"\.safeParse\s*\(", r"\.validate\s*\(", r"zod", r"yup"]

CHECK_THEN_WRITE_READS = [
    "listReservations", "checkSlotAvailability", "computeUsageAt",
    "listActiveTables", "listAssignments", "getCapacityForSlot",
]
CHECK_THEN_WRITE_WRITES = [r"\.insert\s*\(", r"createReservation\s*\(", r"setAssignments\s*\(", r"\.upsert\s*\("]
TRANSACTIONAL_MARKERS = ["BEGIN", "transaction", "rpc(", "serializable", "FOR UPDATE", "advisory_lock"]

SECRET_PATTERN = re.compile(
    r"""(?:SECRET|TOKEN|API_KEY|PRIVATE_KEY|PASSWORD|CLIENT_SECRET)\s*[=:]\s*["']([A-Za-z0-9_\-]{16,})["']""",
    re.IGNORECASE,
)
DEV_FLAG_PATTERN = re.compile(r"\b(TODO|FIXME|HACK|XXX)\b[: ]?(.*)", re.IGNORECASE)
CONSOLE_PATTERN = re.compile(r"\bconsole\.(log|warn|error|debug)\s*\(")

# Forbidden brand phrases — these contradict PROJECT_FACTS.md.
# If they appear in user-visible text (UI strings, metadata, comments shown to
# end users), they need to be replaced. We scan for them in JSX/TSX text and
# in metadata definitions.
FORBIDDEN_PHRASES = [
    ("מסעדה", "CAYO הוא בר קוקטיילים, לא מסעדה. ראה PROJECT_FACTS.md סעיף 1."),
    ("תל אביב", "המיקום לא מאומת. אל תכתוב 'תל אביב' עד אישור ב-PROJECT_FACTS.md סעיף 2."),
    ("תל-אביב", "המיקום לא מאומת. אל תכתוב 'תל אביב' עד אישור ב-PROJECT_FACTS.md סעיף 2."),
]

SEEDED_FINDINGS = [
    {
        "id": "RACE-RESERVATION-INSERT", "rule": "CR1", "severity": "high",
        "file": "app/api/reservations/route.ts", "line_hint": 200,
        "title": "כפל הזמנות אפשרי תחת בקשות במקביל (TOCTOU)",
        "detail": (
            "ה-POST handler קורא ל-listReservations ובודק קיבולת לפני ה-insert, ללא נעילה או טרנזקציה. "
            "שתי בקשות במקביל עלולות לעבור את הבדיקה ולהכניס הזמנות חופפות. "
            "תיקון: לעטוף ב-Postgres function עם FOR UPDATE, או rpc יחיד שמבצע check+insert אטומי."
        ),
    },
    {
        "id": "RACE-TABLE-ASSIGN", "rule": "CR2", "severity": "high",
        "file": "lib/assignments-store.ts", "line_hint": 143,
        "title": "DELETE-then-INSERT ב-setAssignments ללא נעילה",
        "detail": (
            "setAssignments מבצע DELETE ואז INSERT ללא טרנזקציה. שני קוראים בו-זמנית "
            "יכולים להקצות אותה שולחן לשתי הזמנות. הקוד מתעד את הסיכון בהערה. "
            "תיקון: Postgres function עם advisory_lock."
        ),
    },
    {
        "id": "DUP-WAITLIST", "rule": "CR1", "severity": "medium",
        "file": "lib/waiting-list-store.ts", "line_hint": 88,
        "title": "אורח עלול להיות גם ברשימת המתנה וגם עם הזמנה מאושרת",
        "detail": (
            "addToWaitingList לא בודק שלאורח אין כבר הזמנה פעילה לאותו תאריך/שעה. "
            "תיקון: בדיקת אורח מול listReservations באותו slot, או UNIQUE constraint."
        ),
    },
]


@dataclass
class Finding:
    id: str
    rule: str
    severity: str
    file: str
    line_hint: int | None
    title: str
    detail: str
    snippet: str = ""
    is_new: bool = False


def iter_scan_files():
    seen = set()
    out = []
    for pattern in SCAN_GLOBS:
        for p in PROJECT_ROOT.glob(pattern):
            if p.is_file() and p not in seen:
                seen.add(p)
                out.append(p)
    return sorted(out)


def file_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rel(path):
    return str(path.relative_to(PROJECT_ROOT)).replace("\\", "/")


def read_text_safe(path):
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="replace")


def line_of(text, idx):
    return text.count("\n", 0, idx) + 1


EXPORT_FN_RE = re.compile(r"export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\s*\(")


def find_function_bodies(text):
    """Find body of each `export async function METHOD(...) { ... }`.

    Walks parens to find the close of the signature (handles destructured
    params like `{ params }: Params`), then walks braces for the body.
    """
    out = []
    for m in EXPORT_FN_RE.finditer(text):
        method = m.group(1)
        # m.end() is just after the opening '(' of the signature
        depth = 1
        k = m.end()
        while k < len(text) and depth > 0:
            ch = text[k]
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
            k += 1
        # k is now just after the closing ')' of the signature
        i = text.find("{", k)
        if i < 0:
            continue
        depth = 0
        j = i
        while j < len(text):
            ch = text[j]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        out.append((method, i, j + 1))
    return out


def cr1_check_then_write(path, text):
    findings = []
    write_re = re.compile("|".join(CHECK_THEN_WRITE_WRITES))
    bodies = find_function_bodies(text)
    for method, start, end in bodies:
        body = text[start:end]
        first_read_idx = -1
        first_read_token = None
        for tok in CHECK_THEN_WRITE_READS:
            i = body.find(tok)
            if i >= 0 and (first_read_idx < 0 or i < first_read_idx):
                first_read_idx = i
                first_read_token = tok
        write_match = write_re.search(body)
        if first_read_idx < 0 or not write_match:
            continue
        if write_match.start() <= first_read_idx:
            continue
        between = body[first_read_idx:write_match.start()]
        if any(t in between for t in TRANSACTIONAL_MARKERS):
            continue
        line = line_of(text, start + first_read_idx)
        snippet = body[max(0, first_read_idx - 60):first_read_idx + 200].strip()
        findings.append(Finding(
            id=f"CR1-{rel(path)}-{method}-{line}",
            rule="CR1", severity="high", file=rel(path), line_hint=line,
            title=f"TOCTOU: {first_read_token} ואז כתיבה ללא נעילה ב-{method}",
            detail=(
                f"בפונקציה {method} של {rel(path)} מתבצעת קריאה ואז כתיבה ללא טרנזקציה. "
                "תחת קריאות במקביל, שתי בקשות יכולות לעבור את הבדיקה ולכתוב ערכים סותרים."
            ),
            snippet=snippet[:280],
        ))
    return findings


def cr2_delete_then_insert(path, text):
    findings = []
    bodies = find_function_bodies(text) or [("(top-level)", 0, len(text))]
    if rel(path).startswith("lib/"):
        bodies = [("(module)", 0, len(text))]
    delete_re = re.compile(r"\.delete\s*\(")
    insert_re = re.compile(r"\.insert\s*\(")
    for method, start, end in bodies:
        body = text[start:end]
        del_m = delete_re.search(body)
        ins_m = insert_re.search(body)
        if not del_m or not ins_m or ins_m.start() <= del_m.end():
            continue
        between = body[del_m.end():ins_m.start()]
        if any(t in between for t in TRANSACTIONAL_MARKERS):
            continue
        line = line_of(text, start + del_m.start())
        snippet = body[max(0, del_m.start() - 40):ins_m.end() + 80].strip()
        findings.append(Finding(
            id=f"CR2-{rel(path)}-{method}-{line}",
            rule="CR2", severity="high", file=rel(path), line_hint=line,
            title=f"DELETE-then-INSERT ללא טרנזקציה ב-{method}",
            detail=(
                f"בפונקציה {method} של {rel(path)} יש .delete(...) ואז .insert(...) ללא טרנזקציה. "
                "זהו הדפוס שמאפשר כפל-שיוך תחת קריאות מקביליות."
            ),
            snippet=snippet[:280],
        ))
    return findings


def cr3_missing_auth(path, text):
    findings = []
    rel_path = rel(path)
    if not (rel_path.startswith("app/api/") and rel_path.endswith("/route.ts")):
        return findings
    if rel_path in PUBLIC_API_ALLOWLIST or rel_path in INDIRECT_AUTH_ALLOWLIST:
        return findings
    is_admin_path = rel_path.startswith("app/api/admin/")
    is_host_path = rel_path.startswith("app/api/host/")
    bodies = find_function_bodies(text)
    auth_re = re.compile("|".join(AUTH_PATTERNS))
    for method, start, end in bodies:
        body = text[start:end]
        if auth_re.search(body):
            continue
        line = line_of(text, start)
        sev = "high" if (is_admin_path or is_host_path) else "medium"
        findings.append(Finding(
            id=f"CR3-{rel_path}-{method}",
            rule="CR3", severity=sev, file=rel_path, line_hint=line,
            title=f"חסרה בדיקת auth ב-{method} של {rel_path}",
            detail=(
                "לא נמצאה קריאה לאחת מהפונקציות: requireAdmin, requireHost, "
                "isAdminRequest, isHostRequest, getServerSession, getHostSession, "
                "verifyHostCookie, canAccess. יש לוודא שהמסלול דורש זיהוי "
                "או להוסיפו ל-PUBLIC_API_ALLOWLIST / INDIRECT_AUTH_ALLOWLIST."
            ),
        ))
    return findings


def cr4_hardcoded_secrets(path, text):
    findings = []
    if path.name.startswith(".env"):
        return findings
    for m in SECRET_PATTERN.finditer(text):
        line = line_of(text, m.start())
        findings.append(Finding(
            id=f"CR4-{rel(path)}-{line}",
            rule="CR4", severity="high", file=rel(path), line_hint=line,
            title="literal שנראה כסוד מקודד-קשה",
            detail="נמצאה הקצאה שנראית כסוד עם ערך > 16 תווים. יש להעביר ל-environment variable.",
            snippet=text[max(0, m.start() - 20):m.end() + 20],
        ))
    return findings


def cr5_dev_flags(path, text):
    findings = []
    for m in DEV_FLAG_PATTERN.finditer(text):
        line = line_of(text, m.start())
        flag, msg = m.group(1).upper(), m.group(2).strip() or "(ללא טקסט)"
        findings.append(Finding(
            id=f"CR5-{rel(path)}-{line}",
            rule="CR5", severity="low", file=rel(path), line_hint=line,
            title=f"{flag}: {msg[:80]}",
            detail=f"{flag} שדורש מעקב.",
            snippet=text[max(0, m.start() - 20):m.end() + 60].strip(),
        ))
    return findings


def cr7_no_validation(path, text):
    findings = []
    rel_path = rel(path)
    if not (rel_path.startswith("app/api/") and rel_path.endswith("/route.ts")):
        return findings
    bodies = find_function_bodies(text)
    val_re = re.compile("|".join(VALIDATION_PATTERNS))
    write_re = re.compile("|".join(CHECK_THEN_WRITE_WRITES))
    for method, start, end in bodies:
        if method not in ("POST", "PATCH", "PUT"):
            continue
        body = text[start:end]
        if write_re.search(body) and not val_re.search(body):
            line = line_of(text, start)
            findings.append(Finding(
                id=f"CR7-{rel_path}-{method}",
                rule="CR7", severity="medium", file=rel_path, line_hint=line,
                title=f"{method} ב-{rel_path} כותב ל-DB ללא input validation",
                detail="לא נמצאה קריאה ל-zod/yup/.parse/.safeParse לפני כתיבה.",
            ))
    return findings


def cr6_console_count(text):
    return len(CONSOLE_PATTERN.findall(text))


def cr8_forbidden_phrases(path, text):
    """Flag occurrences of phrases that contradict PROJECT_FACTS.md."""
    findings = []
    rel_path = rel(path)
    if "PROJECT_FACTS" in rel_path or "site-agent/" in rel_path:
        return findings
    for phrase, reason in FORBIDDEN_PHRASES:
        idx = text.find(phrase)
        if idx < 0:
            continue
        line = line_of(text, idx)
        snippet_start = max(0, idx - 40)
        snippet = text[snippet_start:idx + len(phrase) + 40].replace("\n", " ").strip()
        findings.append(Finding(
            id=f"CR8-{rel_path}-{phrase}-{line}",
            rule="CR8",
            severity="medium",
            file=rel_path,
            line_hint=line,
            title=f"ביטוי שגוי שמופיע בקוד: \"{phrase}\"",
            detail=reason,
            snippet=snippet[:240],
        ))
    return findings


def main():
    today = dt.date.today().isoformat()
    started = dt.datetime.now(dt.timezone.utc).isoformat()

    files = iter_scan_files()
    print(f"[code_review] scanning {len(files)} files...")

    state_path = STATE_DIR / "code_review_state.json"
    prev_state = {}
    if state_path.exists():
        try:
            prev_state = json.loads(state_path.read_text(encoding="utf-8"))
        except Exception:
            prev_state = {}
    prev_findings_by_id = {f["id"]: f for f in prev_state.get("findings", [])}

    new_hashes = {}
    findings = []
    console_total = 0
    ts_count = 0
    tsx_count = 0

    for p in files:
        rel_p = rel(p)
        try:
            text = read_text_safe(p)
        except Exception as e:
            print(f"  skip {rel_p}: {e}", file=sys.stderr)
            continue
        new_hashes[rel_p] = file_hash(p)
        if p.suffix == ".tsx":
            tsx_count += 1
        else:
            ts_count += 1
        console_total += cr6_console_count(text)
        findings.extend(cr1_check_then_write(p, text))
        findings.extend(cr2_delete_then_insert(p, text))
        findings.extend(cr3_missing_auth(p, text))
        findings.extend(cr4_hardcoded_secrets(p, text))
        findings.extend(cr5_dev_flags(p, text))
        findings.extend(cr7_no_validation(p, text))
        findings.extend(cr8_forbidden_phrases(p, text))

    for sf in SEEDED_FINDINGS:
        target = PROJECT_ROOT / sf["file"]
        if not target.exists():
            continue
        if any(f.file == sf["file"] and f.rule == sf["rule"] for f in findings):
            continue
        findings.append(Finding(**sf))

    current_ids = {f.id for f in findings}
    for f in findings:
        f.is_new = f.id not in prev_findings_by_id
    closed_ids = [fid for fid in prev_findings_by_id if fid not in current_ids]

    by_severity = {"high": 0, "medium": 0, "low": 0, "info": 0}
    for f in findings:
        by_severity[f.severity] = by_severity.get(f.severity, 0) + 1

    by_file = {}
    for f in findings:
        by_file.setdefault(f.file, []).append(asdict(f))

    sev_order = {"high": 0, "medium": 1, "low": 2, "info": 3}
    sorted_findings = sorted(findings, key=lambda x: (sev_order.get(x.severity, 9), x.file, x.line_hint or 0))

    summary = {
        "findings_total": len(findings),
        "by_severity": by_severity,
        "new_today": sum(1 for f in findings if f.is_new),
        "closed_since_yesterday": len(closed_ids),
        "console_calls_total": console_total,
    }

    result = {
        "started_at": started,
        "finished_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "date": today,
        "scanned": {"files_total": len(files), "ts": ts_count, "tsx": tsx_count},
        "summary": summary,
        "findings": [asdict(f) for f in sorted_findings],
        "findings_by_file": by_file,
        "closed_ids": closed_ids,
    }

    out = RESULTS_DIR / "code_review.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    state_path.write_text(json.dumps({
        "hashes": new_hashes,
        "findings": [asdict(f) for f in findings],
        "updated_at": started,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    high = by_severity["high"]
    med = by_severity["medium"]
    low = by_severity["low"]
    new_count = summary["new_today"]
    print(f"[code_review] {len(findings)} findings (high={high}, med={med}, low={low}, new={new_count})")
    print(f"  wrote {out}")


if __name__ == "__main__":
    main()
