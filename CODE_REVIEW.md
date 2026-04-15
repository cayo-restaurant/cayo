# Cayo — Code Review

Scope: full-repo read-only security + correctness pass. Focus on live-service reliability at `/host` and `/admin`, reservation correctness, auth, and timezone.

## Findings

---

### 1. Host PATCH uses server-UTC calendar date, not Israel shift day

- **Severity**: **Critical**
- **Category**: Functional bug / timezone
- **Location**: `app/api/reservations/[id]/route.ts:12-18` (`todayLocal`), used at `:92`
- **Problem**: Everywhere else in the server the shift day is correctly computed in Asia/Jerusalem with a 4-hour cutoff (`app/api/reservations/route.ts:23-35`, `shiftDayLocal`). The host-PATCH guard uses a naive `new Date().getFullYear/Month/Date` instead — that's the runtime's *local* time, which on Vercel is UTC.
- **Failure scenario**: Between roughly 00:00–04:00 Asia/Jerusalem, UTC has already rolled to the next day. Server `GET` (via `shiftDayLocal`) returns yesterday's reservations (correct). Hostess taps "arrived" → PATCH hits `todayLocal()` which returns the UTC date (tomorrow in Israel terms) → 403 `ניתן לעדכן רק הזמנות של היום`. During the last hour of service every tap fails. This is the exact window when no-shows and late arrivals most need to be recorded.
- **Also affected in winter** (UTC+2): same class of bug, just a narrower window (22:00–00:00 Israel = already next UTC day after midnight UTC).
- **Suggested fix**: Reuse the existing `shiftDayLocal()` (lift it from `app/api/reservations/route.ts` into a shared `lib/shift-day.ts`) and call it from both routes. Do **not** add a second implementation.

---

### 2. Public reservation POST has no rate limiting or bot protection

- **Severity**: **Critical**
- **Category**: Security / availability
- **Location**: `app/api/reservations/route.ts:95-125`
- **Problem**: The endpoint is public (by design — customer booking), validated by Zod, but there is no throttle, no captcha, no IP limit, no honeypot. The recent commit adds a capacity gate (`BAR_CAPACITY=14`, `TABLE_CAPACITY=50`).
- **Failure scenario**: A trivial script can POST thousands of valid-looking reservations (random names, valid Israeli-format phones, any email — Zod accepts `a@b.co`). Every one gets `status='pending'` and *counts toward capacity* (`lib/capacity.ts:39`: `OCCUPYING_STATUSES` includes `pending`). Result: the booking form legitimately tells real customers "אין מקום פנוי" while the DB fills with garbage. Restaurant stops taking real reservations until admin manually cancels each row.
- **Suggested fix**: Add per-IP rate limiting (reuse the in-memory pattern from `lib/host-auth.ts`, or better add an Upstash/KV bucket). Alternatively: (a) exclude `pending` from `OCCUPYING_STATUSES` until an admin confirms — but that reopens race risk, or (b) require a lightweight proof (hCaptcha/Turnstile) before POST.

---

### 3. PATCH has no optimistic lock — admin edits clobber hostess status

- **Severity**: **Critical**
- **Category**: Data integrity / concurrency
- **Location**: `lib/reservations-store.ts:110-140` (`updateReservation`), `app/admin/page.tsx` (no refresh, no version check on save)
- **Problem**: `updateReservation` does a plain `UPDATE ... WHERE id = ?`. No `updated_at` CAS, no row version. The admin page loads reservations once on mount and never polls (`/host` polls every 60s, `/admin` does not). If an admin has an edit modal open and the hostess marks "arrived" on the same row, the admin's save overwrites `status` back to whatever was in the form (pending/confirmed).
- **Failure scenario**: Hostess swipes "arrived" at 20:05. Admin (who opened the edit dialog at 20:03 to update the party size) hits save at 20:07 — status reverts to `confirmed`. Hostess now sees the customer back in the active queue, swipes "arrived" again. Confusion during live service. Worst case: repeated revert + capacity accounting off.
- **Suggested fix**: In `updateReservation`, accept `expectedUpdatedAt` from the admin form and add `.eq('updated_at', expectedUpdatedAt)`. On conflict, return a 409 and have the admin UI refresh + diff. At minimum, scope the admin's patch to only the fields the form actually modified (don't send unchanged status back).

---

