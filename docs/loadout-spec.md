# Loadout — build spec

Working document for Claude Code. Originally written against an assumed
"Express + JSON file" chore tracker; reconciled against the real repo on
2026-09-19. Decisions Bryce made that day are recorded in §0 and folded into
the sections below — the original **[CONFIRM]** markers are resolved.

---

## 0. Decisions log (2026-09-19)

| Question | Decision |
|---|---|
| Persistence | **Postgres**, `loadout.*` schema on the existing `DATABASE_URL`. The spec's JSON-file layout is mirrored as tables. (JSON files already failed once on redeploy — that's why `/chores` moved to Postgres.) |
| Opening balance | **Carry the "saved" half**: sum of each old week's `saved` (= floor(earned/2)) → 5,330 coins at 1 coin = 1 TWD. Spend halves treated as already paid out. One `adjust` ledger entry, audit blob in `loadout.legacy`. |
| Old household chores | **Carry over, prune later** — all 8 imported as enabled quests (`simple`/`count`, coins = old NT, XP 0, not required for streak). Bryce disables the unwanted ones from `/hq/quests` when that screen lands (phase 2). |
| Phone at school | **No — paper.** Parent prints a slip from `/hq/list`; Edward ticks it at his locker; at home he transcribes into `/pack` and submits. Same award rules. |
| Auth | HQ behind a single PIN (`HQ_PIN` env → HttpOnly cookie, 5-strikes lockout). Edward's routes are open, like `/chores` was. No user system. |
| `coinValue.perCoin` | **1 TWD.** Set once; don't change retroactively. |
| Streak on weekends | Days with nothing required are **exempt** (skipped, not broken). With the current config that means Sat/Sun only require the 7-day quests. |
| Math Academy XP | Self-entry in v1. Still the weakest link. |
| Mount point | `/loadout` (Edward) and `/loadout/hq` (parent). `/chores` stays live until phase 2 cutover, then 301s. |

---

## 1. What this is

An existing chore tracker (`/chores`, single-file SPA + one JSONB row in
Postgres) becomes **Loadout**: a daily quest tracker for one eleven-year-old,
Edward, with a parent review surface.

The app exists to solve one concrete problem — Edward forgets to bring books and
papers home from school — and then to carry the rest of his daily routine on the
same rails. **The pack check is the primary feature.** Everything else is
supporting structure. If a design decision trades off pack-check reliability
against anything else, pack check wins.

### Users

- **Edward**, 11. Phone or tablet, at home. Uses it 2–3 times a day: transcribes
  the paper pack slip after school, quest check-ins in the evening, redemption
  at night.
- **Parent** (Bryce or Ying-Lu). Desktop. Writes tomorrow's list and prints the
  slip, verifies what actually arrived, approves redemptions.

### Non-goals

- No multi-family, multi-tenant, or account system. One kid, one household.
- No collectible characters, avatars, or unlockable cosmetics.
- No push notifications in v1.
- No mobile app. Responsive web only.

---

## 2. Existing state (as actually found)

- Root `server.js` (Express 4, Node 20 in Docker / 22 local) serves several
  static sites and small APIs. `/chores` is a 995-line vanilla single-file SPA;
  its state is one JSONB row in `chores.state` behind `GET/POST /api/chores`.
- No build step, no frontend framework. Keep it that way.
- Live data at import time: 38 weeks from 2025-12-29, 8 chores paid in NT
  (5–100 each), 10,680 NT lifetime earned, no payout/spend records.
- Migration: `scripts/migrate-chores-to-loadout.js` (idempotent, dry-run
  supported, never modifies `chores.state`).

---

## 3. Core concepts

**Quest** — a recurring task. Kinds: `packCheck`, `externalXp` (Math Academy),
`duration` (minutes), `simple` (done/not done), `count` (per-unit, e.g.
pushups). `cadence` is `daily` (default) or `weekly` with `timesPerWeek`.

**Power-up** — an effort claim attached to a check-in. Power-ups pay for *how*
the work was done, never for how well it turned out. This is deliberate and is
the most important scoring rule in the app: Math Academy is designed to keep
Edward at the edge of his ability, so paying for accuracy would teach him to
avoid hard material.

