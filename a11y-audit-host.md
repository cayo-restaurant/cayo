# Accessibility Audit: /host (Hostess Shift View)

**URL:** https://www.cayobar.com/host
**Standard:** WCAG 2.1 AA
**Date:** 2026-04-19
**Context:** Hebrew RTL tool used one-handed by the on-shift hostess to mark arrivals/no-shows. Glanceability and one-tap interaction are primary goals.

## Summary

**Issues found:** 14 · **Critical:** 3 · **Major:** 8 · **Minor:** 3

The page gets the basics right (lang/dir, landmarks, viewport zooming, main action buttons large enough for touch), but **the primary "סמני הגיע" action fails contrast** and **every arrival/no-show button shares the same accessible name**, so screen reader and voice control users can't tell which reservation they're acting on. Focus indicators are effectively invisible. These three together are blockers for any non-sighted or low-vision hostess.

## Findings

### Perceivable

| # | Issue | WCAG | Severity | Recommendation |
|---|---|---|---|---|
| 1 | White text on teal "סמני הגיע" button: `#FFFFFF` on `rgb(0,173,158)` at 14px/900 ≈ **2.81:1** (needs 4.5:1). | 1.4.3 Contrast | 🔴 Critical | Darken the teal to something like `#008578` (≈4.6:1) or add a dark outline/text-shadow. Keep the burgundy "לא הגיע" — it's 12+:1. |
| 2 | "1 הזמנה" reservation-count pill — burgundy @ 0.4 opacity on white, 11px/700 ≈ **2.42:1**. | 1.4.3 Contrast | 🟡 Major | Raise opacity to ≥ 0.75 (≈ `rgba(77,20,35,0.75)` → ~6.3:1) or use the solid burgundy. |
| 3 | Swipe-hint text "החליקי הזמנה ימינה לסימון מהיר" — 0.4 opacity, 11px ≈ **2.42:1**. | 1.4.3 Contrast | 🟡 Major | Same fix. Note this is the only onboarding text telling hostesses how the gesture works — losing it is a real UX hit. |
| 4 | Section label "הזמנות היום" — 0.5 opacity, 10px/700 ≈ **3.15:1**. | 1.4.3 Contrast | 🟡 Major | Raise opacity to ≥ 0.7 and consider 11–12px for readability on a phone held 60cm away in dim bar lighting. |
| 5 | Time labels on reservation cards ("19:00", "19:30"…) — 0.6 opacity, 12px/900 ≈ **4.30:1** (fails 4.5:1). | 1.4.3 Contrast | 🟡 Major | Drop opacity — solid burgundy (12.2:1) reads much better, and time is the most glanced-at value on the card. |
| 6 | Date line "יום ראשון, 19 אפריל" — 0.6 opacity, 12px/400 ≈ **4.30:1**. | 1.4.3 Contrast | 🟡 Major | Raise to solid burgundy or ≥ 0.8 opacity. |
| 7 | "מסומנות" / "הצג רשימה ←" inside the card link — 0.5 opacity, 10–11px ≈ **3.15:1**. | 1.4.3 Contrast | 🟢 Minor | Raise opacity; the "0" counter (solid burgundy) is fine. |
| 8 | No heading hierarchy inside `<main>`: only one `<h1>` ("משמרת"), everything else is `<div>`. Screen-reader users cannot jump between time slots or reservations with heading navigation. | 1.3.1 Info & Relationships | 🟡 Major | Mark each reservation's headline (time + name) as an `<h2>` (visually styled however you like), or at minimum wrap the reservation list in `<ul role="list">` with each card as `<li>`. |

### Operable

