FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM node:20-alpine
WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --only=production

COPY backend/ .

# Generate Prisma client
RUN npx prisma generate --schema=src/prisma/schema.prisma

# Copy frontend build into backend's public folder
COPY --from=frontend-build /app/frontend/dist ./public

# Create upload directories
RUN mkdir -p /app/uploads/meals /app/uploads/photos

EXPOSE 3001

CMD ["sh", "-c", "npx prisma db push --schema=src/prisma/schema.prisma --skip-generate && node src/utils/seed.js && node src/server.js"]
