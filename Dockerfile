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

# Copy startup script
COPY start.sh ./start.sh
RUN chmod +x start.sh

# Expose port 80
EXPOSE 80

# Volume for persistent data
VOLUME /data

# Start both servers using the startup script
CMD ["./start.sh"]