| # | Issue | WCAG | Severity | Recommendation |
|---|---|---|---|---|
| 9 | **No visible focus indicator.** All buttons resolve to `outline-style:none` on focus; Tailwind's `focus:outline-none` is applied without a replacement `focus:ring-*` on the action buttons. A hostess using a Bluetooth keyboard or an attached tablet keyboard can't see where focus is. | 2.4.7 Focus Visible | 🔴 Critical | Add a `focus-visible:ring-2 focus-visible:ring-cayo-burgundy focus-visible:ring-offset-2` (or equivalent) to `<button>` and `<a>` components — especially the arrive/no-show pair. |
| 10 | Drawer nav (side menu) is hidden via `transform: translateX(288px)` but its 6 links remain focusable (no `inert`, no `aria-hidden`). Tab key lands on invisible items off-screen. | 2.4.3 Focus Order · 2.4.7 | 🟡 Major | When the drawer is closed, set `inert` on the `<nav>` (or `aria-hidden="true"` plus `tabindex="-1"` on each link). When open, move focus into the drawer and trap it until dismissed. |
| 11 | "יציאה" button in the header is **60×32 CSS px** — below the 44×44 minimum touch target. | 2.5.5 Target Size | 🟡 Major | Pad to 44px min height. Everywhere else passes (arrive/no-show 90×62, menu FAB 48×48). |
| 12 | The floating menu button "תפריט ניהול" is a disclosure but lacks `aria-expanded`, `aria-controls`, and `aria-haspopup`. Screen reader users aren't told it opens a menu or whether it's currently open. | 4.1.2 Name, Role, Value | 🟡 Major | Add `aria-expanded={open}`, `aria-controls="admin-drawer"`, `aria-haspopup="menu"`; give the `<nav>` `id="admin-drawer"` and `role="dialog"` or `role="menu"` as appropriate. |

### Understandable

| # | Issue | WCAG | Severity | Recommendation |
|---|---|---|---|---|
| 13 | No live-region announcement when a reservation is marked "הגיע" / "לא הגיע". The visual state changes but screen readers stay silent, so a low-vision hostess can't confirm the tap registered. | 4.1.3 Status Messages | 🟡 Major | Add an `aria-live="polite"` region (visually hidden is fine) that announces e.g. "הזמנה של יואב ב-19:00 סומנה כהגיעה". |
| 14 | Reservations aren't wrapped in `<ul>`/`<li>` or `role="list"` — screen readers don't announce "1 of 11" position. | 1.3.1 | 🟢 Minor | Wrap the reservation stack in `<ul role="list" aria-label="הזמנות היום">` with each card as `<li>`. |

### Robust

| # | Issue | WCAG | Severity | Recommendation |
|---|---|---|---|---|
| 15 | **Every arrive/no-show button shares the same accessible name** ("סמני הגיע" / "סמני לא הגיע") — 22 duplicate-name buttons on one screen. A screen reader user hears "סמני הגיע button, סמני הגיע button…"; a voice-control user saying "click סמני הגיע" has no way to pick a target. | 4.1.2 Name, Role, Value · 2.4.6 Headings and Labels | 🔴 Critical | Put the guest name and time into the accessible name: `aria-label="סמני שיואב (19:00, 2 סועדים) הגיע"`. Easiest implementation: compute it in the row component from the same props used to render the card. |
| 16 | SVG icons inside buttons have no `aria-hidden="true"`. Since the parent button already has the right text/label, the SVG adds nothing useful but may be announced as "image" on some ATs. | 1.1.1 · 4.1.2 | 🟢 Minor | Add `aria-hidden="true"` and `focusable="false"` on decorative `<svg>`s. |

## Color Contrast Check