**Pack check** — the daily list of things to bring home, written by a parent in
the morning (printed as a slip), ticked by Edward at his locker on paper,
transcribed and submitted by Edward at home, verified by a parent at home.

**Currencies** — three, earned together and spent separately:
- **XP** — no redemption value. Drives levels. Never decreases.
- **Coins** — redeemed for real things, including money. 1 coin = 1 TWD.
- **Screen minutes** — redeemed for screen time.

**Streak** — consecutive days with all required quests logged. Tracked and
displayed separately from XP. A broken streak resets the streak counter and
nothing else: XP and coins are never clawed back.

---

## 4. Data model

Postgres schema `loadout` (bootstrapped by `loadout/lib/store.js` on startup):

```
loadout.config    singleton JSONB   quests, powerUps, rewards, levels, coinValue, pack.recurringItems
loadout.days      date PK + JSONB   one record per day: packCheck + checkins
loadout.ledger    append-only rows  kind earn|spend|adjust, xp, coins, screen_minutes, source, note
loadout.requests  rows              reward requests (phase 3)
loadout.legacy    singleton         verbatim chores.state blob + import summary
```

### Rules that apply to all persistence

- **Balances are derived, never stored.** `SUM()` over the ledger.
- **Writes are atomic.** Day records are read-modify-written under
  `SELECT … FOR UPDATE`; an award and the day record that earned it commit in
  the same transaction.
- **Day boundaries are `Asia/Taipei`.** Timestamps are ISO 8601 with `+08:00`;
  date keys are derived in local time via `loadout/lib/tz.js`. Never use UTC
  date arithmetic to decide what "today" is.
- Ledger rows are append-only. Corrections are new rows of kind `adjust`,
  never edits.

### Config

Seed lives in `loadout/lib/default-config.js` (quests, power-ups, rewards as in
the original spec, plus `pack: { mode: 'paper', recurringItems: [] }` and
`enabled` / `requiredForStreak` / `cadence` on quests). Legacy chores are
appended by the migration.

### Day record

```json
{
  "date": "2026-09-19",
  "packCheck": {
    "writtenAt": "2026-09-19T07:20:00+08:00", "writtenBy": "parent",
    "items": [
      { "id": "itm_01", "label": "Science textbook", "source": "parent", "checked": true,  "checkedAt": "2026-09-19T15:41:00+08:00" },
      { "id": "itm_06", "label": "Permission slip",  "source": "child",  "checked": false, "checkedAt": null }
    ],
    "submittedAt": "2026-09-19T15:43:00+08:00",
    "awarded": { "xp": 10, "coins": 2, "screenMinutes": 0 }, "ledgerId": "txn_2",
    "verification": { "verifiedAt": "…", "arrived": ["itm_01"], "missing": ["itm_03"], "note": "Reading log ticked but not in bag" }
  },
  "checkins": [
    { "id": "chk_…", "questId": "math-academy", "value": 40, "focusMinutes": 25,
      "powerUps": ["started-promptly", "stayed-with-hard"], "targetMet": true,
      "awarded": { "xp": 14, "coins": 4, "screenMinutes": 10 },
      "loggedAt": "2026-09-19T16:30:00+08:00", "status": "confirmed" }
  ]
}
```

`status` is one of `pending`, `confirmed`, `adjusted`. Quests with
`requiresParentConfirm: false` are written straight to `confirmed`. `awarded`
is the computed total; `paid` is what has actually hit the ledger so far
(`ledgerIds` lists the rows) — the two differ while pending or below target.

### Ledger row (as returned by the API)

```json
{ "id": "txn_2", "at": "2026-09-19T16:30:00+08:00", "kind": "earn",
  "xp": 10, "coins": 2, "screenMinutes": 0,
  "source": { "type": "packCheck", "date": "2026-09-19" }, "note": "" }
```

Spends carry negative coins or screen minutes and zero XP.

---

## 5. Scoring rules

Implemented as pure functions in `loadout/lib/scoring.js`, locked by
`loadout/test/scoring.test.js`.

