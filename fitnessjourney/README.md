# Fitness Journey Tracker

Personal fitness tracking app — meals, workouts, supplements, body metrics, and goals.

## Stack

- **Backend**: Node.js + Express, Prisma ORM, PostgreSQL
- **Frontend**: React + Vite, Tailwind CSS, Recharts
- **Auth**: JWT (access + refresh tokens)
- **Infrastructure**: Docker Compose, Nginx reverse proxy

## Quick Start

### With Docker
```bash
docker compose up --build
```
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- PostgreSQL: localhost:5432

### Local Development

**Backend:**
```bash
cd backend
cp .env.example .env  # Edit with your DB credentials
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Default Login
- Email: `bryce@tracker.local`
- Password: `changeme123`

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | — |
| `JWT_SECRET` | Secret for signing tokens | — |
| `PORT` | Backend port | `3001` |
| `UPLOAD_DIR` | File upload directory | `./uploads` |
