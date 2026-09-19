# Loadout

Edward's daily quest tracker — successor to the `/chores` Mission Control app.
Spec: [`docs/loadout-spec.md`](../docs/loadout-spec.md). The pack check is the
primary feature; everything else is supporting structure.

```
loadout/
├── api.js               Express router factory, mounted at /api/loadout by server.js
├── lib/
│   ├── tz.js            Asia/Taipei day boundaries — every "what day is it" goes here
│   ├── scoring.js       Pure scoring rules (spec §5): awards, levels, streak
│   ├── store.js         Postgres layer: loadout.* schema, row-locked day writes, ledger
│   ├── auth.js          Parent HQ PIN gate (HQ_PIN env → HttpOnly cookie)
│   └── default-config.js  Seed config (quests, power-ups, rewards)
├── public/
│   ├── index.html       Edward's HUD (dark, phone-first): Today, Pack, Quest check-in, Log
│   ├── hq.html          Parent HQ (light, desktop): Daily log (+approvals), Pack list, Quests, History
│   └── common.js        Shared API client, date helpers, router, SVG icons
└── test/                node:test — unit (tz, scoring) + API integration
```

## Running

```bash
DATABASE_URL=postgres://… HQ_PIN=1234 npm start     # root server, port 80
open http://localhost/loadout/        # Edward
open http://localhost/loadout/hq      # parent (PIN)
```

`HQ_PIN` unset = HQ is open (dev only; the server warns). Set `HQ_SECRET` too
if you want to rotate the PIN without invalidating cookies… or don't, and
changing the PIN signs everyone out, which is usually what you want.

## Tests

```bash
npm test                                             # unit tests only
TEST_DATABASE_URL=postgres://…/scratch npm test      # + API integration (TRUNCATES loadout.*)
```

## Phase 0 — migrating from /chores

`scripts/migrate-chores-to-loadout.js` reads the `chores.state` singleton and:

- appends the 8 household chores to `loadout.config` as quests (`simple` /
  `count`, coins = old NT value, `requiredForStreak: false`, enabled — prune
  from HQ later);
- writes one `adjust` ledger entry for the opening coin balance: the sum of
  every week's *saved* half (5,330 as of 2026-09-19), on the rule that the
  spend half was already paid out; 1 coin = 1 TWD;
- stores the original blob verbatim in `loadout.legacy` and refuses to run twice.

```bash
DATABASE_URL=… node scripts/migrate-chores-to-loadout.js --dry-run
DATABASE_URL=… node scripts/migrate-chores-to-loadout.js
```

It never touches `chores.state`. Once the `loadout.legacy` row exists,
`server.js` starts 301-ing `/chores` → `/loadout/` (checked at most once a
minute), so the cutover is the script run itself — no second deploy.

### Cutover runbook (production)

1. Deploy a build that includes phase 2 (this README's commit or later).
2. Set `HQ_PIN` if it isn't already.
3. Dry-run against prod, read the summary, then run for real:
   ```bash
   # inside the container (scripts/ is copied into the image) …
   node scripts/migrate-chores-to-loadout.js --dry-run
   node scripts/migrate-chores-to-loadout.js
   # … or from your machine with the production DATABASE_URL exported.
   ```
4. Within a minute `/chores` redirects, Edward's coin balance shows the opening
   amount, and the 8 chores appear as quests. Prune them in `/loadout/hq/quests`.

## Data model (Postgres, schema `loadout`)

| table      | shape                                   | notes |
|------------|-----------------------------------------|-------|
| `config`   | singleton JSONB                         | quests, power-ups, rewards, `pack.recurringItems` |
| `days`     | `date` PK → JSONB day record            | `packCheck` + `checkins`; written under `SELECT … FOR UPDATE` |
| `ledger`   | append-only rows (`earn`/`spend`/`adjust`) | balances are `SUM()`s, never stored |
| `requests` | reward requests (phase 3)               | |
| `legacy`   | verbatim chores blob + import summary   | audit trail for the opening balance |

## Check-ins (phase 2)

One check-in per quest per day. `POST /day/:date/checkin` creates or
**re-logs** it: the award is recomputed from `value` + `powerUps` and only the
delta over `paid` is written to the ledger. Deltas must be ≥ 0 for Edward (add
minutes or a power-up, never remove; `409` otherwise) — lowering is a parent
`adjust`. Rule 2 falls out of this naturally: power-ups pay on the first log
even below target, and the base pays later when the target is reached.

- `requiresParentConfirm` quests sit at `status: pending` with nothing paid
  until `POST /checkin/:id/confirm`; afterwards Edward can't edit them.
- `POST /checkin/:id/adjust { awarded, note }` sets the award outright; the
  difference is an `adjust` ledger row carrying the note (required).
- Weekly-cadence quests (`cadence: 'weekly'`, `timesPerWeek`) can be logged
  on any active day, capped per Mon–Sun week.
- Edward may log today or yesterday; HQ may log any past day.
- Check-in ids embed the date (`chk_YYYYMMDD_xxxxxxxx`) so `/checkin/:id`
  routes can find the day row without a lookup table.

## Rules the code enforces (don't get these subtly wrong)

- Pack check pays on **submit with ≥1 tick**, full award regardless of score,
  exactly once — reopen + resubmit does not pay again. Verification records what
  arrived and never touches the award.
- Awards and the day record commit in the **same transaction**.
- Day keys come from `lib/tz.js` (Taipei). Never `new Date().toISOString().slice(0,10)`.
- Check-in payouts are monotonic deltas over `checkin.paid`; re-logging never
  pays twice for the same thing. `lifetimeXp` only sums positive rows, so a
  negative adjust lowers the balance but never the level.
- Streak: consecutive days where every *required* quest active that weekday is
  logged. Weekends with nothing required are exempt, as is a school day where no
  list was written (a parent's miss shouldn't break the kid's streak).
