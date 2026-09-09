# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running

```bash
bun server.ts                # http://localhost:4321
PORT=5000 bun server.ts      # override port
bun test                     # run the test suite (server.test.ts)
```

No build step, no package.json. Bun runs the TypeScript directly. The whole frontend is `index.html` (HTML + CSS + a `<script>` block) served as a static file — no bundler, no framework.

`server.ts` only binds its HTTP port under `import.meta.main`, and the DB path is `process.env.DB_PATH ?? "alphabet.db"`. That lets `server.test.ts` import the module against an in-memory DB and drive `handleApi` directly — no port, no fetch, no touching `alphabet.db`. It exports `{ grade, areaOf, handleApi, getStudent }` for that purpose. The suite covers the `grade` scheduler, `areaOf`, and the answer / undo / per-area-session / reset HTTP flows.

Data lives in `./alphabet.db` (SQLite, WAL mode). The `.db-wal` / `.db-shm` sidecars are part of an active SQLite WAL — don't delete them while the server is running. To back up, copy `alphabet.db` while the server is stopped.

## Architecture

Two files, both at the repo root:

- **`server.ts`** — Bun HTTP server. Owns the SQLite schema, prepared statements, SRS scheduling, and the JSON API under `/api/*`. Root `/` serves `index.html`.
- **`index.html`** — Single-file SPA. Fetches `/api/*`, renders the practice card, the letter grid, the phonics / sight-word / CVC / CVCe / book-word pills, the stats panels, and the teacher-facing roster, classes, and word-builder modals.

### Domain model

A **student** owns a set of **cards**. Cards come in five flavors that all share the same SRS state (`reps`, `ease`, `interval_days`, `due_at`, `lapses`, `total_seen`, `total_correct`, etc.):

- `cards` — one row per (student, letter). Letters are A–Z and/or a–z depending on the student's `case_mode` (`upper` / `lower` / `both`).
- `phonics_cards` — one row per (student, phonics_id). The `phonics` table is **global** — sounds are shared across all students, but each student has their own progress card per sound.
- `sight_word_cards` — one row per (student, sight_word_id). The `sight_words` table is **global** and seeded once on first boot with the **Fry First 100** (`FRY_FIRST_100` → `seedSightWords()`), in 4 groups of 25 with a canonical `position` order.
- `cvc_cards` — one row per (student, cvc_word_id). The `cvc_words` table is **global** and teacher-authored (no seed list). Each word is stored as `onset` + `rime` (e.g. `c`+`at`, `c`+`ake`) and tagged with a `kind` column: `cvc` ("cat"), `cvce` ("cake"), or `book` ("ship") — the level reader's words, whose onset is often a digraph (`sh`+`ip`, `tr`+`ain`) rather than a single letter. One table, three practice modes. Adding a further word family means adding a kind to `WORD_KINDS`, not a new table.

  The `kind` is the **stored key**; its user-facing name is display-only. `book` currently shows as **"Phonics Kids 4"** in the pill row, the sidebar panel, the word-builder tab, Mastery by area, and the report — so renaming the book is a label edit in `index.html`, never a data migration. (Trouble spots uses the short tag `PK4` to fit its inline chip.)

Each card kind belongs to a practice **area** (`areaOf(type)` in `server.ts`): letters + phonics share `main`; `sight`, `cvc`, `cvce`, and `book` each stand alone.

A student's `mode` (`alphabet` / `mixed` / `phonics` / `sight` / `cvc` / `cvce` / `book`, see `VALID_MODES`) picks which subset feeds the practice queue. `mixed` blends letters + phonics; the other modes each draw a single card kind.

**Daily sessions are per-area, not global.** Three session tables share the same `reviewed` / `correct` / `streak` / `new_introduced` columns: `sessions` (the `main` area — letters + phonics), `sight_word_sessions` (the `sight` area), and `area_sessions` (keyed by `(student, area, date)` — holds `cvc`, `cvce`, and `book`). `getSessionRow(studentId, area)` / `writeSessionRow(...)` transparently route to the right table. This keeps streaks, the new-per-day cap, and weekly stats separated by skill, so practicing sight words doesn't reset the CVC streak.

**Classes** group students for the teacher view: the `classes` table plus a nullable `students.class_id` FK. Deleting a class unassigns its students (`qUnassignClassStudents`) rather than deleting them.

### The `getStudent(id)` self-healing read

Every read goes through `getStudent` in `server.ts`, which on each call:

1. `ensureLetterCards` — inserts any missing letter cards for the student's current case mode.
2. `ensurePhonicsCards` — backfills card rows for any phonics sounds that don't yet have a card row for this student.
3. `ensureSightWordCards` — backfills card rows for the global Fry sight words.
4. `ensureCvcCards` — backfills card rows for the global CVC/CVCe/book words (all one table, so one backfill covers every kind).
5. `rollSession` — inserts today's session row for **every area** (`main`, `sight`, `cvc`, `cvce`, `book`) if absent.

