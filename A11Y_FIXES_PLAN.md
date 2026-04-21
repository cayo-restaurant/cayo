# A11y priority-fix plan — /host (hostess shift) + admin drawer

**Scope:** the 8 fixes from the audit. Plan only — no files have been modified.
**Target surfaces:**

- `app/host/shared.tsx` — `ReservationRow` (swipe-reveal הגיע / לא הגיע buttons)
- `app/host/HostDashboard.tsx` — header, date, section time headers, swipe hint, יציאה button, late banner
- `components/AdminNav.tsx` — FAB + drawer (admin only; host page has no FAB, but the FAB still shows over /host if the same browser has both cookies)
- `tailwind.config.ts` — adds a new token `cayo-teal-dark` used by the two AA-failing buttons

**Calibration note on fix #1:**
The audit calls the teal button "הגיע". In the code that button's Hebrew label is actually **"הגיע"** (in `app/host/shared.tsx` line 496), but on `/admin` an analogous button says **"הגיעו"** and is already burgundy. The one that fails contrast is the swipe-reveal `bg-cayo-teal` button in `shared.tsx`. Fix targets that. See fix #1 below.

**How to apply:** each fix is a unified diff. From the cayo repo root in PowerShell you can paste them into a single file and run `git apply` — but because this repo lives in OneDrive and the sandbox has trouble touching git files, the simpler path is to open each file in VS Code, find the `-` lines, and replace with the `+` lines. Line numbers are given for each hunk. All edits are pure search-and-replace; no files created or moved.

---

## Fix #1 — 🔴 Darken the teal on the "הגיע" swipe button

**Why it fails:** `bg-cayo-teal` (`#00AD9E`) with white text on `text-sm` (14 px) non-bold-enough fails WCAG AA (contrast 2.72:1; needs 4.5:1).
**Why a new token instead of mutating `cayo-teal`:** `cayo-teal` is used as a low-opacity accent in many places (`bg-cayo-teal/15`, `/20`, `/5`, etc.). Darkening the base token darkens those too and muddies badges. Add `cayo-teal-dark` for solid-color contexts only.

### 1a. Add the darker teal token

**File:** `tailwind.config.ts` (line 16)

```diff
         cayo: {
           burgundy: '#4D1423',
           dark: '#1A0A10',
           cream: '#F0E0C7',
           orange: '#E35632',
           teal: '#00AD9E',
+          tealDark: '#008578',
           red: '#CB4747',
```

Computed contrast of `#008578` on white text: 4.55:1 — passes AA for normal text.

### 1b. Use it on the "הגיע" swipe button

**File:** `app/host/shared.tsx` (lines 489–497)

```diff
           <button
             onClick={triggerArrived}
             disabled={pending}
-            className="flex-1 bg-cayo-teal text-white font-black text-sm flex flex-col items-center justify-center gap-0.5 disabled:opacity-50"
-            aria-label="סמני הגיע"
+            className="flex-1 bg-cayo-tealDark text-white font-black text-sm flex flex-col items-center justify-center gap-0.5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
+            aria-label={`סמני הגיע – ${r.name || 'ללא שם'} בשעה ${r.time}`}
           >
             <span className="text-2xl leading-none">✓</span>
             <span>הגיע</span>
           </button>
```

