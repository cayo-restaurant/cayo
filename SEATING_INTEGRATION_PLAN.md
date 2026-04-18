# תכנון אינטגרציה: הזמנות ↔ מפת מקומות (Shift Mode)

**תאריך:** 2026-04-18
**קהל יעד ראשי:** המארחת במהלך משמרת פעילה (טאבלט 10-12″, סמארטפון עזר)
**עקרון מנחה:** שליטה ידנית מלאה של המארחת על מי יושב איפה.

---

## 1. סיכום כל ההחלטות

| תחום | החלטה |
|---|---|
| **שיוך הזמנה לשולחן** | ידני בלבד — המארחת משייכת כל הזמנה בעצמה |
| **קיבולת בזמן הזמנה** | ללא שינוי — סה״כ ראשים לפי `BAR_CAPACITY` / `TABLE_CAPACITY` |
| **שולחנות משולבים** | הזמנה יכולה להיות על 2+ שולחנות (junction table טהורה) |
| **שחרור שולחן** | כפתור ידני "פינה את השולחן" → סטטוס `completed` |
| **ביטול / no-show** | `table_id` נשמר בהיסטוריה, אבל ההזמנה מוסתרת מהמפה |
| **Walk-ins** | לחיצה על שולחן פנוי במפה → "הושב walk-in" → טופס מיני (שם + כמות) |
| **Picker** | מפה מיניאטורית ב-modal; שולחן נחשב פנוי אם הוא פנוי גם בחלון ההזמנה **וגם** ברגע הנוכחי |
| **עריכת מפה (הזזת שולחנות)** | owner בלבד; המארחת רואה read-only |
| **אזהרות רכות** | badge בכרטיס + פס סיכום ("3 הזמנות דורשות תשומת לב") בראש העמוד |
| **מעבר יום (04:00)** | אוטומטי לפי Asia/Jerusalem — המפה מראה את היום האקטיבי |
| **Undo** | toast של 5 שניות אחרי כל mutation (`בוצעה: שולחן 7 פונה. [בטל]`) |
| **רשימה ב-/admin** | `completed` מוסתר ברירת מחדל, כפתור "הצג סיימו (מס׳)" חושף |
| **סנכרון real-time** | נשאר polling 60s (משתמשת אחת בו-זמנית) |
| **אתר ציבורי ללקוחות** | ללא שינוי |

---

## 2. מודל נתונים

### 2.1. שינויים במסד

**א. טבלה חדשה — `reservation_tables` (junction)**
```sql
create table reservation_tables (
  reservation_id uuid not null references reservations(id) on delete cascade,
  table_id uuid not null references restaurant_tables(id) on delete restrict,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (reservation_id, table_id)
);

-- רק שיוך ראשי אחד פר הזמנה
create unique index reservation_tables_primary_idx
  on reservation_tables(reservation_id)
  where is_primary = true;

-- חיפוש מהיר "מי בשולחן הזה?"
create index reservation_tables_table_idx on reservation_tables(table_id);
```

**ב. סטטוס חדש — `completed`**
```sql
-- עדכון ה-check constraint ב-reservations.status
alter table reservations
  drop constraint if exists reservations_status_check;
alter table reservations
  add constraint reservations_status_check
  check (status in ('pending','confirmed','cancelled','arrived','no_show','completed'));
```

**ג. migration של נתונים קיימים**
```sql
-- להעביר כל reservations.table_id קיים ל-junction
insert into reservation_tables (reservation_id, table_id, is_primary)
select id, table_id, true from reservations where table_id is not null;

-- (לא מוחקים את העמודה עדיין — phase 2, אחרי שכל הקוד עובד מ-junction)
```

### 2.2. מה לא משתנה
- `restaurant_tables` נשאר כפי שהוא
- `BAR_CAPACITY` / `TABLE_CAPACITY` / `MAX_BAR_PARTY` נשארים
- `RESERVATION_DURATION_MINUTES=120` נשאר
- לוגיקת capacity ב-`lib/capacity.ts` — **אין שינוי**
- האתר הציבורי (/app/page.tsx) — **אין שינוי**

---

## 3. זרימות המשתמשת (hostess)

### 3.1. שיוך הזמנה עתידית

1. המארחת רואה כרטיס הזמנה `יעל, 20:00, 4 אנשים, שולחן`
2. ליד הסטטוס: `⚠ ללא שולחן  [שייך]`
3. לחיצה על `[שייך]` → פותח `TablePickerModal`
4. מוצגת מפה מיניאטורית עם כל השולחנות, צבועים:
   - **אפור בהיר** — פנוי
   - **כהה/מלא** — תפוס בחלון ההזמנה (לא ניתן ללחיצה, אבל כן ניתן לבחירה אם לוחצים על החי — soft only)
   - **מסגרת ענבר** — תפוס כרגע אבל פנוי בחלון ההזמנה (או להפך)
