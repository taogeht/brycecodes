FROM node:20-alpine

WORKDIR /usr/src/app

# ── Main brycecodes server ──
COPY package.json ./
RUN npm install

COPY server.js ./

# Static pages
COPY invoice/ ./invoice/
COPY mainpage/ ./mainpage/
COPY englishangel/ ./englishangel/
COPY timesheet/ ./timesheet/

# ── Fitness Journey backend ──
COPY fitnessjourney/backend/package*.json ./fitnessjourney/backend/
RUN cd fitnessjourney/backend && npm ci --only=production

COPY fitnessjourney/backend/ ./fitnessjourney/backend/
RUN cd fitnessjourney/backend && npx prisma generate --schema=src/prisma/schema.prisma

# ── Fitness Journey frontend (pre-built dist) ──
COPY fitnessjourney/frontend/dist/ ./fitnessjourney/frontend/dist/

# Create upload directories for fitness journey
RUN mkdir -p /app/uploads/meals /app/uploads/photos

# Expose port 80
EXPOSE 80

# Volume for persistent data
VOLUME /data

# Start both servers: fitness backend on 3001, main server on 80
CMD ["sh", "-c", "cd fitnessjourney/backend && npx prisma db push --schema=src/prisma/schema.prisma --skip-generate && node src/utils/seed.js && node src/server.js & cd /usr/src/app && npm start"]
