FROM node:20-alpine

# postgresql-client provides `psql` for the 12x12 migration runner
RUN apk add --no-cache postgresql-client

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
COPY chores/public/ ./chores/public/

# ── Fitness Journey frontend (build during Docker build) ──
COPY fitnessjourney/frontend/package*.json ./fitnessjourney/frontend/
RUN cd fitnessjourney/frontend && npm ci
COPY fitnessjourney/frontend/ ./fitnessjourney/frontend/
RUN cd fitnessjourney/frontend && npm run build

# ── Fitness Journey backend ──
COPY fitnessjourney/backend/package*.json ./fitnessjourney/backend/
RUN cd fitnessjourney/backend && npm ci --only=production

COPY fitnessjourney/backend/ ./fitnessjourney/backend/
RUN cd fitnessjourney/backend && npx prisma generate --schema=src/prisma/schema.prisma

# Create upload directories for fitness journey
RUN mkdir -p /app/uploads/meals /app/uploads/photos

# ── 12x12 frontend (build during Docker build) ──
COPY 12x12/package*.json ./12x12/
COPY 12x12/scripts/ ./12x12/scripts/
COPY 12x12/client/package*.json ./12x12/client/
RUN cd 12x12/client && npm ci
COPY 12x12/client/ ./12x12/client/
# build-client.js wraps `npm --prefix client run build` with --max_old_space_size=512
RUN cd 12x12 && node scripts/build-client.js

# ── 12x12 backend ──
COPY 12x12/server/package*.json ./12x12/server/
RUN cd 12x12/server && npm ci
COPY 12x12/server/ ./12x12/server/
RUN cd 12x12/server && npm run build

# Copy startup script
COPY start.sh ./start.sh
RUN chmod +x start.sh

# Expose port 80
EXPOSE 80

# Volume for persistent data
VOLUME /data

# Start both servers using the startup script
CMD ["./start.sh"]
