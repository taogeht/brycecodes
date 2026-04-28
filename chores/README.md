# Mission Control — Chore Tracker

Static SPA served by the root `server.js` at `/chores`. State is persisted as a single JSON blob via `GET/POST /api/chores`.

## Files

```
chores/
├── public/
│   └── index.html     ← the entire SPA (HTML + CSS + JS)
└── README.md
```

## Persistence

State lives in Postgres as a single JSONB row in `chores.state` (one shared "singleton" row — the app is single-tenant household state, no per-user split). The root server bootstraps the schema/table on startup and reuses `DATABASE_URL` from the fitness/12x12 setup.

`GET /api/chores` returns the JSON blob (or `null` when the row doesn't exist yet — the frontend falls back to `defaultState()`). `POST /api/chores` is an `INSERT ... ON CONFLICT DO UPDATE`, atomic at the database layer.

## Local dev

```bash
cd ..
npm install
npm start          # serves /chores on port 80
```

Then open <http://localhost/chores/>.