(That change also covers fix #2 and fix #3 for this button — see below. It's one edit, not three.)

### 1c. Same treatment for the "arrived + assign recommended table" chained CTA

**File:** `app/host/shared.tsx` (lines 612–616)

That pill is also solid teal (`bg-cayo-teal border-cayo-teal`) when `combine === true` and uses white text on `text-sm`. Same contrast failure, same fix:

```diff
                       className={`flex-1 h-11 rounded-xl font-black text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50 text-white border-2 ${
                         combine
-                          ? 'bg-cayo-teal border-cayo-teal'
+                          ? 'bg-cayo-tealDark border-cayo-tealDark'
                           : 'bg-cayo-burgundy border-cayo-burgundy'
                       }`}
```

Leave all the `/15`, `/20`, `/5`, `/40` teal accents in `shared.tsx` lines 449, 461, 551 alone — they're backgrounds for badges where lighter is fine.

---

## Fix #2 — 🔴 Unique accessible names on arrive / no-show buttons

**Why it fails:** every row has `aria-label="סמני הגיע"` / `aria-label="סמני לא הגיע"`. A screen-reader user scanning the list hears twenty identical buttons.

**File:** `app/host/shared.tsx`

### 2a. No-show button (lines 480–488)

```diff
           <button
             onClick={triggerNoShow}
             disabled={pending}
-            className="flex-1 bg-cayo-burgundy text-white font-black text-sm flex flex-col items-center justify-center gap-0.5 disabled:opacity-50"
-            aria-label="סמני לא הגיע"
+            className="flex-1 bg-cayo-burgundy text-white font-black text-sm flex flex-col items-center justify-center gap-0.5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
+            aria-label={`סמני לא הגיע – ${r.name || 'ללא שם'} בשעה ${r.time}`}
           >
             <span className="text-2xl leading-none">✗</span>
             <span>לא הגיע</span>
           </button>
```

### 2b. Arrive button

Already covered in fix #1b above (the new `aria-label` includes name + time).

`r.name` and `r.time` are already in scope — they come from the destructured `reservation: r` prop. No other changes needed.

---

## Fix #3 — 🔴 Visible `:focus-visible` ring on key interactive elements

**Strategy:** one global rule in `globals.css` catches everything, plus per-button rings where the default black outline would clash with a dark background (arrive/no-show buttons on dark fills). The per-button rings were already added inline in fixes #1b and #2a.

### 3a. Global default

**File:** `app/globals.css` (append inside `@layer base`)

```diff
 @layer base {
   html {
     direction: rtl;
   }

   body {
     @apply bg-white text-cayo-burgundy;
   }

   ::selection {
     @apply bg-cayo-teal/20 text-cayo-burgundy;
   }
+
+  /* A11y: a visible focus ring on every focusable element, unless a
+     component opts out with its own focus-visible:* utilities.
+     2px outline + 2px offset = 4px total — comfortably visible without
+     pushing layout. Burgundy on white = ~14:1 contrast. */
+  :focus-visible {
+    outline: 2px solid #4D1423;
+    outline-offset: 2px;
+    border-radius: 4px;
+  }
 }
```

### 3b. FAB in `components/AdminNav.tsx` (lines 56–60)

The default ring works, but the FAB is positioned `fixed bottom-5 left-5` on a light page — the burgundy-on-white outline is fine. However the FAB already has `bg-cayo-burgundy`, so on active press the outline would touch the button's own color. Swap to an explicit ring utility that contrasts with the button fill:

```diff
       <button
         onClick={() => setOpen(v => !v)}
         aria-label="תפריט ניהול"
-        className="fixed bottom-5 left-5 z-50 w-12 h-12 rounded-full bg-cayo-burgundy text-white shadow-lg shadow-cayo-burgundy/30 hover:bg-cayo-burgundy/90 transition-all flex items-center justify-center"
+        className="fixed bottom-5 left-5 z-50 w-12 h-12 rounded-full bg-cayo-burgundy text-white shadow-lg shadow-cayo-burgundy/30 hover:bg-cayo-burgundy/90 transition-all flex items-center justify-center focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cayo-burgundy/40 focus-visible:ring-offset-2"
       >
```

### 3c. יציאה button in `HostDashboard.tsx` (lines 284–289)

Fix #7 bumps this to 44 px; I'm combining the ring into that edit — see fix #7 below.

---

## Fix #4 — 🟡 Raise faded-burgundy text alpha to ≥ 0.75 (or use solid)

Every occurrence on the hostess shift page where burgundy is used as text with `/50`, `/60`, or `/65` opacity — at 50 % opacity on white, burgundy gives ~3.15:1 (fails AA); 65 % gives ~4.8:1 (passes).

All edits below are `app/host/HostDashboard.tsx` unless noted.

### 4a. Date line under "משמרת" (line 281)

```diff
-              <p className="text-xs text-cayo-burgundy/60 leading-tight">{todayLabel}</p>
+              <p className="text-xs text-cayo-burgundy/80 leading-tight">{todayLabel}</p>
```

### 4b. "מסומנות" label + "הצג רשימה ←" sub-label in the top card (lines 305, 311)

```diff
-            <p className="text-[10px] font-bold text-cayo-burgundy/50 uppercase tracking-wider">
+            <p className="text-[10px] font-bold text-cayo-burgundy/75 uppercase tracking-wider">
               מסומנות
             </p>
             <p className="text-xl font-black mt-0.5 text-cayo-burgundy">
               {markedCount}
             </p>
-            <p className="text-[11px] font-bold text-cayo-burgundy/50 mt-0.5 leading-tight">
+            <p className="text-[11px] font-bold text-cayo-burgundy/75 mt-0.5 leading-tight">
               הצג רשימה ←
             </p>
```

### 4c. Same pattern inside the `<Stat>` component (lines 438, 442)

```diff
 function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
   return (
     <div className="bg-white border-2 border-cayo-burgundy/15 rounded-xl px-3 py-2.5">
-      <p className="text-[10px] font-bold text-cayo-burgundy/50 uppercase tracking-wider">
+      <p className="text-[10px] font-bold text-cayo-burgundy/75 uppercase tracking-wider">
         {label}
       </p>
       <p className="text-xl font-black mt-0.5 text-cayo-burgundy">{value}</p>
-      <p className="text-[11px] font-bold text-cayo-burgundy/50 mt-0.5 leading-tight">
+      <p className="text-[11px] font-bold text-cayo-burgundy/75 mt-0.5 leading-tight">
         {sub}
       </p>
```

### 4d. Time-slot section header (lines 385–391)

```diff
                       <div className={`flex items-center gap-2 ${idx === 0 ? '' : 'pt-2'}`}>
-                        <span className="text-xs font-black text-cayo-burgundy/60" dir="ltr">
+                        <span className="text-xs font-black text-cayo-burgundy/80" dir="ltr">
                           {r.time}
                         </span>
-                        <span className="text-[11px] font-bold text-cayo-burgundy/30">·</span>
-                        <span className="text-[11px] font-bold text-cayo-burgundy/40">
+                        <span className="text-[11px] font-bold text-cayo-burgundy/40" aria-hidden="true">·</span>
+                        <span className="text-[11px] font-bold text-cayo-burgundy/75">
                           {sameTimeCount} {sameTimeCount === 1 ? 'הזמנה' : 'הזמנות'}
                         </span>
                         <span className="flex-1 border-t border-cayo-burgundy/10 ms-1" />
                       </div>
```

The divider dot is decorative so it can stay faded, but it should be `aria-hidden="true"` so it's not read out (see fix #8).

### 4e. Swipe hint (line 410)

```diff
-            <p className="text-[11px] text-cayo-burgundy/40 text-center mt-3 font-bold">
+            <p className="text-[11px] text-cayo-burgundy/75 text-center mt-3 font-bold">
               החליקי הזמנה ימינה לסימון מהיר · הקישי להצגת פרטים
             </p>
```

### 4f. Same for the row's sub-line in `shared.tsx` (line 526)

```diff
             <p className="text-base font-black text-cayo-burgundy truncate leading-tight">
               {r.name || '— ללא שם —'}
             </p>
-            <div className="flex items-center gap-1.5 text-xs font-bold text-cayo-burgundy/65 mt-0.5 truncate">
+            <div className="flex items-center gap-1.5 text-xs font-bold text-cayo-burgundy/80 mt-0.5 truncate">
```

`/65` is *technically* passing (~4.8:1) but right at the edge; `/80` gives a comfortable margin.

> **Note on scope:** the corresponding faded text on `/admin` (`app/admin/page.tsx` — "N הזמנה" at line 985, overview card labels, etc.) has the same pattern. The audit pointed at the hostess UI specifically, so I've left `/admin` for a separate pass. If you want both in one PR, add a global find-and-replace step: `text-cayo-burgundy/50` → `text-cayo-burgundy/75`, `text-cayo-burgundy/60` → `text-cayo-burgundy/80` across `app/admin/`.

---

## Fix #5 — 🟡 Close the drawer focus trap

**Why it matters:** when `open === false`, the `<nav>` slides off-screen via `translate-x-full`, but its contents are still in the DOM and focusable by keyboard (Tab lands inside an invisible drawer). Also, a screen reader doesn't know the FAB controls the drawer.

**File:** `components/AdminNav.tsx`

### 5a. Add `inert` + `aria-hidden` to the `<nav>` when closed (lines 79–83)

```diff
       <nav
-        className={`fixed top-0 right-0 bottom-0 z-50 w-72 bg-white border-l-2 border-cayo-burgundy/10 shadow-2xl transform transition-transform duration-200 ${
-          open ? 'translate-x-0' : 'translate-x-full'
-        }`}
-        dir="rtl"
+        id="admin-nav-drawer"
+        className={`fixed top-0 right-0 bottom-0 z-50 w-72 bg-white border-l-2 border-cayo-burgundy/10 shadow-2xl transform transition-transform duration-200 ${
+          open ? 'translate-x-0' : 'translate-x-full'
+        }`}
+        dir="rtl"
+        aria-hidden={!open}
+        {...(!open ? { inert: '' as unknown as undefined } : {})}
       >
```

(The `inert` prop isn't in React's stock types yet — the spread-with-cast keeps TS happy. Alternatively, import the ref-based `useInert` pattern; this is the smallest change.)

### 5b. Wire the FAB to the drawer via ARIA (lines 56–60)

Combine with the focus-ring edit from fix #3b:

```diff
       <button
         onClick={() => setOpen(v => !v)}
         aria-label="תפריט ניהול"
+        aria-expanded={open}
+        aria-controls="admin-nav-drawer"
+        aria-haspopup="menu"
         className="fixed bottom-5 left-5 z-50 w-12 h-12 rounded-full bg-cayo-burgundy text-white shadow-lg shadow-cayo-burgundy/30 hover:bg-cayo-burgundy/90 transition-all flex items-center justify-center focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cayo-burgundy/40 focus-visible:ring-offset-2"
       >
```

> **Note:** `aria-haspopup="menu"` implies the inner content is a role=menu tree with menuitems. The drawer currently renders plain `<Link>`s and a logout `<button>` — that's fine as a lightweight nav list. If you want the strict ARIA menu pattern (arrow-key navigation, roving tabindex), I'd drop `haspopup="menu"` and use `haspopup="dialog"` + `role="dialog" aria-modal="true"` on the `<nav>` instead. Tell me which pattern you want and I'll revise.

---

## Fix #6 — 🟡 `aria-live="polite"` status region

**Why:** when a reservation's status flips to arrived/no-show, the row visually disappears from the active list (it moves to `/host/marked`). A screen-reader user currently gets no confirmation.

### 6a. Add an announcement region to the dashboard

**File:** `app/host/HostDashboard.tsx`

Add a new state slot and a hidden region, and update `setStatus` to fill it:

```diff
   const [items, setItems] = useState<Reservation[]>([])
   const [loading, setLoading] = useState(true)
   const [error, setError] = useState('')
+  // aria-live message announced to screen readers on any status flip.
+  // Mirrors what the sighted hostess sees in the optimistic list update.
+  const [announce, setAnnounce] = useState('')
   // `now` ticks every 30s so late minutes update without a manual reload
```

Inside `setStatus` (after the optimistic `setItems` on line 192):

```diff
     setPendingAction(id)
     setItems(p => p.map(r => (r.id === id ? { ...r, status } : r)))
+    if (prev) {
+      const name = prev.name || 'הזמנה ללא שם'
+      const verb =
+        status === 'arrived' ? 'סומן/ה כהגיע/ה'
+        : status === 'no_show' ? 'סומן/ה כלא הגיע/ה'
+        : status === 'confirmed' ? 'שוחזר/ה לאישור'
+        : 'סטטוס עודכן'
+      setAnnounce(`${name} ${verb} בשעה ${prev.time}`)
+    }
     try {
       const res = await fetch(`/api/reservations/${id}`, {
```

Render the region once (before `</main>` closes, around line 415 — actually safer to put it just inside `<main>`, immediately after the opening tag, so it's read early):

```diff
       <main className="max-w-3xl mx-auto px-5 py-5">
+        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
+          {announce}
+        </div>
         {/* Top row: single stat card + link to marked list */}
```

`sr-only` is a Tailwind-built-in utility that clips the element visually but keeps it accessible. No further CSS needed.

---

## Fix #7 — 🟡 44 px min height on "יציאה" + heading/list semantics

### 7a. Exit button (lines 284–289)

**File:** `app/host/HostDashboard.tsx`

`px-3 py-1.5` with `text-sm` renders at ~28 px. Target tap size per WCAG 2.5.5 is 44 × 44.

```diff
           <button
             onClick={logout}
-            className="text-sm font-bold text-cayo-burgundy/70 hover:text-cayo-burgundy px-3 py-1.5"
+            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-sm font-bold text-cayo-burgundy hover:text-cayo-burgundy px-4 py-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cayo-burgundy/60 focus-visible:ring-offset-2"
           >
             יציאה
           </button>
```

(`text-cayo-burgundy/70` → `text-cayo-burgundy` also folds fix #4 for this element.)

### 7b. Heading + list semantics inside `<main>`

The active list currently renders as `<div>`s. Mark the time-slot headers as headings and the rows as list items. Two small edits:

**File:** `app/host/HostDashboard.tsx` (lines 366, 394, 405)

```diff
           <>
-            <div className="space-y-2">
+            <ul className="space-y-2 list-none p-0">
               {activeList.map((r, idx) => {
                 const prev = idx > 0 ? activeList[idx - 1] : null
                 const showHeader = !prev || prev.time !== r.time
                 let sameTimeCount = 0
                 if (showHeader) {
                   for (let j = idx; j < activeList.length; j++) {
                     if (activeList[j].time === r.time) sameTimeCount++
                     else break
                   }
                 }
                 return (
-                  <div key={r.id} className="space-y-2">
+                  <li key={r.id} className="space-y-2 list-none">
                     {showHeader && (
                       <div className={`flex items-center gap-2 ${idx === 0 ? '' : 'pt-2'}`}>
-                        <span className="text-xs font-black text-cayo-burgundy/80" dir="ltr">
+                        <h2 className="text-xs font-black text-cayo-burgundy/80 m-0" dir="ltr">
                           {r.time}
-                        </span>
+                        </h2>
                         <span className="text-[11px] font-bold text-cayo-burgundy/40" aria-hidden="true">·</span>
                         <span className="text-[11px] font-bold text-cayo-burgundy/75">
                           {sameTimeCount} {sameTimeCount === 1 ? 'הזמנה' : 'הזמנות'}
                         </span>
                         <span className="flex-1 border-t border-cayo-burgundy/10 ms-1" aria-hidden="true" />
                       </div>
                     )}
                     <ReservationRow ... />
-                  </div>
+                  </li>
                 )
               })}
-            </div>
+            </ul>
```

> **Consideration:** the time `<h2>` lives on the same line as `{sameTimeCount} הזמנות`. Screen readers will announce only the `<h2>` content ("20:30") when navigating by headings, which is probably what you want — the count is supporting metadata. If you'd rather the header announce the full phrase, wrap both spans inside the `<h2>` and make the dot `aria-hidden`.

### 7c. (Optional but recommended) Add an `<h1>` anchor to the shift header

The current `<h1>` says "משמרת" (line 280) which is a generic label. Leaving it — just noting it's there and it's fine.

---

## Fix #8 — 🟢 `aria-hidden="true"` on decorative SVG / glyph icons

Every icon below already has a real text label next to it, so the SVG is purely decorative. Screen readers currently read them (e.g. "image" or the raw path).

### 8a. Hamburger / X icons in the FAB

**File:** `components/AdminNav.tsx` (lines 62, 66)

```diff
         {open ? (
-          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
+          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
             <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
           </svg>
         ) : (
-          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
+          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
             <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
           </svg>
         )}
```

### 8b. Expand/collapse arrow chevron in `shared.tsx` (lines 582–587)

Already has `aria-hidden="true"` ✓ — no change.

### 8c. Phone icon SVG inside the expanded call-pill (`shared.tsx` line 691–698)

Already has `aria-hidden="true"` ✓ — no change.

### 8d. Swipe-reveal action icons (`shared.tsx` lines 486, 495)

The ✗ and ✓ spans are inside a button that already has a text label ("לא הגיע" / "הגיע") plus — after fix #2 — a full `aria-label`. Mark the `<span>` decorative:

```diff
           <button ...>
-            <span className="text-2xl leading-none">✗</span>
+            <span className="text-2xl leading-none" aria-hidden="true">✗</span>
             <span>לא הגיע</span>
           </button>
           <button ...>
-            <span className="text-2xl leading-none">✓</span>
+            <span className="text-2xl leading-none" aria-hidden="true">✓</span>
             <span>הגיע</span>
           </button>
```

### 8e. Quick-assign pill emoji (`shared.tsx` line 623)

```diff
-                      <span>{combine ? '✓' : '🪑'}</span>
+                      <span aria-hidden="true">{combine ? '✓' : '🪑'}</span>
                       <span>
                         {combine
```

### 8f. Section-header divider dot — already covered in fix #4d.

### 8g. Late-banner pulse dot (`HostDashboard.tsx` line 325)

```diff
             <div className="flex items-center gap-2 mb-1">
-              <span className="inline-block w-2 h-2 rounded-full bg-cayo-red animate-pulse" />
+              <span className="inline-block w-2 h-2 rounded-full bg-cayo-red animate-pulse" aria-hidden="true" />
```

---

## File-by-file summary

| File | Lines touched | Net change |
|---|---|---|
| `tailwind.config.ts` | 1 line added (16) | new `tealDark` token |
| `app/globals.css` | 6 lines added inside `@layer base` | global `:focus-visible` ring |
| `components/AdminNav.tsx` | lines 56–70, 79–83 | FAB ARIA + drawer `inert` + focus ring + `aria-hidden` on icons |
| `app/host/HostDashboard.tsx` | lines 43 area, 192 area, 281, 284–289, 305, 311, 325, 366, 385–394, 405, 410, 415 area, 438, 442 | announce region, 44 px exit, heading/list, faded-text alpha |
| `app/host/shared.tsx` | lines 480–497, 526, 612–616, 623, 486, 495 | button a11y labels, focus ring, teal→tealDark, decorative `aria-hidden` |

5 files, ~35 discrete edits. None of them touch business logic — all are JSX/class-string/aria-attribute changes plus one new color token.

---

## Verification checklist (run after applying)

1. `npm run build` — confirms no TS error on the `inert` cast in `AdminNav.tsx`. If TS complains on the `!open ? { inert: '' as unknown as undefined } : {}` spread, switch to: upgrade `@types/react` to ≥ 19 (has native `inert` prop), or use a `ref` + `useEffect` to toggle `navRef.current.inert`.
2. Chrome DevTools → Lighthouse → Accessibility. Expect the score to jump from the current baseline (I'd guess mid-70s) into the mid-90s. The two remaining likely flags would be (a) color-contrast on whichever burgundy/N you leave unchanged on `/admin`, (b) `<html lang>` if not already set.
3. Manual keyboard walk: Tab from top of page, confirm visible ring on header logo link, exit button, stat card, "הצג רשימה", each row, each expanded-row action. Tab should NEVER land inside the closed drawer.
4. VoiceOver or NVDA: arrow through the list, confirm each "סמני הגיע" / "סמני לא הגיע" button includes the guest name and time in its announcement. Tap one arrive button → confirm you hear the `aria-live` announcement within 1 second.
5. Real device in dim lighting (the memory note about bar lighting) — have the hostess try to read "23:30 · 3 הזמנות" and the swipe hint without squinting. The /75 alpha is the minimum needed; if it still reads too faint in the real room, bump to /90 or solid.

---

## Questions before I cut this into code

- **`/admin` scope:** the audit was hostess-only. Want me to sweep the same faded-text cleanup across `app/admin/page.tsx` in the same PR, or keep it tight and do `/admin` in a follow-up?
- **Drawer ARIA pattern (fix #5):** do you want `haspopup="menu"` with strict keyboard nav, or the simpler `dialog` pattern? (The current `LINKS` array has 5 entries and the drawer also has a logout button — either pattern works; the dialog one is less code.)
- **One PR vs. two:** reds first, then yellows + green? You picked plan-only up front, but when you do ship I'd recommend one PR for the two token/token-using edits (fix #1) and one for the rest, so a revert is easy if the color change looks off in production lighting.

Ping me when you want this turned into commits and I'll produce the final diffs ready to apply.