This is why creating a new card-bearing entity also backfills every existing student: `POST /api/phonics` runs `qBackfillPhonicsCardsForPhonics`, and `POST /api/cvc` runs `qBackfillCvcCardsForWord`. And why changing `case_mode` re-runs `ensureLetterCards` — the lowercase rows may not exist yet. When adding a new card-bearing entity, follow the same pattern: backfill on creation **and** make `getStudent` idempotently ensure rows exist — and if it should track its own daily streak, give it an area + a `rollSession` row.

### SRS (SM-2 lite)

`grade(card, correct)` in `server.ts` is the single source of truth for scheduling:

- Correct: `reps++`, interval goes 1 → 3 → `round(prev * ease)`, ease nudges up (cap 2.8).
- Incorrect: `reps = 0`, `lapses++`, interval to 0, ease drops by 0.2 (floor 1.3), card re-due in 60s.

Intervals are still **calendar days** (the forgetting curve runs on real elapsed time — kids forget over the weekend too). But because the app is used Mon–Fri, `rollOffWeekend(ts)` snaps any day-based due-date that lands on Sat/Sun forward to **Monday 6am** — so Monday reads as a clean "due today" instead of "overdue" and `backlogDue` stays honest. It only moves the timestamp; it never changes the interval length, and the 60s relearn loop (interval 0) is never rolled. The client week strip (`renderWeek`) likewise shows Mon–Fri only.

The client never recomputes SRS state — it sends `{type, key, correct}` to `POST /api/students/:id/answer` and re-renders from the returned student snapshot.

### Undo

`undoSnaps` is an **in-memory** `Map<studentId, Snap>` keyed by student. Each `/answer` call snapshots the pre-update card + session rows; `/undo` restores them. Only one step of undo is retained, and it does not survive a server restart. If you add new mutating endpoints that should be undoable, follow the same snapshot-before-mutate pattern.

### Schema migrations

There is no migration framework. The schema lives in the `CREATE TABLE IF NOT EXISTS` block at the top of `server.ts`. Additive changes to existing tables use an idempotent `try { ALTER TABLE ... ADD COLUMN } catch {}` (see the `mode` column on `students`). Stick to this pattern for additive migrations; destructive changes to a live `alphabet.db` need to be handled manually.

### API surface

All under `/api`. Returns JSON; `204` on DELETE.

- `GET/POST /api/students`, `GET/PATCH/DELETE /api/students/:id` — create/update accept `classId` (`""` or null clears the assignment).
- `GET /api/roster` — teacher dashboard. Per student: `mode`, `total`, `dueNow` (session-capped), `backlogDue` (full overdue count), `seenToday`, `reviewed`, `correct`, `doneToday`. Mode decides which card kind is counted.
- `POST /api/students/:id/answer` — body `{ type: "letter" | "phonics" | "sight" | "cvc" | "cvce" | "book", key, correct }`. The server derives the area via `areaOf(type)` and updates that area's card + session row.
- `POST /api/students/:id/undo` — restores the last snapshotted card + session row (the snapshot is tagged with its area).
- `POST /api/students/:id/reset` — wipes this student's cards / phonics_cards / sight_word_cards / cvc_cards and all three session tables, then re-seeds.
- `POST /api/students/:id/place` — placement check. Body `{ type, keys: [] }`. Seeds each named card as 'young' (reps 2, interval 3, due a few school-days out via `rollOffWeekend`) **without touching session counters**, so a new student isn't drilled on what they already know. Unmarked cards stay new.
- `GET/POST /api/phonics`, `PATCH/DELETE /api/phonics/:id`
- `GET/POST /api/cvc`, `PATCH/DELETE /api/cvc/:id` — POST body `{ kind, onset, rime }` where `kind` ∈ `WORD_KINDS` (`cvc` / `cvce` / `book`); PATCH edits `onset`/`rime` only.
- `GET/POST /api/classes`, `PATCH/DELETE /api/classes/:id`

### Client conventions