1. **A quest pays when it is logged and its target is met.** Below target, it
   pays nothing and stays open. `externalXp` compares `value` to `target`;
   `duration` compares minutes to `target`. `count` pays per unit, no target.
2. **Power-ups pay additively and independently of the outcome.** A check-in
   below target still pays its power-ups. Only the quest's own power-ups count;
   duplicates don't double-pay.
3. **Pack check pays for the logging, not the score.** Submitting with at least
   one item ticked pays full XP and coins, whether he ticked three of five or
   five of five — and pays **once**: reopen + resubmit does not pay again.
   Parent verification records what actually arrived and feeds the history
   view; it never adjusts the award.
4. **Streaks never touch currency.** A missed day resets `streak` to zero and
   leaves XP, coins and screen minutes untouched. Days with nothing required
   (weekends; school days where no list was written) are exempt. Today doesn't
   break the streak while still in progress.
5. **Levels are derived from lifetime XP** (sum of positive XP rows), not
   current balance. Linear, 400 XP per level.
6. **Redemption is a request, then an approval.** Coins leave the balance on
   approval, not on request. A denied request writes nothing.
7. **Parent adjustments are ledger entries of kind `adjust`** with a required
   note.

---

## 6. Screens

All paths below are under `/loadout`.

### Edward (390px, phone-first, dark HUD) — `public/index.html`

**`/` — Today.** Currency strip (XP, coins, screen minutes), level and progress,
streak. Pack check as a pinned primary card when there's a list and it isn't
submitted; a done card once it is. Below it, today's quests with award. Bottom
nav: Today, Pack, Vault, Log.

**`/pack` — Pack check (paper mode).** Copy: "Fill this in from your slip when
you get home." Parent-written items first under "From this morning", then
"Came up today" with the items he added plus two blank lines and "Add one more
line". Blank lines save on blur/Enter (unticked) or on tapping the box (ticked).
A single confirm button: "Packed — lock it in". Locked after submit; a parent
can reopen from HQ.

Touch targets minimum 44px; pack rows are 60px.

**`/quest/:id` — Quest check-in.** Stepper for external XP / minutes / counts
(±1/±5 or ±5/±10), a single "Mark done" toggle for simple quests, an optional
focus timer (persists in localStorage; "Use N min" fills minutes for duration
quests, saves focus minutes otherwise), the quest's power-ups as large toggles
with plain-language labels, and a sticky running total that shows what's *new
since the last log*. Re-logging can only add. Paid power-ups lock; confirmed or
adjusted check-ins lock entirely.

**`/log`** — the ledger, newest first, grouped by day: pack checks, quests,
adjustments (with the parent's note), the starting balance.

**`/vault`** — phase 3.

### Parent (1280px, desktop, light) — `public/hq.html`

**`/hq` — Daily log.** Date nav, week stat tiles (lists written / submitted /
verified / ticked-but-missing / coins / XP), the day's pack check with
per-item *Arrived / Missing* toggles and a note, "All arrived" and
"Ticked = arrived" shortcuts, reopen, the Mon–Fri week strip (L/S/V dots),
ticked-but-missing and not-ticked lists for the week, pending approvals.

**`/hq/list` — write the pack list.** Date chooser (Today / Tomorrow / Next
school day / picker; defaults to today before noon Taipei, else next school
day). Item editor with Enter-to-add and Backspace-to-remove, **Copy last list**,
**recurring items** (click-to-add chips, saved in config), Save, **Print slip**
(`/hq/slip/:date`, print CSS: checkboxes + three blank lines + instructions).
Locked once Edward has submitted.

**`/hq/history`** — by-weekday table (lists, submitted, ticked %, arrived %,
ticked-but-missing, not-ticked) and per-day rows. Ticked-but-missing is a
packing problem, not-ticked is an attention problem — they need different
fixes. Seeded now; phase 4 expands it.

**`/hq`** also lists the day's check-ins (value, power-ups, status, award,
Adjust) and a **Pending approvals** card with Confirm / Adjust for
`requiresParentConfirm` quests across the last 30 days.

