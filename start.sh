#!/bin/sh
set -e

echo "Starting fitness backend..."
cd /usr/src/app/fitnessjourney/backend

# Run prisma migrations (don't block startup if it fails)
echo "Running Prisma db push..."
npx prisma db push --schema=src/prisma/schema.prisma --skip-generate || echo "Warning: Prisma db push failed, continuing..."

# Run seed (don't block startup if it fails)
echo "Running seed..."
node src/utils/seed.js || echo "Warning: Seed failed, continuing..."

# Start fitness backend in background
echo "Starting fitness server on port 3001..."
node src/server.js &

# Start main brycecodes server
echo "Starting main server on port 80..."
cd /usr/src/app
node server.js
