# Loadout

Edward's pack check, activities, chores, XP rewards, and weekly payouts. Served
at `/loadout/`; parent controls at `/loadout/hq` (PIN through `HQ_PIN`).

## Earning rules (September 2026 update)

- Side quests award bonus XP even below the main target. Original definitions and assignments are restored once from the archived config. In HQ → Quests → Edit, choose side quests and set their XP per quest. Repeat logs pay only additional XP; parent confirmation also applies to bonuses.
- Activities can use **fixed XP on completion**: for example, 20 minutes of
  reading earns 10 XP. Below target pays zero, reaching target pays once, and
  extra minutes or repeated submissions do not increase the award. HQ → Quests
  lets parents choose the mode, target, and XP amount for each activity.
- Simple done/not-done tasks can pay XP as well: choose **XP for completing
  task** in their Task reward field and set the fixed amount.
- Reading, Math Academy, piano, and sports/outdoor time earn **1 XP per minute**
  by default. Each activity's whole-number rate is editable in HQ → Quests.
  Minutes below or above the daily target still earn XP. The target only
  controls completion/streak status. Math Academy now logs minutes, not its
  external XP score.
- The eight household chores keep their original NT rates, including NT$1
  per pushup and NT$10 for flossing. Chores earn money only; activities earn
  XP only. Pack checks continue tracking without currency awards. Power-up
  bonuses and new screen-minute awards are retired.
- Rewards have an **XP price**, editable in HQ → Rewards & payouts. A request
  reserves XP; parent approval spends it. Denial/cancellation releases it.
  Levels still use lifetime XP and do not drop when XP is spent.
- Chore money accrues as gross unpaid earnings. After each Monday–Sunday
  Taipei week, the parent records a payout: half savings (rounded down to
  whole NT), remainder cash. This records a real-world payout; it does not
  transfer money. Duplicate clicks cannot pay twice. A late chore can create
  an additional payout for that week, preserving the weekly rounding.
- Both surfaces show lifetime earnings, unpaid earnings, cash paid, savings
  contributions, and weekly history. Savings balance is separate from total
  savings contributions, so a parent balance correction does not erase history.

## Migration and deployment

**The first startup of this version migrates the existing database automatically
in one transaction.** `economyVersion: 2` makes subsequent startups no-ops.

1. Retain a database backup before deploying, as for any schema/data migration.
2. Startup reads `loadout.legacy` if already imported, otherwise `chores.state`.
   The original source is preserved verbatim in `loadout.legacy`. Its `economy-v1`
   archive also keeps the previous config, day records, and open requests.
3. All historical earnings are treated as paid, per the parent's instruction.
   Original weekly saved amounts are preserved; cash is the remainder. Previous
   Loadout earnings also contribute to the opening lifetime total and are settled.
   Existing XP and savings remain. Existing ledger rows are never rewritten.
4. All eight legacy chore definitions are carried forward. Activity rates start
   at 1 XP/min. Existing reward prices become XP prices using the old numeric
   coin + screen-minute cost; parents can edit these. The old pocket-money
   reward is disabled because cash is now paid weekly.
5. Open old reward requests are cancelled with an explanatory note so they can
   be requested at XP prices. Historical check-ins are retained and marked
   settled; they cannot be re-logged or adjusted under the new rules.
6. `/chores` redirects to Loadout after import. Its GET API remains readable;
   its POST API refuses new writes after cutover, including from stale tabs.

The read-only snapshot examined on September 26 had 39 weeks, NT$10,890 earned,
NT$5,434 saved and NT$5,456 cash, with zero owed after migration. These are audit
reference figures, not hard-coded production balances.

## Storage

Postgres on `DATABASE_URL`, schema `loadout`:

- `config`: singleton JSON; includes earning rules and immutable opening summary.
- `days`: daily pack check and activity/chore check-ins.
- `ledger`: append-only XP, unpaid NT (`coins` column), savings (`bank` column),
  and retained historical screen-minute entries. V2 earning rows identify their
  activity date and `source.economy: 2`.
- `payouts`: dated weekly cash/savings receipts. Payouts reduce unpaid NT and
  add savings through a ledger row, without reducing lifetime earned.
- `requests`: XP reward requests and suggestions.
- `legacy`: original chore data and import summary.

All balance-affecting transactions share a household advisory lock. This covers
first writes to a day, reward reservations/approvals, and weekly payouts. A
correction cannot reduce a week's earnings below money already paid out.

## APIs

- `GET /api/loadout/earnings`: totals, current weekly balances, historical weeks.
- `POST /api/loadout/earnings/:monday/pay`: parent records a completed week's
  outstanding cash/savings payout, returns 409 if nothing can be paid.
- Reward costs and suggestions use `{ xp: N }`.
- Existing check-in, pack, history and parent config routes remain.

## Development and tests

```sh
npm ci
DATABASE_URL=postgres://… HQ_PIN=1234 PORT=3097 npm start
npm test
# Disposable database only: tests TRUNCATE loadout tables.
TEST_DATABASE_URL=postgres://…/scratch npm test
```

Tests run serially because integration files share the scratch schema. Coverage
includes legacy scoring regression, V2 duration scoring, migration/idempotency,
concurrent first check-ins, weekly rounding and repeated payouts, and concurrent
XP reservations. `fixtures/legacy-config.js` keeps original rules available to
exercise historical behavior independently of the V2 defaults.