- All state mutations go through the `api()` helper in `index.html` and end by reassigning `student` to the returned snapshot, then `renderAll()`. Don't mutate `student` locally — server is authoritative.
- `activeItems(stu)` is the single place that decides which cards are in the full active pool, derived from `stu.settings.mode` + `stu.settings.case` (still honors the per-day new-card cap, `newPerDay`). It branches across all seven modes (letters, mixed, phonics, sight, cvc, cvce, book) and attaches a `segments` array to multi-glyph items — `[onset, rime]` for the word kinds (`WORD_MODES`, via `wordsOfKind`), per-letter for sight words and multi-char sounds — which the flash animation reveals one `--gi`-indexed glyph at a time. It feeds the mastery bar and total counts.
- **Client-side area routing mirrors the server.** `areaOfMode(mode)` maps the active mode to its area; `currentSession(stu)` / `currentRecentSessions(stu)` return the right session object (`session` / `sightSession` / `cvcSession` / `cvceSession` / `bookSession` and their `recent*` arrays) so streaks, the week strip, "done today" (`doneKey`), and "keep going" (`keepGoingKey`) are all per-area. The `case-toggle` is hidden in any mode where case is meaningless (phonics / sight / cvc / cvce / book).
- `sessionQueue(stu)` layers a **daily session cap** on top: it ranks `activeItems` by `impactScore` (weakest & most overdue first; brand-new cards last) and keeps at most `sessionSize` distinct items per day, so a child with a 36-card review backlog sees only the most impactful ~10. Items already touched today stay in the session regardless of the cap; "keep going" lifts it. This is what the practice queue and the headline "to review" count are derived from — `activeItems` stays the full picture.
- `pickNext(stu)` draws the due items from `sessionQueue`, weakest & most overdue first, with a small top-K randomization and a "don't repeat last card" filter.
- "Session done" (drives both the in-app celebration via `shouldCelebrate` and the roster's `doneToday`) means: practiced today, nothing in the session due now or in the 60s relearn loop, and `pickNext` returns null. The roster also reports `backlogDue` (full overdue count) alongside the session-capped `dueNow`.
- `bucketOf(card)` (`new` / `learning` / `young` / `mature`) drives the per-letter coloring and the mastery breakdown. The sidebar's **"Mastery by area"** panel (`renderAreaMastery`) shows every non-empty area (Letters / Sounds / Sight words / CVC / CVCe / Book words) side by side — each a mini `mastery-bar` plus "mastered / total" and "started" counts — computed straight from the student snapshot (which always carries every area's cards, regardless of the active mode). This replaced the old single mode-scoped mastery bar. Below it, a **"Trouble spots"** panel (`renderTrouble`) lists the specific seen cards a student keeps missing across every area, ranked by a struggle score (`lapses + (1−accuracy)·2 + low-ease`), worst 6 first — hidden if they've practiced nothing, with a positive empty state when there's nothing to flag.
- **Every sidebar panel is collapsible.** `setupCollapsiblePanels()` runs once, injects a chevron into each `aside .panel` header and toggles a `.collapsed` class (CSS hides everything but the `.panel-head`). State lives in the module-level `panelCollapsed` Set and persists in `localStorage` under `alphabet:collapsed`, keyed by panel id (or heading text). **First run (no stored value) defaults to all-collapsed** so the sidebar starts tidy; once the user interacts, their explicit set is stored. The "Expand all / Collapse all" controls at the top of the `<aside>` call `setAllPanelsCollapsed(bool)`. Wired once because the panel wrappers/heads are static — re-renders only refill panel bodies, so collapse state survives them, independent of the per-mode `hidden` toggling in `renderPanels`.
- The **mode pill row** (`.mode-toggle`) holds all seven modes and cannot shrink past its labels, so it is `flex-wrap: wrap` with `max-width: 100%` — it reflows to 2–4 lines on a small laptop instead of spilling out of the practice footer. Keep that in mind when adding a mode or a long label.
- **Three screens, one `view` state machine.** `setView('home' | 'class' | 'practice')` (in `index.html`) is the only navigator: it toggles `<main>` (practice) against the `#home-screen` (class picker) and `#class-screen` (student picker) sections, and sets `document.body.dataset.view` (CSS uses it to scope header controls — e.g. `#student-select`/`#manage-btn` show only in practice). Boot lands on **home** (`goHome`) — it never auto-enters a class. Flow: `goHome` → `enterClass(cid)` (sets `classFilter` to `'all'`/`'unassigned'`/a class id, so the roster & report modals scope to it) → `openStudent(id)` → practice. The brand is a home link; `#back-btn` steps practice→class→home. The pickers' status badges come from a cached `/api/roster` (`rosterCache`, refreshed by `refreshCurrentPicker` after a modal closes). The class screen also shows a **"Needs the most work"** panel (`#needs-panel` / `renderNeedsList`): it pulls each student's full snapshot, reuses `summarizeStudent` (shared with the report), and ranks by a composite `score` (0.45·mastery-gap + 0.35·due-fraction + 0.20·accuracy-gap), top 5 worst first. It runs async after the grid paints and bails if the teacher navigated away mid-fetch.
- **Teacher tools are modals** layered over whatever screen is showing: `roster-modal` (`openRosterModal` → `GET /api/roster` → `renderRoster`), `classes-modal` (`renderClassList` + the `bulk-bar` for multi-select class assignment, tracked in the `selectedStudents` Set), the `phonics-modal` (sound editor), and the `cvc-modal` (`openCvcModal(kind)` → `renderCvcWordList`, an onset+rime word-builder for `cvc` / `cvce` / `book`, one tab per kind). The roster honors the persisted `classFilter` (`all` / `unassigned` / a class id).
- CSS uses OKLCH tokens defined in `:root` at the top of `index.html`. Mastery states each own a named palette (`sage`, `coral`, `teal`, `plum`, `sun`) — reuse those tokens rather than introducing new colors.
