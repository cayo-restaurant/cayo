# CAYO Bar — דוח בדיקת תקינות
**תאריך:** 2026-04-21T23:54:19.524Z (UTC) / 2026-04-22 בישראל
**סטטוס כללי:** ✅ תקין

## סיכום מנהלים
17 ✅ עברו, 0 ⚠️ אזהרות, 0 ❌ כשלים. האתר פעיל, מוגש ב-HTTPS, התוכן ומילות המפתח תואמים לציפייה של דף "בקרוב" בעברית, והביצועים מצוינים (טעינה מלאה ב-560ms, TTFB 59ms). כל 13 בקשות הרשת החזירו 200 ואין שגיאות קונסול.

## מטריקות מפתח
| מדד | ערך | יעד | סטטוס |
|-----|-----|-----|-------|
| זמן טעינה מלא | 560ms | <3000ms (יעד <1500ms) | ✅ |
| TTFB | 59ms | <800ms | ✅ |
| DOMContentLoaded | 336ms | <2000ms | ✅ |
| גודל העברה (מסמך ראשי) | 300B | <2MB | ✅ |
| קוד HTTP (מסמך ראשי) | 200 | 200 | ✅ |
| משאבים איטיים (>500ms) | 0 | ≤3 | ✅ |
| סך בקשות רשת | 13 | — | — |
| סך משאבים ב-Performance API | 12 | — | — |

## זמינות
- הדף נטען בהצלחה; הכותרת בטאב: `CAYO | בקרוב`.
- כתובת סופית: `https://www.cayobar.com/` — הוגשה דרך **HTTPS** עם redirect אוטומטי מ-`cayobar.com` אל `www.cayobar.com`.
- בקשת המסמך הראשית: `GET https://www.cayobar.com/` → **200 OK**.
- לא זוהו דפי שגיאה (4xx/5xx).

## תוכן ומילות מפתח
| בדיקה | ערך בפועל | סטטוס |
|---|---|---|
| `title` מכיל "CAYO" | `CAYO \| בקרוב` | ✅ |
| `title` מכיל "בקרוב" | `CAYO \| בקרוב` | ✅ |
| `lang` = "he" | `he` | ✅ |
| `metaDesc` קיים ולא ריק | `CAYO — מסעדה ובר. פתיחה בקרוב.` | ✅ |
| `ogTitle` קיים | `CAYO \| בר קוקטיילים` | ✅ |
| `h1` מכיל "CAYO" | `["CAYO"]` | ✅ |
| `bodyText` מכיל "מסעדה ובר" | נמצא | ✅ |
| `bodyText` מכיל "בקרוב" | נמצא | ✅ |
| `bodyTextLen` > 50 | 165 | ✅ |

טקסט מלא של ה-body:
```
CAYO
מסעדה ובר · בקרוב
אנחנו עובדים על חוויה חדשה עבורכם.
נשמח לראותכם בקרוב.
תפריט ניהול
CAYO
ניהול הזמנות
מצב מארחת
מפת מסעדה
דשבורד
עובדים
סידור
יציאה מניהול
```

הערה: `og:image` לא קיים (`null`). לא מופיע באסרשנים אבל כדאי להוסיף תמונת Open Graph כדי לשפר תצוגת הלינק ברשתות חברתיות.

## ביצועים
- `loadEventEnd`: **560ms** (מתחת ליעד האופטימלי של 1500ms).
- `ttfb`: **59ms** — מצוין.
- `domContentLoaded`: **336ms**.
- `transferSize` של המסמך: 300B; `encodedBodySize` 2.6KB; `decodedBodySize` 8.1KB.
- **אפס** משאבים איטיים (>500ms) מתוך 12 משאבים.
- פירוק המשאבים: גופן WOFF2 ×2, CSS ×1, JS chunks של Next.js ×7, ושני קריאות API (`/api/admin/session`, `/api/auth/session`).

