#!/bin/sh
set -e

echo "Starting fitness backend..."
cd /usr/src/app/fitnessjourney/backend

# Run prisma db push with retry (database may not be ready immediately)
echo "Running Prisma db push..."
for i in 1 2 3; do
    if npx prisma db push --schema=src/prisma/schema.prisma --skip-generate; then
        echo "✅ Prisma db push succeeded"
        break
    else
        echo "⚠️ Prisma db push attempt $i failed, retrying in 3s..."
        sleep 3
    fi
done

# Run seed (don't block startup if it fails)
echo "Running seed..."
node src/utils/seed.js || echo "Warning: Seed failed, continuing..."

# Start fitness backend in background, force port 3001
echo "Starting fitness server on port 3001..."
PORT=3001 node src/server.js &

# Start main brycecodes server on port 80
echo "Starting main server on port 80..."
cd /usr/src/app
PORT=80 node server.js
