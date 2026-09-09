# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo shape

A monorepo of several independent web projects glued together by a single Express server (`server.js`) that listens on port 80, proxies one subproject's API, and serves the rest as static sites.

Subprojects:
- `mainpage/`, `englishangel/`, `timesheet/`, `darren/` — vanilla HTML/CSS/JS static sites mounted at `/<name>`.
- `invoice/` — static site mounted at `/invoice`. **Currently reads/writes Supabase directly from the browser** (`invoice/config.js` holds the project URL + anon key; `supabase-js` loaded from CDN in `index.html`). A move to Postgres landed in `1e7fde7` but was rolled back on the frontend, because the one-shot import (`scripts/migrate-invoice-from-supabase.js`) never ran while Supabase was paused, so the Postgres tables are empty. The `/api/invoice/*` endpoints in `server.js` are still live but unused — finish the import before re-pointing the frontend at them.
- `chores/` — single-file SPA (`chores/public/index.html`) mounted at `/chores`. State persisted via `GET/POST /api/chores` to a single JSONB row in `chores.state` (Postgres). Schema is bootstrapped on root-server startup; reuses `DATABASE_URL`.
- `12x12/` — full-stack flashcards app (React CRA + TypeScript frontend, Express+TypeScript+PostgreSQL backend on port 3002). Mounted under `/12x12` in production. CRA `homepage` is set to `/12x12` so built assets resolve correctly.
- `alphabet-help/` — Alphabet Time / Phonics / Sight Word SRS app (Bun + SQLite backend on port 4321, single-file SPA). Mounted under `/alphabet-help` in production. Data stored in SQLite (`alphabet.db`, `/data/alphabet.db` in Docker).
- `fitnessjourney/` — **disabled.** Source code preserved in this directory but not built or run. To revive: re-add the fitness blocks to `Dockerfile`, `start.sh`, and `server.js` (see git history before this point).