### 4. Confirmation emails are never sent

- **Severity**: High
- **Category**: Functional / customer-facing
- **Location**: `lib/resend.ts` (entire file); grep for `sendConfirmation` returns zero call sites.
- **Problem**: `sendConfirmation` is defined, imports `Resend`, and is completely unused. No API route calls it. Customers booking online receive no confirmation email despite a valid `RESEND_API_KEY` in config.
- **Failure scenario**: Customer books for Saturday 20:00. They get no email. They call to check and there's no record matching (or the wrong one). Trust impact.
- **Additional risk when wired up**: The HTML template interpolates `${reservation.name}`, `${reservation.date}`, `${reservation.time}` directly into HTML with no escaping. `name` is user input. A malicious name field could inject HTML/links into the email (limited blast radius — the email goes to the customer's own mailbox — but still bad practice).
- **Suggested fix**: Call `sendConfirmation` from `app/api/reservations/route.ts:120` after successful insert, wrapped in `try/catch` so email failure does **not** fail the booking. Before enabling, add HTML-escape for user-supplied fields (simple replace of `&<>"'`).

---

### 5. Late-arrival detection depends on the tablet's local clock

- **Severity**: High
- **Category**: Timezone / hostess UX
- **Location**: `app/host/shared.tsx:59-68` (`shiftAdjustedDate`, `computeShiftDateStr`), `:72-76` (`timeOn`), `:91-104` (`bucketOf`)
- **Problem**: `timeOn(dateStr, time)` builds `new Date(y, mo-1, d, h, m)` — that's *browser local* time. `shiftAdjustedDate` uses `d.getHours()` — also browser local. The "late by N minutes" banner, the `late` bucket, and the shift-day client filter all assume the tablet is set to Asia/Jerusalem.
- **Failure scenario**: Restaurant buys a new Android tablet; timezone auto-detect is wrong (or staff travels with a personal phone set to a different TZ). Reservation at 20:00 scheduled locally — tablet thinks it's 19:00 elsewhere. Late banner never fires; hostess never calls the late arrival; seat stays blocked. Or the inverse: non-late reservation shows up in red.
- **Mitigation already in place**: server filters the GET to the correct Israel shift day, so the tablet displays the right *list*. Only the timing math is wrong.
- **Suggested fix**: Compute `now` and `scheduled` in a known TZ. Smallest change: use `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' })` to render the current shift day (mirrors the server), and compare times using `Date.UTC(...)` + the Israel offset for that date. Or pass server time down with the payload. Optionally add a visible TZ warning in the header if `Intl.DateTimeFormat().resolvedOptions().timeZone !== 'Asia/Jerusalem'`.

---

### 6. Admin PATCH skips capacity re-check on date/time/area changes

- **Severity**: High
- **Category**: Data integrity
- **Location**: `app/api/reservations/[id]/route.ts:58-105`, `lib/reservations-store.ts:110-140`
- **Problem**: POST validates capacity before insert (`app/api/reservations/route.ts:109-118`). PATCH does not. Admin can reschedule a reservation into an already-full slot, change the area (bar → table), or bump guest count past the remaining seats — capacity gate is bypassed.
- **Failure scenario**: Bar is at 14/14 for 20:00. Admin moves a 4-person reservation from 19:00 to 20:00 → bar is now 18/14. The booking form stops accepting new 20:00 bar reservations (that part works), but the live hostess view now has over-capacity that no one was warned about.
- **Suggested fix**: Before update, when `patch.date`/`patch.time`/`patch.area`/`patch.guests`/`patch.status` changes in a way that would re-occupy a seat, run `computeAvailability(reservations, newDate, { excludeReservationId: id })` and reject if the target slot can't absorb the move. Reuse `lib/capacity.ts`.

---

### 7. Auto-`no_show` sweep runs on every GET and can rewrite historical data

- **Severity**: High
- **Category**: Data integrity
- **Location**: `app/api/reservations/route.ts:77-82`, `lib/reservations-store.ts:149-159` (`markStaleConfirmedAsNoShow`)
- **Problem**: On every `GET /api/reservations` (admin or host), the server runs an `UPDATE reservations SET status='no_show' WHERE status='confirmed' AND date < <shiftDay>`. No upper bound, no "shift N days back" guard.
- **Failure scenario**: Edge case today (the sweep has been running since deploy, so the set is already empty most of the time). Failure mode for future: if anyone ever restores a backup, re-imports an old reservation, or writes a migration that sets older rows to `confirmed`, the next GET silently flips them all to `no_show`. No audit trail — the old status is gone.
- **Secondary concern**: every GET is a write. Fine at this scale, but inefficient and causes needless DB churn for something that could run from a nightly cron.
- **Suggested fix**: Restrict the sweep to a narrow window (e.g. only the single previous shift day: `>= shiftDay - 1` and `< shiftDay`). Or move the sweep to the existing `/api/ping` cron (`vercel.json`).

---

### 8. `deploy.bat` uses `git add .` with a hard-coded commit message

- **Severity**: Medium
- **Category**: Deployment hygiene / secret-leak risk
- **Location**: `deploy.bat`, `deploy-coming-soon.bat`, `push-to-github.bat`
- **Problem**: `git add .` stages every file in the working tree. The `.gitignore` does exclude `.env*.local`, but any new secret file placed at the root (a future `.env.production`, a backup `.env`, a `credentials.json`) will be committed on the next `deploy.bat` run without the developer noticing. The commit message is also hardcoded and stale — e.g. `deploy.bat` currently reads `"Fix ReservationLike type (build). Split /host..."`, unrelated to whatever is actually being deployed.
- **Suggested fix**: Replace the scripts with `npm run deploy` that does `git status` + prompts, or just remove them and document `git push` in the README. At minimum, change `git add .` to staging specific paths, and require the commit message to be passed as an argument.

---

### 9. `@types/node@^25.6.0` mismatches any realistic Node runtime

- **Severity**: Medium
- **Category**: Dependency health / build correctness
- **Location**: `package.json:13`
- **Problem**: Vercel's Next 14 runtimes are Node 18/20/22. `@types/node@25` implies Node 25 API surface — types may reference builtins that don't exist at runtime (`TextEncoderStream` extensions, new `buffer.File` shapes, etc.). Usually harmless (`skipLibCheck: true` is on in `tsconfig.json`), but the type mismatch hides real runtime issues.
- **Suggested fix**: Pin to `@types/node@^22` (match Vercel's current default) or whatever `node --version` reports on the deploy target.

---

### 10. `typescript@^6.0.2` — confirm the actual installed version

- **Severity**: Medium (Needs verification)
- **Category**: Dependency health
- **Location**: `package.json:23`
- **Problem**: TypeScript's public release track was still on 5.x as of early 2025. If v6 has shipped by now (April 2026), this is fine; otherwise npm has been silently falling back or pulling from a tag. Check `package-lock.json` for the resolved version.
- **Suggested fix**: Verify `npx tsc --version` matches `package.json`. If not, align.

---

### 11. No security headers configured

- **Severity**: Medium
- **Category**: Security hardening
- **Location**: `next.config.js` (entire file)
- **Problem**: No CSP, no HSTS, no `X-Frame-Options`, no `Referrer-Policy`. For a public site that holds customer PII (name, phone, email, reservation history) this is light. The admin session cookie is `Lax`, so clickjacking is the main residual risk.
- **Suggested fix**: Add a `headers()` export in `next.config.js`:
  ```js
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      ],
    }]
  }
  ```

---

### 12. Swipe-to-no-show is destructive without confirmation

- **Severity**: Medium
- **Category**: Hostess UX
- **Location**: `app/host/shared.tsx:200-234, 262-287`
- **Problem**: Swipe right + tap `no_show` fires immediately. The 35% snap threshold + 8px direction-decide threshold help, but an accidental swipe on a bumpy service tablet still commits. There is an undo button, but it only appears after expanding the card (`shared.tsx:397-405`) — and only on `/host/marked`, not on the main queue.
- **Failure scenario**: Hostess swipes on row A, intends to tap the "arrived" side (teal), hits the "no_show" side (burgundy) by mistake. Row disappears to `/host/marked`. Customer is standing at the door, confused.
- **Suggested fix**: Add a 3-second "Undo" toast immediately after any destructive mark (same pattern Gmail uses). No modal confirmation — that would slow service too much.

---

### 13. Admin dashboard does not refresh; hostess actions invisible

- **Severity**: Medium
- **Category**: UX / concurrency
- **Location**: `app/admin/page.tsx` (no `setInterval`, no realtime subscription)
- **Problem**: Unlike `/host` (polls every 60s), the admin dashboard loads once and only updates when the admin takes an action. During service, the admin's view diverges from reality within minutes.
- **Suggested fix**: Add a 30–60s poll like `/host`, or use Supabase realtime on the `reservations` table. Polling is simpler and matches the existing pattern.

---

### 14. `clientIp()` trusts `x-forwarded-for` without validating proxy origin

- **Severity**: Medium
- **Category**: Security (rate limit bypass)
- **Location**: host-login IP extraction (via `headers()` in `/api/host/login`, per earlier exploration)
- **Problem**: On Vercel behind their edge, `x-forwarded-for` is trusted — fine. But if the app is ever self-hosted (or someone flips a proxy), the header is attacker-controlled. An attacker can rotate the first IP in `x-forwarded-for` per request and never trigger the 5-attempt lockout, brute-forcing the 4-digit PIN (worst case: 10000 tries to cover the space).
- **Suggested fix**: Read IP from the connection (`req.ip` where available), or use Vercel's `x-real-ip` as primary and ignore client-supplied `x-forwarded-for`. Additionally: add a global per-PIN backoff (after 100 total failed attempts across all IPs, freeze the endpoint for 5 min) — this is cheap in-memory and blocks horizontal scaling bypasses.

---

### 15. `/api/ping` uses the service-role Supabase client

- **Severity**: Low
- **Category**: Secret hygiene / least privilege
- **Location**: `app/api/ping/route.ts` (per earlier exploration)
- **Problem**: The cron warmup doesn't need write access. It imports `getServiceClient()` anyway. Low-impact today (server-only), but if someone refactors the route to log errors or surface status to a public caller, it widens the surface of a privileged client.
- **Suggested fix**: Either (a) drop the DB call entirely — a 200 from the route is enough to warm the function, or (b) use `getSupabase()` (anon).

---

### 16. Notes field is not capacity- or PII-boundary-validated

- **Severity**: Low
- **Category**: Data integrity / PII
- **Location**: `app/api/reservations/route.ts:58` (schema: `notes: z.string().optional()`)
- **Problem**: `notes` has no length limit — a single reservation can carry 1MB of customer text into the DB. It also has no content filter; a customer can paste a phone number, email, or credit card into notes and it'll be stored indefinitely.
- **Suggested fix**: `z.string().max(500).optional()`.

---

### 17. Phone regex accepts any 10-digit string starting with 0

- **Severity**: Low
- **Category**: Validation
- **Location**: `app/api/reservations/route.ts:55`, `app/api/reservations/[id]/route.ts:39`, `lib/resend.ts` (recipients)
- **Problem**: `/^0[0-9]{9}$/` accepts `0000000000`, `0123456789`, landline-shaped numbers. No verification that the number is reachable. Hostess calls late reservations; a bogus number wastes her time during service.
- **Suggested fix**: Tighten to mobile only: `/^05[0-9]{8}$/`. Or add SMS OTP at booking time (bigger change, better fraud control).

---

### 18. RLS enabled but zero policies — deny-all by design, no defense-in-depth

- **Severity**: Low (documentation / Needs verification)
- **Category**: Database security
- **Location**: `supabase-schema.sql` (`alter table ... enable row level security;` with no `create policy` statements)
- **Problem**: Correct — deny-all with service-role bypass is a valid pattern. But: if the service-role key ever leaks (it's in Vercel env, but still), there is no second line of defense; anyone with that key has full table access. And future contributors may be confused by the empty-policies shape.
- **Suggested fix**: Add a comment at the top of `supabase-schema.sql` documenting the "deny-all, service-role-only" choice. Consider rotating `SUPABASE_SERVICE_ROLE_KEY` periodically.

---

### 19. Duplicated `VALID_TIMES` constant in three places

- **Severity**: Low
- **Category**: Code quality
- **Location**: `app/api/reservations/route.ts:38-47`, `app/api/reservations/[id]/route.ts:21-30`, `lib/capacity.ts:26-35`
- **Problem**: Three copies of the same IIFE generating 19:00–21:30 slots. When the restaurant adds a 18:30 seating (or a Sunday-only 22:00 slot), the constant has to be changed in three files. This is the exact spot where per-CLAUDE.md "copy-pasting is fine until it isn't" has tipped — it is now three files.
- **Suggested fix**: Move `VALID_TIMES` to `lib/capacity.ts` (where it already lives) and re-export; delete the other two.

---

### 20. `.gitignore` has duplicated entries

- **Severity**: Low
- **Category**: Cleanup
- **Location**: `.gitignore:19, 33` (`.env*.local`) and `:22, 32` (`.vercel`)
- **Problem**: Not harmful, just messy.
- **Suggested fix**: Remove duplicates.

---

### 21. `ADMIN_PASSWORD` still referenced in `.env.local.example`

- **Severity**: Low
- **Category**: Dead config
- **Location**: `.env.local.example`
- **Problem**: Google OAuth replaced password auth in commit 469a33c. The deprecated endpoint (`app/api/admin/login/route.ts`) returns 410. But `.env.local.example` still lists `ADMIN_PASSWORD=cayo2026`. Confusing for anyone bootstrapping a new environment.
- **Suggested fix**: Remove `ADMIN_PASSWORD` from `.env.local.example`.

---

### 22. No automated tests

- **Severity**: Medium (cross-cutting)
- **Category**: Reliability
- **Problem**: No `__tests__`, no Vitest/Jest config, no Playwright. Reservation capacity math, shift-day logic, and host PATCH authorization are all pure functions that would be trivial to unit-test — and all three are the exact spots where the critical bugs above live.
- **Suggested fix**: Add Vitest with unit tests for `lib/capacity.ts` (`computeAvailability`, `checkSlotAvailability`), the future shared `shiftDayLocal`, and the PATCH authorization branches in `app/api/reservations/[id]/route.ts`. 20 focused tests would cover the critical surface.

---

## Executive summary

Cayo is a small, well-structured app — NextAuth + Google allowlist for admins, HMAC-signed cookies + timing-safe PIN comparison for hostess, service-role Supabase only on the server, Zod validation on every non-trivial input, no `dangerouslySetInnerHTML`, no raw SQL. The auth model is sound. The critical issues are concentrated in two areas: **concurrency on reservations** (no optimistic lock; capacity race on PATCH; admin view doesn't refresh) and **timezone discipline** (a second `todayLocal()` function bypasses the correct Israel-aware version and breaks the hostess at shift end; client-side late-detection depends on the tablet's clock). Email confirmations are coded but never called. Public booking POST has no rate limiting. Nothing catastrophic, but enough to disrupt live service on a busy night.

## Top 5 urgent issues (fix first)

1. **#1 — Host PATCH uses server-UTC date.** Hostess gets 403 on every tap during the last hour of service. Lift `shiftDayLocal` into `lib/` and reuse.
2. **#3 — No optimistic lock on PATCH.** Admin edits silently overwrite hostess status changes during service. Add `updated_at` CAS or scope admin patches to dirty fields only.
3. **#2 — Public POST has no rate limiting.** One script fills capacity with `pending` garbage and halts bookings. Add IP throttle.
4. **#4 — Confirmation emails never sent.** Customer trust issue with a fix that is effectively one line.
5. **#5 — Late detection depends on tablet clock.** Misconfigured tablet = missed late arrivals. Use `Intl.DateTimeFormat` with `Asia/Jerusalem` on the client or ship server time down.

## Top 5 longer-term improvements

1. **Add automated tests (#22).** Unit tests for capacity, shift-day, PATCH auth branches — the exact places critical bugs live.
2. **Capacity re-check on PATCH (#6).** Admin reschedules should respect the same capacity gate as customer bookings.
3. **Narrow the auto-no-show sweep (#7).** Bounded window + move to cron; stop running writes on every GET.
4. **Replace `.bat` deploy scripts (#8).** `git add .` with a hardcoded message is a footgun.
5. **Add security headers (#11).** Cheap, easy, correct.

## Dependency health

- `typescript@^6.0.2` — verify installed version matches (check `package-lock.json`; if TS 6 has not shipped, npm is silently substituting).
- `@types/node@^25.6.0` — Vercel's Next 14 runtimes are Node 18/20/22. Pin to `^22`.
- `zod@^4.3.6`, `next@^14.2.35`, `next-auth@^4.24.11`, `resend@^6.10.0`, `@supabase/supabase-js@^2.103.0` — all current/healthy.
- Recommend `npm audit --production` before next deploy; results not checked in this read-only pass.
