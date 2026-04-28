# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo shape

A monorepo of several independent web projects glued together by a single Express server (`server.js`) that listens on port 80, proxies one subproject's API, and serves the rest as static sites.

Subprojects:
- `mainpage/`, `invoice/`, `englishangel/`, `timesheet/`, `darren/` — vanilla HTML/CSS/JS static sites mounted at `/<name>`.
- `chores/` — single-file SPA (`chores/public/index.html`) mounted at `/chores`. State persisted via `GET/POST /api/chores` (atomic tmp+rename write, serialized queue) to `chores_data.json` (override with `CHORES_DATA_PATH`).
- `fitnessjourney/` — full-stack app (React+Vite frontend, Node/Express+Prisma+PostgreSQL backend on port 3001). Mounted under `/fitnessjourney` in production.
- `12x12/` — full-stack flashcards app (React CRA + TypeScript frontend, Express+TypeScript+PostgreSQL backend on port 3002). Mounted under `/12x12` in production. CRA `homepage` is set to `/12x12` so built assets resolve correctly.

`create_template.py` is a one-off script (run from the project's `venv/`) that uses `python-docx` to regenerate `timesheet/template.docx` from `timesheet/SignatureSheet.docx` for docxtemplater.

## Common commands

Root server (serves static sites + proxies fitness API):
```bash
npm install
npm start                    # node server.js, defaults to PORT=80
```

Fitness backend (`fitnessjourney/backend/`):
```bash
npm install
npm run dev                  # node --watch src/server.js, PORT=3001
npm start
npm run seed                 # seeds admin user brycev@gmail.com / changeme123
npx prisma db push --schema=src/prisma/schema.prisma   # apply schema (no migrations dir)
npx prisma generate --schema=src/prisma/schema.prisma
```

Fitness frontend (`fitnessjourney/frontend/`):
```bash
npm install
npm run dev                  # Vite on :3000, proxies /api and /uploads to :3001
npm run build                # outputs to dist/, served by root server in prod
npm run lint                 # eslint .
```

12x12 (`12x12/`):
```bash
npm run install-all          # installs root + client + server deps
npm run dev                  # concurrently runs server (3002) + CRA dev (3000)
npm run setup-db             # psql $DATABASE_URL -f server/migrations/001_initial.sql
node scripts/build-client.js # CRA build with --max_old_space_size=512
npm --prefix server run build # tsc → server/dist/
```

Full Docker stack (Postgres + backend + frontend) for fitness only:
```bash
cd fitnessjourney && docker compose up --build
```

Production image (builds everything — root server, all static sites, fitness frontend, fitness backend) is the root `Dockerfile`. Container entry is `start.sh`, which runs `prisma db push` with retry, then `migrate.js` (raw-SQL fallback for the `api_key` column), then seed, then starts the fitness backend on 3001 in the background and the root server on 80 in the foreground.

## Architecture notes that aren't obvious from the code

**Proxy ordering in `server.js` is load-bearing.** The `/fitnessjourney/api`, `/fitnessjourney/uploads`, and `/12x12/api` proxies are all registered *before* `bodyParser.json()`. If you add middleware, do not insert body-parsing or anything that consumes the request stream above those proxies — the backend would receive empty POST bodies. There is an explicit comment near the first fitness proxy warning about this.

**12x12 path-rewrite differs from fitness.** Fitness rewrites `^/fitnessjourney/api` → `''` (drops `/api`), so the fitness backend uses `/auth`, `/meals`, etc. 12x12 rewrites `^/12x12` → `''` (keeps `/api`), so the 12x12 backend keeps its `/api/login`, `/api/cards`, etc. Don't normalize one to the other — the backends were written with their own conventions.

**12x12 backend port is 3002, not 3001.** Both 12x12 and fitness use Postgres. By default they share `DATABASE_URL` (12x12 lives in its own `srs.*` schema, so they don't collide). `start.sh` honors `TWELVE_DATABASE_URL` as an override if you want them split.

**12x12 migration is `psql -f`, not Prisma.** `start.sh` runs the SQL file directly via `psql` (postgresql-client is installed in the Dockerfile specifically for this). The migration uses `CREATE TABLE IF NOT EXISTS` so re-running is safe. There is no auto-seeded user — per `12x12/README.md`, you create the first teacher with a manual SQL `INSERT` after migration runs.

**The fitness app has two front doors.** In production it sits behind the root Express server (`/fitnessjourney/api/*` → proxied to `localhost:3001`, frontend served from `fitnessjourney/frontend/dist/`). In local dev you typically run the Vite dev server on :3000, which has its own proxy to :3001 — bypassing the root server entirely. The React app uses `basename="/fitnessjourney"` (`main.jsx`) and the Vite `base: '/fitnessjourney/'` so the same build works in both modes.

**Auth accepts two credentials.** `fitnessjourney/backend/src/middleware/auth.js` checks `x-api-key` header first, then falls back to JWT `Authorization: Bearer`. Each user has both an `apiKey` (random 32-byte hex, generated on seed/upsert) and JWT access/refresh tokens (24h / 7d). `JWT_SECRET` defaults to the literal `'yoursecret'` if unset — fine locally, must be set in prod.

**Strava webhooks bypass auth.** `routes/strava.js` mounts `GET/POST /strava/webhook` as public endpoints because Strava itself calls them. The POST handler **must** respond 200 within ~2 seconds, then do the actual work async — preserve that pattern when editing.

**Schema migrations are not the standard Prisma flow.** There's no `prisma/migrations/` directory; `start.sh` uses `prisma db push` (which syncs the schema without migration history) plus a hand-written raw-SQL fallback in `utils/migrate.js` that adds the `api_key` column if push didn't. When changing `schema.prisma`, plan for `db push`, not `migrate dev`.

**Persistence for the static-site APIs is flat JSON files.** `/api/angels` (English Angel), `/api/timesheet`, and `/api/chores` in the root `server.js` read/write `data.json`, `timesheet_data.json`, and `chores_data.json` respectively. Paths are overridable via `DATA_PATH` / `TIMESHEET_DATA_PATH` / `CHORES_DATA_PATH` env vars and the docker setup mounts a volume at `/data`. `/api/angels` and `/api/timesheet` use a simple synchronous `writeFileSync`; `/api/chores` is the only one that does an atomic tmp+rename and serializes writes through a queue. If you copy any of these as a template for a new endpoint, prefer the chores pattern.
