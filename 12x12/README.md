# Flashcards!

Flashcards! is a full-stack multiplication practice application with a React TypeScript frontend and a Node.js Express backend, featuring spaced repetition learning with the SM-2 algorithm.

## Project Structure

```
├── client/                 # React TypeScript frontend
│   ├── src/
│   │   ├── api/           # API service functions with TypeScript types
│   │   ├── App.tsx        # Flashcard review interface
│   │   └── ...
│   └── package.json
├── server/                # Node.js TypeScript backend
│   ├── src/
│   │   └── server.ts      # Express API with SM-2 algorithm
│   ├── migrations/         # Database schema and seed data for multiplication cards
│   │   └── 001_initial.sql
│   ├── .env              # Environment variables
│   ├── tsconfig.json     # TypeScript configuration
│   └── package.json
├── package.json           # Root package.json for running both apps
└── README.md
```

## Features

- **Frontend**: React 19 with TypeScript, Axios for API calls, Interactive flashcard interface
- **Backend**: Node.js with Express, TypeScript, PostgreSQL, Zod validation
- **Spaced Repetition**: SM-2 algorithm implementation for optimal learning intervals
- **Practice Modes**: Students choose between focused 9×9 practice or the full times table before each session
- **Database**: PostgreSQL with proper schema for users, cards, and progress tracking
- **Development**: Hot reload for both frontend and backend, TypeScript support
- **API Integration**: RESTful endpoints for cards and review submissions

## Prerequisites

- Node.js (v16 or higher)
- npm (comes with Node.js)
- PostgreSQL (for database functionality)

## Quick Start

### 1. Setup Database

First, create a PostgreSQL database and update the `.env` file:

```bash
# Create database
createdb flashcards

# Update server/.env with your database connection
DATABASE_URL=postgresql://username:password@localhost:5432/flashcards
```

Run database migrations:

```bash
npm run setup-db
```

The migration loads the full 12 × 12 multiplication deck but intentionally leaves the user tables empty. Create your first teacher account before logging in:

```bash
psql "$DATABASE_URL" -c "INSERT INTO srs.users (username, display_name, user_type, picture_password) VALUES ('teacher', 'Ms. Example', 'teacher', '1') ON CONFLICT (username) DO NOTHING;"
```

Choose a `picture_password` value from `1` through `5` to match the emoji tiles on the login screen. After signing in as a teacher you can add students from the dashboard.

### 2. Install and Run Applications

```bash
# Navigate to project directory
   cd path/to/Flashcards

# Install all dependencies (root, client, and server)
npm run install-all

# Start both frontend and backend concurrently
npm start
```

The app will be available at:
- Frontend: http://localhost:3000
- Backend: http://localhost:3001

### Option 2: Run Apps Separately

If you prefer to run the frontend and backend in separate terminals:

**Terminal 1 - Backend:**
```bash
cd server
npm install
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd client
npm install
npm start
```

## Available Scripts

### Root Level Scripts
- `npm run install-all` - Install dependencies for root, client, and server
- `npm start` - Run both frontend and backend concurrently
- `npm run server` - Run only the backend in development mode
- `npm run client` - Run only the frontend
- `npm run build` - Build both frontend and backend for production
- `npm run test` - Run tests for both frontend and backend
- `npm run setup-db` - Run database migrations

### Backend Scripts (in /server)
- `npm start` - Start server in production mode
- `npm run dev` - Start server in development mode with TypeScript and nodemon
- `npm run build` - Compile TypeScript to JavaScript
- `npm run migrate` - Run database migrations

### Frontend Scripts (in /client)
- `npm start` - Start React development server
- `npm run build` - Build React app for production
- `npm test` - Run React tests
- `npm run eject` - Eject from Create React App (one-way operation)

## API Endpoints

- `GET /api/cards` - Get all flashcards for the authenticated user
- `POST /api/review/:cardId` - Submit a card review with spaced repetition algorithm

## Spaced Repetition Algorithm

This application implements the SM-2 (SuperMemo 2) algorithm for optimal learning:

- **Again (0)**: Reset card to beginning, interval = 1 day
- **Hard (1)**: Slightly increase interval, reduce ease factor
- **Good (2)**: Normal progress, increase interval based on ease factor
- **Easy (3)**: Significantly increase interval, boost ease factor

## Practice Interface

- Click cards to flip between question and answer
- Use the four difficulty buttons to rate your recall after answering each multiplication problem
- View progress statistics (interval, ease factor, repetitions)
- Cards automatically advance after review

## Development Notes

- The React app is configured with a proxy to the Node.js server for development
- Backend runs on port 3001 (configurable via `.env` file)
- Frontend runs on port 3000 (standard Create React App port)
- Both apps support hot reloading during development
- TypeScript is enabled for both frontend and backend

## Environment Variables

### Backend (.env)
```
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://username:password@localhost:5432/flashcards
# Optional: override detected privileges for srs.student_progress.
# Accepts values like none, read, write, all, or a comma list (e.g., select,update).
STUDENT_PROGRESS_PRIVILEGES=none
```

Use `STUDENT_PROGRESS_PRIVILEGES` when your database role reports broader access than you want the app to exercise. The value can be `none`, `read`, `write`, `all`, or a comma-separated list of `select`, `insert`, and `update`.

### Frontend
Create React App supports environment variables prefixed with `REACT_APP_`:
```
REACT_APP_API_URL=http://localhost:3001
```

## Database Schema

- **users**: User accounts and authentication
- **cards**: Flashcard content (front/back)
- **user_cards**: Individual progress tracking for each user-card pair

## Testing the Setup

1. Set up PostgreSQL database and run migrations
2. Start both apps using `npm start`
3. Open http://localhost:3000 in your browser
4. You should see the practice interface with cards due for review
5. Test the spaced repetition by reviewing cards

## Next Steps

This is a fully functional spaced repetition application. You can extend it by:

1. Adding user authentication and registration
2. Implementing card creation and editing interfaces
3. Adding card categories and tags
4. Implementing statistics and progress tracking
5. Adding import/export functionality
6. Setting up production deployment

## Troubleshooting

- **Database connection**: Ensure PostgreSQL is running and DATABASE_URL is correct
- **Port conflicts**: If ports 3000 or 3001 are in use, the apps will prompt you to use different ports
- **TypeScript errors**: Make sure all dependencies are installed properly
- **CORS issues**: The backend is configured to allow CORS from all origins in development

## Technologies Used

- **Frontend**: React 19, TypeScript, Axios, Create React App
- **Backend**: Node.js, Express, TypeScript, PostgreSQL, Zod validation
- **Spaced Repetition**: SM-2 algorithm implementation
- **Development**: npm, concurrently, nodemon, ts-node