5. לחיצה על שולחן → בחירה; `הצג אזהרות` אם יש oversize/אזור
6. `[שמור]` → `PATCH /api/reservations/[id]/tables` → toast `בוצעה: שולחן 7 שויך. [בטל]`

### 3.2. שיוך רב-שולחני

1. השיוך הראשון עובד כרגיל
2. אחרי שמירה, הכרטיס מציג `🪑 שולחן 7` + כפתור קטן `+` לצידו
3. לחיצה על `+` → אותו picker, אבל עם אזהרה "תוספת לשולחן 7"
4. בחירת שולחן נוסף → נוצרת רשומה שנייה ב-junction עם `is_primary=false`
5. הכרטיס מציג `🪑 שולחן 7 + שולחן 8`

### 3.3. הגעת הלקוח

1. המארחת לוחצת `[הגיעו]` על הכרטיס
2. `status='arrived'` (לא נוגעים ב-`table_id` / junction)
3. במפה: שולחן 7 הופך **ירוק**
4. אם ההזמנה בלי שיוך — אזהרה (`שייך שולחן לפני שמסמנים הגיעו`), אבל לא חוסם

### 3.4. פינוי שולחן

1. המארחת לוחצת `[פינה את השולחן]` בכרטיס או במפה (פופאובר)
2. `status='completed'` + junction נשאר (היסטוריה)
3. במפה: שולחן חוזר מיד ל**אפור** (לפי ההחלטה "מיידי, בלי השהיה")
4. toast `בוצעה: שולחן 7 פונה. [בטל]` — לחיצה על בטל מחזירה ל-`arrived`

### 3.5. Walk-in

1. המארחת רואה במפה שולחן פנוי
2. לחיצה על השולחן → פופאובר → `[הושב walk-in]`
3. פותח טופס מיני:
   ```
   ┌──────────────────────┐
   │ Walk-in — שולחן 5    │
   │ שם: [___________]    │
   │ כמות: [– 2 +]        │
   │                      │
   │ [בטל]   [הושב]       │
   └──────────────────────┘
   ```
4. לחיצה `הושב` → יוצרת `reservation` חדשה:
   - `name` מהטופס, `guests` מהטופס
   - `time = now()`, `date = shift_day_now()`
   - `area = table.area`, `status = 'arrived'`, `is_walk_in = true`
   - `phone = ''`, `email = ''`, `terms = true`, `notes = 'walk-in'`
5. יוצרת רשומה ב-`reservation_tables` עם `is_primary=true`
6. השולחן הופך ירוק מיד

### 3.6. ביטול / no-show

1. לחיצה `[בטל]` או `[לא הגיעו]` → `status` משתנה; junction נשאר לא נגוע
2. במפה: השולחן משתחרר (מתעלם מהזמנה עם `status IN ('cancelled','no_show','completed')`)
3. בדוחות אפשר יהיה לראות "ההזמנה ההיא הייתה משויכת לשולחן 7" — שימושי לדיבוג

---

## 4. תצוגות

### 4.1. רשימת /admin (ראשית, לא משתנה הרבה)

**שינויים בכרטיס הזמנה:**

```
┌─────────────────────────────────────────────┐
│ יעל כהן · 20:00 · 4 · שולחן · [CONFIRMED]   │
│ 050-1234567                                  │
│                                              │
│ 🪑 שולחן 7  [ערוך]  [+]  ⚠ חפיפה עם דני     │  ← שורה חדשה
│                                              │
│ [הגיעו] [לא הגיעו] [בטל] [✎] [🗑]           │
└─────────────────────────────────────────────┘
```

**פס סיכום בראש העמוד:**
```
⚠ 3 הזמנות דורשות תשומת לב — 2 ללא שולחן, 1 חפיפה  [פרט]
```
לחיצה על `[פרט]` גוללת / מדגישה את הכרטיסים הרלוונטיים.

**כפתור חדש בסרגל:**
`[מעבר למפה]` — פותח את /admin/map במצב shift.

**סינון ברירת מחדל:**
`completed` מוסתר. כפתור "הצג סיימו (4)" למעלה — מחליף toggle.

### 4.2. /admin/map — מצב shift (הרחבה של read mode הקיים)

**צבעי שולחנות דינמיים:**
| מצב | צבע | משמעות |
|---|---|---|
| Gray `#e5e7eb` | פנוי (אין הזמנה פעילה) | מותר ללחיצה → פופאובר עם `[הושב walk-in]` |
| Amber `#f59e0b` | הזמנה משויכת, טרם הגיעו | לחיצה → פרטי ההזמנה + `[הגיעו]` |
| Green `#10b981` | ישובים (`status=arrived`) | לחיצה → `[פינה את השולחן]` + `[שנה שולחן]` |
| Red `#ef4444` | סתירה: חפיפה / oversize / אזור | לחיצה → פירוט הבעיה |

