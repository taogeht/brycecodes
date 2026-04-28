#!/bin/sh
set -e

# ── 12x12 flashcards ──
# Uses TWELVE_DATABASE_URL if set, otherwise falls back to DATABASE_URL.
# 12x12 lives in its own `srs.*` schema, so it's safe to share with other apps.
TWELVE_DB_URL="${TWELVE_DATABASE_URL:-$DATABASE_URL}"

echo "Running 12x12 migration..."
psql "$TWELVE_DB_URL" -f /usr/src/app/12x12/server/migrations/001_initial.sql \
    || echo "Warning: 12x12 migration failed, continuing..."

echo "Starting 12x12 server on port 3002..."
cd /usr/src/app/12x12/server
DATABASE_URL="$TWELVE_DB_URL" PORT=3002 node dist/server.js &

# Start main brycecodes server on port 80
echo "Starting main server on port 80..."
cd /usr/src/app
PORT=80 node server.js