| Element | Foreground | Background | Ratio | Required | Pass? |
|---|---|---|---|---|---|
| Body / guest name | `#4D1423` | `#FFFFFF` | ~12.2:1 | 4.5:1 | ✅ |
| "לא הגיע" button (white on burgundy) | `#FFFFFF` | `#4D1423` | ~12.2:1 | 4.5:1 | ✅ |
| **"הגיע" button (white on teal)** | `#FFFFFF` | `#00AD9E` | ~2.81:1 | 4.5:1 | ❌ |
| Time "19:00" (burgundy @ 0.6) | effective `#94727B` | `#FFFFFF` | ~4.30:1 | 4.5:1 | ❌ |
| "2 סועדים" / "שולחן" (burgundy @ 0.65) | effective `#8B6670` | `#FFFFFF` | ~4.97:1 | 4.5:1 | ✅ |
| Date line (burgundy @ 0.6) | effective `#94727B` | `#FFFFFF` | ~4.30:1 | 4.5:1 | ❌ |
| "1 הזמנה" (burgundy @ 0.4) | effective `#B8A1A7` | `#FFFFFF` | ~2.42:1 | 4.5:1 | ❌ |
| Swipe hint (burgundy @ 0.4) | effective `#B8A1A7` | `#FFFFFF` | ~2.42:1 | 4.5:1 | ❌ |
| "הזמנות היום" label (burgundy @ 0.5) | effective `#A68A91` | `#FFFFFF` | ~3.15:1 | 4.5:1 | ❌ |
| "הצג רשימה ←" (burgundy @ 0.5) | effective `#A68A91` | `#FFFFFF` | ~3.15:1 | 4.5:1 | ❌ |
| "יציאה" button (burgundy @ 0.7) | effective `#825B65` | `#FFFFFF` | ~5.78:1 | 4.5:1 | ✅ |

## Keyboard Navigation

| Element | Tab Order | Enter/Space | Escape | Notes |
|---|---|---|---|---|
| "יציאה" header button | 1 | ✓ triggers | — | Focus not visible |
| "מסומנות / הצג רשימה" link | 2 | ✓ navigates | — | Focus not visible |
| Each arrive/no-show button | 3–24 | ✓ triggers | — | Focus not visible · all share accessible name |
| "תפריט ניהול" FAB | 25 | ✓ toggles drawer | — | Missing `aria-expanded` · focus doesn't move into drawer when opened |
| Drawer links (בית, הזמנת מקום, …) | 26–31 | ✓ | — | **Tabbable even when drawer is closed/off-screen** |

## Screen Reader

| Element | Announced As | Issue |
|---|---|---|
| Arrive button on row 3 | "סמני הגיע, button" | Same as row 1, 2, 4, 5 … — no disambiguator. 🔴 |
| Reservation row | "19:00 יואב 2 סועדים שולחן" (as a flat div soup) | No list semantics, no heading — can't jump between reservations. 🟡 |
| State change after tap | (silent) | No `aria-live` confirmation. 🟡 |
| Menu FAB | "תפריט ניהול, button" | No indication it's a disclosure / no expanded state. 🟡 |

## Priority Fixes

1. **🔴 Make the teal "הגיע" button readable.** This is the single most-tapped control in the app and currently fails basic contrast. Darkening the teal to ~`#008578` or using burgundy text fixes it in one token change.
2. **🔴 Give every arrive/no-show button a unique accessible name** that includes the guest name and time. One-line change in the row component.
3. **🔴 Add a visible `:focus-visible` ring** on all interactive elements — at minimum the arrive/no-show buttons, menu FAB, and exit button.
4. **🟡 Fix the faded burgundy text** ("1 הזמנה", swipe hint, section label, times, date) by raising alpha to ≥ 0.75 or using solid burgundy. This also helps sighted hostesses reading the screen in dim bar lighting.
5. **🟡 Close the drawer trap:** `inert` the `<nav>` when closed, and add `aria-expanded` / `aria-controls` / `aria-haspopup="menu"` to the FAB.
6. **🟡 Add an `aria-live="polite"` status region** that announces "X סומן/ה כהגיע/ה" when a reservation state changes.
7. **🟡 Bump the "יציאה" button to 44px min height** and add heading/list semantics inside `<main>` (time slots as `<h2>`s, reservations inside a `<ul>`).
8. **🟢 Add `aria-hidden="true"` to decorative SVG icons** inside buttons that already have text labels.

---

## What's already good

- `html[lang="he"][dir="rtl"]` set correctly — RTL announcement works.
- `<header>`, `<main>`, and `<nav>` landmarks present.
- Viewport meta allows user zoom (no `user-scalable=no`).
- Logo `<img>` has `alt="CAYO"`.
- Primary action buttons are 90×62 — well above the 44×44 touch minimum for the core shift workflow.
- Menu FAB is 48×48.
- Solid-burgundy text (body, guest names, "לא הגיע" button) is 12+:1 — excellent.