## פונקציונליות
- אלמנט אינטראקטיבי שזוהה בעת הרצת `read_page` עם מסנן `interactive`: `button "תפריט ניהול"` — ✅ קיים כמצופה.
- **אין תמונות שבורות** (`imgCount=0`, `brokenImages=[]`).
- 6 קישורים, 0 טפסים, 0 תמונות — עקבי עם דף "בקרוב" מינימליסטי.

## שגיאות ואזהרות
### שגיאות קונסול
ללא. (`read_console_messages` עם `onlyErrors: true` ו-`pattern: ".*"` לא החזיר ממצאים אחרי טעינה מחודשת.)

### בקשות רשת כושלות
ללא. כל 13 הבקשות החזירו `status 200`:
1. `GET https://www.cayobar.com/` → 200
2. `GET /_next/static/media/d2e3c073bbb3955e-s.p.woff2` → 200
3. `GET /_next/static/media/ec516af01d950ed6-s.p.woff2` → 200
4. `GET /_next/static/css/d257b9d6f6424da4.css` → 200
5. `GET /_next/static/chunks/webpack-3701e5a74d317cfd.js` → 200
6. `GET /_next/static/chunks/fd9d1056-e3d373074663785d.js` → 200
7. `GET /_next/static/chunks/117-14dd35a9dd2203e1.js` → 200
8. `GET /_next/static/chunks/main-app-2dcde4753ea0d175.js` → 200
9. `GET /_next/static/chunks/972-e0f47e4c479dc526.js` → 200
10. `GET /_next/static/chunks/39-5d2ba80ed41cdc64.js` → 200
11. `GET /_next/static/chunks/app/layout-f16d719f724b06c4.js` → 200
12. `GET /api/admin/session` → 200
13. `GET /api/auth/session` → 200

## ממצאים מפורטים
- **אין כשלים פונקציונליים**. כל 17 האסרשנים שהוגדרו במפרט הבדיקה עברו.
- **המלצה אופציונלית (לא כשל)**: להוסיף מטא-תגית `og:image` (כיום `null`) כדי שכאשר משתפים את `cayobar.com` ב-WhatsApp/Facebook/Twitter תופיע תמונת תצוגה מקדימה. דוגמה:
  ```html
  <meta property="og:image" content="https://www.cayobar.com/og-image.jpg" />
  ```
- **תצפית**: העמוד קורא ל-`/api/admin/session` ול-`/api/auth/session` גם למבקרים אנונימיים. שתי הקריאות מחזירות 200 ולא מפירות את דף ה-"בקרוב", אבל שווה לוודא ששתי ה-endpoints האלה אמורים להיות פומביים (או שהן מסתיימות עם JSON ריק עבור משתמשים לא מחוברים). אין בכך כשל — זה עקבי עם הארכיטקטורה הקיימת.

## נתונים גולמיים

### מדדי JavaScript שנאספו
```json
{
  "finalUrl": "https://www.cayobar.com/",
  "title": "CAYO | בקרוב",
  "lang": "he",
  "metaDesc": "CAYO — מסעדה ובר. פתיחה בקרוב.",
  "ogTitle": "CAYO | בר קוקטיילים",
  "ogImage": null,
  "h1": ["CAYO"],
  "h2": [],
  "linkCount": 6,
  "imgCount": 0,
  "formCount": 0,
  "brokenImages": [],
  "bodyTextLen": 165,
  "nav": [{
    "type": "navigate",
    "duration": 560,
    "ttfb": 59,
    "domContentLoaded": 336,
    "loadEvent": 560,
    "transferSize": 300,
    "encodedBodySize": 2601,
    "decodedBodySize": 8090
  }],
  "resourceCount": 12,
  "slowResources": [],
  "ts": "2026-04-21T23:54:19.524Z"
}
```

### סיכום רשת
- סך בקשות: 13
- בקשות שנכשלו (status ≥ 400): 0
- בקשות API: 2 (`/api/admin/session`, `/api/auth/session`) — שתיהן 200

### אלמנטים אינטראקטיביים
- `button "תפריט ניהול"` (ref_1) — נוכח
