#!/bin/sh
set -e

echo "Starting fitness backend..."
cd /usr/src/app/fitnessjourney/backend

# Run prisma db push with retry (database may not be ready immediately)
echo "Running Prisma db push..."
for i in 1 2 3; do
    if npx prisma db push --schema=src/prisma/schema.prisma --skip-generate 2>&1; then
        echo "✅ Prisma db push succeeded"
        break
    else
        echo "⚠️ Prisma db push attempt $i failed, retrying in 3s..."
        sleep 3
    fi
done

# Run raw SQL migration fallback (adds api_key column if db push didn't)
echo "Running migration fallback..."
node src/utils/migrate.js || echo "Warning: Migration fallback failed, continuing..."

# Run seed (don't block startup if it fails)
echo "Running seed..."
node src/utils/seed.js || echo "Warning: Seed failed, continuing..."

# Start fitness backend in background, force port 3001
echo "Starting fitness server on port 3001..."
PORT=3001 node src/server.js &

# ── 12x12 flashcards ──
# Uses TWELVE_DATABASE_URL if set, otherwise shares fitness DATABASE_URL
# (12x12 lives in its own `srs.*` schema, so co-tenancy is safe).
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
