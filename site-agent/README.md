# CAYO Site Agent

סוכן יומי שבודק את `https://www.cayobar.com` ומפיק דו"ח Word בעברית.

## מה הסוכן בודק

| תחום | מה נבדק | איך |
|------|---------|-----|
| פונקציונליות (E2E) | סטטוס HTTP, redirect ל-www, HTTPS, title/lang/meta, OG tags, H1, תמונות שבורות, קישורים שבורים, זמן תגובה | `urllib` + `html.parser` |
| ביצועים | ציון Lighthouse, LCP, FCP, CLS, TBT, TTI — מובייל ודסקטופ | Google PageSpeed Insights API |
| נגישות | ציון a11y של Lighthouse + פירוט audits כושלים | Lighthouse דרך PSI |
| ויזואלי / רגרסיה | הפרש תפיסתי (perceptual hash) בין צילום היום לבייסליין | `Pillow` |
| **סקירת קוד סטטית** | TOCTOU (כפל הזמנות), DELETE-then-INSERT (כפל-שיוך שולחנות), חוסר auth ב-API routes, validation חסר, hardcoded secrets, TODO/FIXME | `code_review.py` (ללא תלויות) |
| **בדיקת API surface** | ניסיון לקרוא לכל מסלול ב-app/api/** ללא הרשאה, ובדיקה שמחזיר 401/403 ולא 200/500 | `api_probe.py` |

## כללי סקירת קוד (code_review.py)

| כלל | תיאור | חומרה |
|-----|-------|-------|
| CR1 | TOCTOU: read-then-write ללא טרנזקציה (כמו checkSlotAvailability → insert) | HIGH |
| CR2 | DELETE-then-INSERT באותה פונקציה ללא נעילה | HIGH |
| CR3 | API route ללא auth (admin/host paths) | HIGH/MEDIUM |
| CR4 | סוד מקודד-קשה (TOKEN/SECRET/PASSWORD) | HIGH |
| CR5 | TODO/FIXME/HACK/XXX | LOW |
| CR7 | POST/PATCH ללא input validation (zod/yup) | MEDIUM |

## פלט

- `results/results-YYYY-MM-DD.json` — תוצאות גולמיות של live-site לכל יום
- `results/latest.json` — הריצה האחרונה של agent.py
- `results/code_review.json` — ממצאי סקירת קוד (כולל בידול חדש/קיים)
- `results/api_probe.json` — תוצאות בדיקת API
- `state/code_review_state.json` — hash של קבצים לזיהוי שינויים בין ימים
- `screenshots/YYYY-MM-DD.png` — צילום מסך מ-Lighthouse
- `baselines/baseline.png` — בייסליין ויזואלי
- `reports/cayo-site-report-YYYY-MM-DD.docx` — דוח Word יומי
- `reports/cayo-site-report-latest.docx` — תמיד הדו"ח האחרון

## הרצה ידנית

```bash
cd C:\dev\cayo\site-agent
bash run.sh
# או צעד-צעד:
python3 agent.py && python3 code_review.py && python3 api_probe.py && python3 generate_report.py
```

## תזמון

המשימה רצה אוטומטית כל יום ב-09:00 שעון ישראל דרך `Settings → Scheduled Tasks` של Cowork.

## תלויות

- Python 3 עם `Pillow` ו-`python-docx`
- אין צורך ב-Node, Playwright, Chrome — הסוכן רץ דרך API חיצוני (PageSpeed Insights)

## דרישות רשת (allowlist)

הסוכן רץ בסנדבוקס המוגבל של Cowork. כדי שיוכל לגשת לאתר, יש להוסיף ל-allowlist (Settings → Capabilities):

- `cayobar.com`
- `www.cayobar.com`
- `*.googleapis.com` (PSI מתבצע דרך `www.googleapis.com`, אז `googleapis.com` לבדו לא מספיק)

## משתני סביבה אופציונליים

- `CAYO_URL` — לדריסת הכתובת שנבדקת (ברירת מחדל: `https://www.cayobar.com`)
- `PAGESPEED_API_KEY` — להעלאת מכסת ה-API של PSI (לא חובה לשימוש מתון)