`create_template.py` is a one-off script (run from the project's `venv/`) that uses `python-docx` to regenerate `timesheet/template.docx` from `timesheet/SignatureSheet.docx` for docxtemplater.

## Common commands

Root server (serves static sites + proxies fitness API):
```bash
npm install
npm start                    # node server.js, defaults to PORT=80
```

Fitness backend / frontend — **disabled.** Source still present under `fitnessjourney/` but the production server doesn't build, run, or proxy it. See `CLAUDE.md` overview section for revival notes.

12x12 (`12x12/`):
```bash
npm run install-all          # installs root + client + server deps
npm run dev                  # concurrently runs server (3002) + CRA dev (3000)
npm run setup-db             # psql $DATABASE_URL -f server/migrations/001_initial.sql
node scripts/build-client.js # CRA build with --max_old_space_size=512
npm --prefix server run build # tsc → server/dist/
```

Alphabet Time (`alphabet-help/`):
```bash
npm run alphabet:start       # bun alphabet-help/server.ts (port 4321)
npm run alphabet:test        # cd alphabet-help && bun test
```

Full Docker stack (Postgres + backend + frontend) for fitness only:
```bash
cd fitnessjourney && docker compose up --build
```

Production image (builds everything — root server, all static sites, fitness frontend, fitness backend) is the root `Dockerfile`. Container entry is `start.sh`, which runs `prisma db push` with retry, then `migrate.js` (raw-SQL fallback for the `api_key` column), then seed, then starts the fitness backend on 3001 in the background and the root server on 80 in the foreground.

## Architecture notes that aren't obvious from the code

**Proxy ordering in `server.js` is load-bearing.** The `/12x12/api` and `/alphabet-help` proxies are registered *before* `bodyParser.json()`. If you add middleware, do not insert body-parsing or anything that consumes the request stream above the proxies — backends would receive empty POST bodies.

**Alphabet Time proxy and persistence.** `server.js` proxies `/alphabet-help` to port 4321 (Bun server) with path rewrite removing `/alphabet-help`. Database path defaults to `alphabet-help/alphabet.db` locally and `/data/alphabet.db` in production (via `DB_PATH`). `start.sh` seeds `/data/alphabet.db` from the repo's `alphabet-help/alphabet.db` if the volume doesn't already have one. Front-end API calls in `index.html` dynamically use `API_BASE = '/alphabet-help'` when hosted under `/alphabet-help` or `''` when standalone.

**12x12 path-rewrite keeps `/api`.** The proxy rewrites `^/12x12` → `''`, so `/12x12/api/login` arrives at the backend as `/api/login`. The 12x12 backend's auth middleware specifically gates on `req.path.startsWith('/api')`, so don't change this without updating that check.

**12x12 backend port is 3002.** It connects to Postgres via `DATABASE_URL` (or `TWELVE_DATABASE_URL` as override) and lives in the `srs.*` schema. The `chores.*` schema (singleton row JSONB blob) shares the same `DATABASE_URL`, queried from the root server.

**12x12 migration is `psql -f`, not Prisma.** `start.sh` runs the SQL file directly via `psql` (postgresql-client is installed in the Dockerfile specifically for this). The migration uses `CREATE TABLE IF NOT EXISTS` so re-running is safe. There is no auto-seeded user — per `12x12/README.md`, you create the first teacher with a manual SQL `INSERT` after migration runs.

**The fitness app has two front doors.** In production it sits behind the root Express server (`/fitnessjourney/api/*` → proxied to `localhost:3001`, frontend served from `fitnessjourney/frontend/dist/`). In local dev you typically run the Vite dev server on :3000, which has its own proxy to :3001 — bypassing the root server entirely. The React app uses `basename="/fitnessjourney"` (`main.jsx`) and the Vite `base: '/fitnessjourney/'` so the same build works in both modes.

**Auth accepts two credentials.** `fitnessjourney/backend/src/middleware/auth.js` checks `x-api-key` header first, then falls back to JWT `Authorization: Bearer`. Each user has both an `apiKey` (random 32-byte hex, generated on seed/upsert) and JWT access/refresh tokens (24h / 7d). `JWT_SECRET` defaults to the literal `'yoursecret'` if unset — fine locally, must be set in prod.

**Strava webhooks bypass auth.** `routes/strava.js` mounts `GET/POST /strava/webhook` as public endpoints because Strava itself calls them. The POST handler **must** respond 200 within ~2 seconds, then do the actual work async — preserve that pattern when editing.

**Schema migrations are not the standard Prisma flow.** There's no `prisma/migrations/` directory; `start.sh` uses `prisma db push` (which syncs the schema without migration history) plus a hand-written raw-SQL fallback in `utils/migrate.js` that adds the `api_key` column if push didn't. When changing `schema.prisma`, plan for `db push`, not `migrate dev`.

**Persistence for the static-site APIs is mixed.** `/api/angels` (English Angel) and `/api/timesheet` read/write flat JSON files (`data.json`, `timesheet_data.json`) — paths overridable via `DATA_PATH` / `TIMESHEET_DATA_PATH`, docker volume at `/data`. `/api/chores` and `/api/invoice/*` live in Postgres and reuse `DATABASE_URL`: chores is a single JSONB row in `chores.state` (UPSERT on save); invoice has two relational tables (`invoice.bookings`, `invoice.students`) and exposes per-resource CRUD plus a `/api/invoice/bookings/bulk` endpoint for atomic recurring-series edits/deletes. Both schemas are bootstrapped at server startup via one combined `CREATE SCHEMA / TABLE IF NOT EXISTS …` block. Chores moved to Postgres because the JSON path defaulted inside the container and didn't survive redeploys. **The invoice endpoints are dormant** — the frontend still talks to Supabase (see the repo-shape section); the tables exist but hold no data until the import runs.

**Invoice student renames cascade in the server** (dormant — applies once the frontend moves back onto `/api/invoice/*`)**.** `PATCH /api/invoice/students/:id` reads the existing row, then in one transaction updates `invoice.students` and runs `UPDATE invoice.bookings SET student_name = $new WHERE student_name = $old` — the relationship is by name (denormalized, no FK). `DELETE /api/invoice/students/:id` similarly cascades booking deletion. Don't move this logic into the client without also adding a real FK.
