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

The root server reads/writes `chores_data.json` at the repo root (override with `CHORES_DATA_PATH` env var, e.g. `/data/chores_data.json` in the Docker setup). Writes are atomic (tmp file + rename) and serialized through a queue to prevent concurrent corruption.

When the file is missing, `GET /api/chores` returns `null` and the frontend falls back to `defaultState()`.

## Local dev

```bash
cd ..
npm install
npm start          # serves /chores on port 80
```

Then open <http://localhost/chores/>.