**טקסט על השולחן:**
```
┌──────────┐
│ שולחן 7  │
│ יעל · 4  │       ← הזמנה נוכחית (amber/green)
│ הבאה     │
│ 21:30    │       ← "next" indicator (רק אם יש עוד הזמנה ב-3 שעות הקרובות)
└──────────┘
```

**Popover (לחיצה על שולחן):**
- מפרט את ההזמנה/ות בחלון של ±3 שעות
- כפתורי פעולה מהירים (הגיעו / פינה / שנה שולחן / בטל שיוך)
- קישור `[פתח הזמנה ברשימה]` (scroll-to בדף /admin)

**הרשאות:**
- כולם רואים read-mode
- גרירת שולחנות (edit-mode) זמינה **רק ל-owner**, מוסתרת אחרת
  - אכיפה בשכבת API (`/api/admin/map/tables` בודק `session.user.role === 'owner'`)
  - כרגע כולם `admin` — נצטרך להוסיף role-based אכיפה (אפשר להתחיל עם רשימת emails סגורה)

---

## 5. API

### 5.1. endpoints חדשים

**`POST /api/reservations/[id]/tables`**
```ts
body: { tableIds: string[]; primaryTableId: string }
response: { warnings: ('overlap' | 'oversize' | 'wrong_area')[], tables: Table[] }
```
- מחליף את כל השיוכים הנוכחיים
- אם `primaryTableId` לא ב-`tableIds` → 400
- אם שולחן לא קיים / לא פעיל → 404

**`DELETE /api/reservations/[id]/tables`**
- מנקה את כל השיוכים

**`POST /api/walk-ins`**
```ts
body: { name: string; guests: number; tableId: string }
response: { reservationId: string }
```
- יוצר הזמנה עם `is_walk_in=true, status='arrived'`
- יוצר רשומה ב-`reservation_tables`

**`PATCH /api/reservations/[id]/complete`**
```ts
body: { }
response: { ok: true }
```
- `status = 'completed'`
- junction **לא** נמחק

### 5.2. endpoints קיימים שמשתנים

**`GET /api/reservations`** — תוספת `tables` לתשובה:
```ts
interface ReservationResponse {
  ...existing fields,
  tables: Array<{ id: string; label: string; number: number; isPrimary: boolean }>
}
```
join קל מול junction + `restaurant_tables`.

**`PATCH /api/reservations/[id]`** — אם `status='cancelled'|'no_show'|'completed'` מועבר, לא נוגעים ב-junction (בניגוד לגישה הישנה של auto-null).

---

## 6. לוגיקת זמינות ואזהרות

### 6.1. "שולחן פנוי" ב-picker (חישוב)

עבור הזמנה `R` עם זמן `R.time` ושולחן `T`, השולחן נחשב **פנוי** אם:

1. **בחלון ההזמנה** `[R.time, R.time + 120min)`: אין אף הזמנה אחרת `R'` עם:
   - `R'.id != R.id`
   - `R'.status IN ('pending','confirmed','arrived')`
   - `R'` משויכת ל-`T` (דרך junction)
   - חפיפת חלונות `[R'.time, R'.time + 120min)` עם חלון של `R`

2. **וגם בחלון הנוכחי** `[now, now + 120min)`: לא תפוס ע״י `arrived` אחר

אם התנאי הראשון בלבד מתקיים אבל לא השני — הצגה כ**מסגרת ענבר** (`פנוי לזמן זה, תפוס כרגע`).

### 6.2. אזהרות (`detectWarnings` ב-`lib/assignments.ts`)

```ts
type AssignmentWarning =
  | { kind: 'overlap'; withReservationId: string; withTime: string }
  | { kind: 'oversize'; tableCapacityMax: number; reservationGuests: number }
  | { kind: 'wrong_area'; tableArea: 'bar'|'table'; reservationArea: 'bar'|'table' };

function detectWarnings(
  reservation: Reservation,
  assignedTables: Table[],
  allReservations: Reservation[]
): AssignmentWarning[]
```

חישוב client-side על הנתונים הטעונים. לא מצריך DB hits חדשים.

### 6.3. סיכום בראש עמוד `/admin`

שאילתא בצד הלקוח:
```ts
const needsAttention = reservations.filter(r => {
  if (['cancelled','no_show','completed'].includes(r.status)) return false;
  if (isUpcomingTonight(r) && r.tables.length === 0) return true;
  if (detectWarnings(r, r.tables, reservations).length > 0) return true;
  return false;
});
```
פס סיכום:
```
⚠ {needsAttention.length} הזמנות דורשות תשומת לב
   {countNoTable} ללא שולחן · {countOverlap} חפיפה · {countOversize} קיבולת
   [פרט]
```

