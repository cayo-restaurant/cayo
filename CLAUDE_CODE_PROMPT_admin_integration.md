# Task: Tighten the integration between Reservations, Shift, and Map admin screens

You are working on the `cayo` restaurant reservation system (Next.js 14 App Router + Supabase + NextAuth). The admin area at `/admin` is used by the on-shift hostess. Today the three admin screens (shift/home, reservations, map) share a database but barely talk to each other. Your job is to close the gaps.

## Current state — what I already know (do not re-investigate from scratch)

- **`app/admin/page.tsx`** — the real home / shift screen. Lists today's reservations (status: pending / confirmed / arrived / cancelled / no_show). Shows "צוות הערב" from `shifts`. Pulls from `/api/reservations` (each row already includes a hydrated `tables: AssignedTable[]`). Refreshes every 60s.
- **`app/admin/reservations/page.tsx`** — just redirects to `/admin`.
- **`app/admin/map/page.tsx`** — a "dumb" editor for `restaurant_tables` (shapes, positions, capacity). Does **not** load reservations. Uses `/api/admin/map/tables`.
- **`app/admin/components/TablePickerModal.tsx`** — the only bridge between a reservation and the map. Opened from the 🪑 button on a reservation row. Assigns tables via `POST /api/reservations/{id}/tables`, which writes to the `reservation_tables` junction table (`is_primary` flag marks the primary table).
- **Stores:** `lib/reservations-store.ts`, `lib/assignments-store.ts`, `lib/capacity.ts`. Israel timezone, 04:00 shift-day cutoff.

## The four problems to solve

### Problem 1 — Map doesn't show live occupancy
The map editor shows all tables in one neutral state regardless of whether a reservation is currently seated there. The hostess can't glance at the map and know what's free right now.

**Fix:**
- Add a view-mode toggle on `app/admin/map/page.tsx`: `Edit` (current behavior) vs `Live` (new).
- In `Live` mode, load today's reservations from `/api/reservations` and compute per-table status:
  - `occupied` — a reservation with status `arrived` is currently assigned to this table (use Israel TZ + 04:00 cutoff for "today"; reuse `lib/capacity.ts` helpers if present).
  - `reserved_soon` — a `confirmed` or `pending` reservation is assigned to this table within the next 90 minutes.
  - `free` — otherwise.
- Color the table shapes accordingly (occupied = red/solid, reserved_soon = amber, free = green). Keep colors accessible — don't rely on hue alone; add a small corner badge with the reservation initials + time.
- Tapping a table in `Live` mode opens a read-only popover listing the reservations on it today (name, guests, time, status). From the popover, allow status change (pending → confirmed → arrived) via the existing `PATCH /api/reservations/{id}` endpoint.
- In `Edit` mode everything behaves exactly as today. Editing tools should be **hidden** in `Live` mode so the hostess can't accidentally drag a shape.

### Problem 2 — Deleting a table orphans its assignments
`DELETE /api/admin/map/tables/{id}` today removes the row from `restaurant_tables`, but rows in `reservation_tables` that point to it remain.

**Fix (defense in depth — do all three):**
1. In the DELETE handler (`app/api/admin/map/tables/[id]/route.ts`), before deleting, count active assignments:
   ```sql
   select count(*) from reservation_tables rt
   join reservations r on r.id = rt.reservation_id
   where rt.table_id = $1
     and r.status in ('pending','confirmed','arrived')
     and r.shift_date >= <today in IL TZ>
   ```
   If > 0, return `409 Conflict` with a payload listing affected reservations (id, name, time) so the map UI can show "Can't delete — 3 future reservations are assigned. Reassign them first."
2. In the map UI, when the user clicks Delete on a table, show a pre-flight check (call the same endpoint with `?dryRun=1`) and surface the blocking reservations with a "Reassign…" button that opens the TablePickerModal for each one.
3. Add a Supabase migration that sets `reservation_tables.table_id` to `ON DELETE RESTRICT` so even direct DB deletes fail safely. Migration goes under `supabase/migrations/` following the existing naming convention.

### Problem 3 — Shift screen doesn't reason about real capacity
Right now the home screen just displays `guests` per reservation. It doesn't know whether the actual assigned tables can seat them, and it doesn't flag overbooked time slots against the real floor.

**Fix:**
- Extend `lib/capacity.ts` with `computeFloorCapacityAt(dateTime)` that sums the capacity of all `restaurant_tables` minus the capacity already committed to overlapping assignments.
- On `app/admin/page.tsx`, add a compact "Floor load" strip at the top showing 30-min buckets across tonight's service with: `booked guests / real seat capacity`. Red when over, amber within 10%, green otherwise.
- On each reservation row, if the assigned tables' combined `seats` is less than `guests`, show a warning chip `"Undersized: 6 guests on 4 seats"`.
- Do **not** change the database schema for this — it's pure UI + a derived calculation.

### Problem 4 — No live sync between screens
Today the shift screen polls every 60s and the map doesn't poll at all. Two hostesses on two devices can stomp each other.

**Fix:**
- Use Supabase Realtime. Subscribe to changes on `reservations`, `reservation_tables`, and `restaurant_tables` from both `app/admin/page.tsx` and `app/admin/map/page.tsx` (Live mode).
- Put the subscription logic in a shared hook at `lib/hooks/useAdminRealtime.ts` that merges incoming events into the caller's local state.
- Keep the 60s poll as a fallback (in case the websocket drops).
- When a `reservations` or `reservation_tables` change arrives while `TablePickerModal` is open, show a small toast "Reservations updated — refreshing conflicts" and refetch the modal's state.

## Constraints and rules

- **RTL + Hebrew UI.** All new strings must be in Hebrew. Keep existing Hebrew strings intact. Match the tone of the current hostess UI — short, glanceable, imperative.
- **Glanceability first.** The hostess uses this under pressure. Big tap targets (≥ 44px), no hover-only interactions, no modals stacked on modals.
- **Israel timezone + 04:00 shift-day cutoff** — use the existing helpers, don't roll your own.
- **No new external deps** unless absolutely necessary; if you add one, justify it in the PR description.
- **Don't run `git` from inside your sandbox** — the repo lives on OneDrive and git writes will fail. Leave commits to the user. Just write the files.
- **TablePickerModal is the canonical assignment UI.** Don't create a second picker. Reuse it from the new map popover if needed.
- **Tests:** Where stores exist under `lib/`, add unit tests for new pure functions (`computeFloorCapacityAt`, the Live-mode table-status classifier). No need for full E2E.

## Deliverables

1. Code changes in `app/admin/`, `app/api/admin/`, `lib/`, and `supabase/migrations/` as described.
2. A brief `docs/admin-integration.md` (Hebrew) that explains to the hostess how Live mode works, what the warning chips mean, and what the floor-load strip shows.
3. A short PR description at the end of your turn listing every file you changed, grouped by problem # (1/2/3/4), so the user can review per-problem.

## How to proceed

1. Start by reading the files I listed above to confirm the current shape of the data before writing code.
2. Do Problem 2 first (cheapest, prevents data corruption).
3. Then Problem 1 (most user-visible win).
4. Then Problem 3.
5. Problem 4 last — it's the most invasive.
6. After each problem, pause and summarize what changed before moving to the next.

If something in the codebase doesn't match what I described above, trust the code and tell me what's different before changing direction.