**`/hq/quests`** — every quest as a card: enable switch, reorder, edit form
(name, kind, target, unit, XP/coins/screen, per-unit for counts, cadence and
times-per-week, active days, parent-confirms, counts-for-streak, power-ups),
two-step delete, new quest. Power-ups are edited on the same page.

**`/hq/rewards`**, **`/hq/settings`** — phase 3.

---

## 7. API surface (`/api/loadout`)

```
GET  /today                              Edward's home screen bundle (day, quests, balances, level, streak)
GET  /balances                           derived from ledger (+ level)
GET  /ledger?limit=                      newest first
GET  /config                             open
PUT  /config                             hq — must keep the pack-check quest
GET  /day/:date                          full day record
POST /day/:date/pack/items               hq — writes/replaces parent items; keeps child items + ticks by id; 409 if submitted
POST /day/:date/pack/items/add           child adds { label, checked }
POST /day/:date/pack/tick                { itemId, checked }; 409 after submit
POST /day/:date/pack/submit              awards once, writes ledger in the same tx
POST /day/:date/pack/reopen              hq — unlock; no clawback, no second award
POST /day/:date/pack/verify              hq — { arrived[], missing[], note }
GET  /history/pack?weeks=4               per-day stats + byWeekday aggregates
GET  /hq/overview?date=                  hq — daily-log bundle
GET  /hq/last-list?before=               hq — most recent parent-written list
POST /hq/login { pin } · POST /hq/logout · GET /hq/session
POST /day/:date/checkin                  { questId, value, focusMinutes, powerUps } → creates or re-logs; pays the delta
GET  /checkins/pending                   hq — pending across the last 30 days
POST /checkin/:id/confirm                hq — pays a pending check-in once
POST /checkin/:id/adjust                 hq — { awarded, note } → adjust row for the difference
--- phase 3 ---
POST /rewards/:id/request · POST /requests/:id/approve · POST /requests/:id/deny
```

---

## 8. Design tokens

Dark HUD for Edward's screens, light for Parent HQ.

```
Ground        #11141B      Surface       #1A1F2B      Surface alt  #151923
Border        #262D3B      Border strong #2C3342
Text          #F2F0EA      Muted         #A3ABBD
Accent (gold) #E8A33D      Success       #4CAF8E

Parent light: ground #F5F4F0, surface #FFFFFF, border #E2DFD8,
              text #1A1D24, muted #5C6270, gold #A9701A, green #2F7A5C

Display: Space Grotesk 500/700    Body: IBM Plex Sans 400/500/600
Radius: 10px controls, 12px cards, 16px primary card, 999px pills
```

No emoji anywhere in the UI — inline stroke SVG icons only (`common.js`). No
gradients. The look should read as a game HUD for an eleven-year-old, not a toy
for a seven-year-old.

---

## 9. Build order

Ship each phase working before starting the next.

**Phase 0 — migrate. ✅** Migration script written, dry-run + real run verified
against a copy of the live data (5,330 opening coins, 13 quests). Runs in prod
at phase 2 cutover, when `/chores` is redirected.

**Phase 1 — the pack loop. ✅** `/hq/list` (+ print slip), `/pack`, `/hq`
verification, history seed. Unit + API integration tests.

**Phase 2 — quests and currency. ✅** Check-in screen (stepper / done toggle,
focus timer, power-up toggles, running total), monotonic delta payouts,
pending → confirm → adjust in HQ, Today quest rows live, Log tab,
`/hq/quests` editor (quests + power-ups). `/chores` 301s automatically once the
migration has run — see the cutover runbook in `loadout/README.md`.

**Phase 3 — vault.** Rewards, requests, approvals, savings goals, `/hq/rewards`.

**Phase 4 — history.** Full week view, weekday patterns, ticked-vs-arrived.

---

## 10. Open questions

- Should the legacy chores pay any XP? Imported at XP 0 (they paid money, not
  levels). Editable in `/hq/quests` once it exists.
- Edward's routes are open on the public internet (as `/chores` was). A
  `KID_PIN` is a ten-line addition if that ever matters.