---

## 7. Undo

תשתית פשוטה ב-/admin:

```ts
type PendingUndo = {
  id: string;
  message: string;        // "שולחן 7 פונה"
  expiresAt: number;      // Date.now() + 5000
  revert: () => Promise<void>;  // קוראת ל-API לשחזור
};
```

- מוצג כ-toast קבוע למטה (z-index גבוה)
- אחרי 5 שניות נעלם
- פעולות שמופעלות ב-undo: שיוך / ביטול שיוך / פינה / הגיעו / לא הגיעו
- **לא** על יצירת walk-in (עלול להיות מבלבל — walk-in=רשומה חדשה)
- **לא** על מחיקה (יש כבר confirm dialog)

ה-revert מבוסס על snapshot ב-client-state (ה-reservation כפי שהייתה לפני ה-mutation). אם ה-API fails — toast אדום `שגיאה בביטול`.

---

## 8. פאזות ביצוע

### פאזה 1 — יסודות (MVP) · ~יום עבודה
- [ ] Migration: `reservation_tables` + `status='completed'` + backfill מ-`table_id`
- [ ] API: `POST/DELETE /api/reservations/[id]/tables`
- [ ] API: `GET /api/reservations` מחזיר `tables[]`
- [ ] UI: הוספת שורת שיוך + כפתור `[שייך]` בכרטיס הזמנה
- [ ] רכיב `TablePickerModal` — רשימה פשוטה (בלי המפה עדיין)
- [ ] בדיקה ידנית end-to-end

### פאזה 2 — מפה + shift mode · ~יום עבודה
- [ ] החלפת read-mode ב-/admin/map לצבעים דינמיים
- [ ] פופאובר לחיצה עם פרטי הזמנה + פעולות
- [ ] החלפת `TablePickerModal` למפה מיניאטורית
- [ ] Walk-in flow (לחיצה על שולחן פנוי)
- [ ] API: `POST /api/walk-ins`
- [ ] `is_primary` + הצגה `שולחן 7 + שולחן 8`

### פאזה 3 — סיום + ליטוש · ~חצי יום
- [ ] אזהרות רכות (`detectWarnings`) + badge בכרטיס
- [ ] פס סיכום בראש העמוד
- [ ] כפתור `[פינה]` + סטטוס `completed`
- [ ] תשתית Undo + toast
- [ ] סינון `completed` ברירת מחדל + toggle
- [ ] Owner-only על /admin/map edit mode

### פאזה 4 — נוח יותר (אופציונלי, שלב שני) · פוסט-MVP
- [ ] Drag-and-drop של כרטיס הזמנה על שולחן במפה
- [ ] היסטוריית שיוכים לדוחות
- [ ] קיצורי מקלדת לטאבלט
- [ ] מעבר מ-`reservations.table_id` לגמרי ל-junction, מחיקת העמודה

---

## 9. סיכונים וזיכוריות למימוש

1. **OneDrive git lock** — כל ה-migrations ידרשו `git` operations; לפי זיכרון ישן — לתת לאביב פקודות PowerShell להריץ בעצמו, לא להריץ מהסנדבוקס.

2. **Race condition על junction** — שתי פעולות בו-זמנית שמשנות שיוכים יכולות להיכשל. פתרון: transaction ב-PostgreSQL ב-POST/DELETE. הלקוח שולח set מלא של table_ids, השרת מחליף בתוך transaction.

3. **`is_primary` invariant** — חייב להיות בדיוק אחד פר reservation (או אפס, אם אין שיוכים). אכיפה: unique partial index + trigger / server-side enforcement.

4. **Timezone של shift day** — כל ה-queries במפה וברשימה חייבים לעבור דרך `shiftDayLocal()` הקיים. אחד הבאגים הקלים ביותר להחמיץ.

5. **Walk-in חובה area** — `restaurant_tables.area` חייב להיות מוגדר על כל שולחן; אחרת ה-walk-in יכשל ב-validation.

6. **Polling נשאר 60s** — בינתיים מספיק. אם בעתיד שתי מארחות — מעבר ל-Supabase Realtime (לא משנה סכמה).

---

## 10. שאלות עתידיות (לא חוסמות MVP)

- שילוב עם SMS confirmation לפני הזמנה (נשלח יום לפני — גם מזכיר את השולחן? בינתיים לא)
- תצוגת ניצול היסטורית ("שולחן 7 היה תפוס 80% מהלילה")
- הוספת תמונה/אווירה לכל שולחן ב-picker
- קיבולת דינמית (אם השולחן גדול → אפשר להושיב 2 הזמנות של 2 כל אחת)
