import express, { Request, Response, RequestHandler, NextFunction } from 'express';
import { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

const app = express();
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool
  .query<{ current_user: string; session_user: string }>(`SELECT current_user, session_user`)
  .then(result => {
    if (result.rows.length > 0) {
      const row = result.rows[0];
      console.log(`Database connected as ${row.current_user} (session_user: ${row.session_user})`);
    }
  })
  .catch(err => {
    console.warn('Unable to determine database role:', (err as Error).message);
  });

let cardStateSupportsUpdatedAt: boolean | null = null;
let deckSupportsCreatedBy: boolean | null = null;

interface ReviewsColumnState {
  hasGrade: boolean;
  hasRating: boolean;
  ratingDataType?: string;
  ratingUdtName?: string;
}

let reviewsColumnState: ReviewsColumnState | null = null;
let reviewsLoggingNoticeShown = false;
let studentProgressPermissionWarned = false;
interface StudentProgressPrivileges {
  select: boolean;
  insert: boolean;
  update: boolean;
}

function parseStudentProgressPrivilegesOverride(
  rawValue?: string | null
): StudentProgressPrivileges | null {
  if (!rawValue) return null;
  const value = rawValue.trim().toLowerCase();
  if (!value) return null;

  const all = { select: true, insert: true, update: true };
  const none = { select: false, insert: false, update: false };
  const readOnly = { select: true, insert: false, update: false };
  const writeOnly = { select: false, insert: true, update: true };

  if (['none', 'false', 'off', 'disabled'].includes(value)) return none;
  if (['all', 'true', 'on', 'full', 'readwrite', 'rw'].includes(value)) return all;
  if (['read', 'select', 'ro', 'r'].includes(value)) return readOnly;
  if (['write', 'wo', 'w'].includes(value)) return writeOnly;

  const tokens = value.split(/[, ]+/).map(token => token.trim()).filter(Boolean);
  if (tokens.length === 0) return null;

  const override: StudentProgressPrivileges = { ...none };
  let recognized = false;

  for (const token of tokens) {
    switch (token) {
      case 'select':
      case 'read':
      case 'r':
        override.select = true;
        recognized = true;
        break;
      case 'insert':
      case 'i':
        override.insert = true;
        recognized = true;
        break;
      case 'update':
      case 'u':
        override.update = true;
        recognized = true;
        break;
      case 'write':
      case 'w':
        override.insert = true;
        override.update = true;
        recognized = true;
        break;
      case 'none':
      case 'false':
      case 'off':
      case 'disabled':
        override.select = false;
        override.insert = false;
        override.update = false;
        recognized = true;
        break;
      case 'all':
      case 'true':
      case 'on':
      case 'full':
      case 'readwrite':
      case 'rw':
        override.select = true;
        override.insert = true;
        override.update = true;
        recognized = true;
        break;
      default:
        console.warn(
          `Unrecognized token "${token}" in STUDENT_PROGRESS_PRIVILEGES override; ignoring token.`
        );
    }
  }

  return recognized ? override : null;
}

const studentProgressOverride = parseStudentProgressPrivilegesOverride(
  process.env.STUDENT_PROGRESS_PRIVILEGES ?? null
);

let studentProgressPrivileges: StudentProgressPrivileges | null = null;

function warnStudentProgress(message: string) {
  if (!studentProgressPermissionWarned) {
    console.warn(message);
    studentProgressPermissionWarned = true;
  }
}

function formatReviewDay(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();

    const coerced = new Date(`${value}Z`);
    if (!Number.isNaN(coerced.getTime())) return coerced.toISOString();
  }

  console.warn(
    'Unexpected review_day value returned from database; defaulting to current time.',
    value
  );
  return new Date().toISOString();
}

async function archiveStudent(studentId: string): Promise<{ message: string } | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `
      UPDATE srs.users
         SET user_type = 'archived_student',
             username = LEFT(
               CONCAT(username, ':archived:', TO_CHAR(NOW(), 'YYYYMMDDHH24MISS')),
               255
             ),
             display_name = LEFT(
               CONCAT(display_name, ' (Archived)'),
               255
             ),
             email = NULL,
             updated_at = NOW()
       WHERE id = $1
         AND user_type = 'student'
       RETURNING id
      `,
      [studentId]
    );
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query('COMMIT');
    return {
      message:
        'Student archived instead of deleted due to limited database permissions. They will no longer appear in the roster.'
    };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to archive student during delete fallback', err);
    return null;
  } finally {
    client.release();
  }
}

async function ensureStudentProgressPrivileges(queryable?: Queryable): Promise<StudentProgressPrivileges> {
  if (studentProgressPrivileges) return studentProgressPrivileges;
  const runner = queryable ?? pool;
  if (studentProgressOverride) {
    studentProgressPrivileges = studentProgressOverride;
    console.log(
      `student_progress privileges overridden via STUDENT_PROGRESS_PRIVILEGES -> select=${studentProgressPrivileges.select}, insert=${studentProgressPrivileges.insert}, update=${studentProgressPrivileges.update}`
    );
    return studentProgressPrivileges;
  }
  try {
    const { rows } = await runner.query<{
      can_select: boolean;
      can_insert: boolean;
      can_update: boolean;
    }>(
      `SELECT 
         has_table_privilege('srs.student_progress', 'SELECT') AS can_select,
         has_table_privilege('srs.student_progress', 'INSERT') AS can_insert,
         has_table_privilege('srs.student_progress', 'UPDATE') AS can_update`
    );
    const row = rows[0] ?? { can_select: false, can_insert: false, can_update: false };
    studentProgressPrivileges = {
      select: !!row.can_select,
      insert: !!row.can_insert,
      update: !!row.can_update
    };
  } catch (err) {
    warnStudentProgress(
      `Unable to inspect student_progress privileges: ${(err as Error).message}`
    );
    studentProgressPrivileges = { select: false, insert: false, update: false };
  }
  return studentProgressPrivileges;
}

ensureStudentProgressPrivileges()
  .then(priv => {
    console.log(
      `student_progress privileges -> select=${priv.select}, insert=${priv.insert}, update=${priv.update}`
    );
  })
  .catch(err => {
    console.warn(
      'Unable to determine initial student_progress privileges:',
      (err as Error).message
    );
  });

type Queryable = Pool | PoolClient;

interface DeckCardInput {
  front: string;
  back: string;
}

let cachedDefaultDeckId: string | null = null;
let defaultDeckLookupInFlight: Promise<string | null> | null = null;

async function getDefaultDeckId(queryable?: Queryable): Promise<string | null> {
  if (cachedDefaultDeckId) return cachedDefaultDeckId;
  if (defaultDeckLookupInFlight) return defaultDeckLookupInFlight;

  const runner = queryable ?? pool;
  defaultDeckLookupInFlight = (async () => {
    try {
      const preferred = await runner.query<{ id: string }>(
        `SELECT id FROM srs.decks WHERE name = $1 ORDER BY created_at LIMIT 1`,
        ['Multiplication 12×12']
      );
      if (preferred.rowCount && preferred.rows[0]?.id) {
        cachedDefaultDeckId = preferred.rows[0].id;
        return cachedDefaultDeckId;
      }

      const fallback = await runner.query<{ id: string }>(
        `SELECT id FROM srs.decks ORDER BY created_at LIMIT 1`
      );
      cachedDefaultDeckId = fallback.rows[0]?.id ?? null;
      return cachedDefaultDeckId;
    } catch (err) {
      console.warn('Failed to resolve default deck id:', (err as Error).message);
      return null;
    } finally {
      defaultDeckLookupInFlight = null;
    }
  })();

  return defaultDeckLookupInFlight;
}

async function isTeacherUser(userId: string | undefined, queryable?: Queryable): Promise<boolean> {
  if (!userId) return false;
  try {
    const result = await (queryable ?? pool).query<{ user_type: string }>(
      `SELECT user_type FROM srs.users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    return result.rows[0]?.user_type === 'teacher';
  } catch (err) {
    console.warn('Unable to verify teacher access:', (err as Error).message);
    return false;
  }
}

function sanitizeDeckCards(cards: DeckCardInput[]): DeckCardInput[] {
  const deduped = new Set<string>();
  const normalized: DeckCardInput[] = [];
  for (const card of cards) {
    const front = card.front.trim();
    const back = card.back.trim();
    if (!front || !back) continue;
    const key = `${front}:::${back}`;
    if (deduped.has(key)) continue;
    deduped.add(key);
    normalized.push({ front, back });
  }
  return normalized;
}

async function seedCardStateForCards(client: PoolClient, cardIds: number[]): Promise<void> {
  if (cardIds.length === 0) return;
  await client.query(
    `
    INSERT INTO srs.card_state (user_id, card_id, due_at, interval_days, ease_factor, reps)
    SELECT u.id, c.id, NOW(), 0, 2.5, 0
      FROM srs.users u
      CROSS JOIN unnest($1::integer[]) AS c(id)
     WHERE u.user_type = 'student'
    ON CONFLICT (user_id, card_id) DO NOTHING
    `,
    [cardIds]
  );
}

async function insertDeckCards(client: PoolClient, deckId: string, cards: DeckCardInput[]): Promise<number[]> {
  const normalized = sanitizeDeckCards(cards);
  if (normalized.length === 0) return [];

  const fronts = normalized.map(card => card.front);
  const backs = normalized.map(card => card.back);

  const { rows } = await client.query<{ id: number }>(
    `
    WITH payload AS (
      SELECT front, back
        FROM unnest($2::text[], $3::text[]) AS t(front, back)
    ),
    distinct_payload AS (
      SELECT DISTINCT front, back FROM payload
    ),
    inserted AS (
      INSERT INTO srs.cards (deck_id, front, back)
      SELECT $1, front, back
        FROM distinct_payload
      ON CONFLICT (deck_id, front, back) DO NOTHING
      RETURNING id
    )
    SELECT id FROM inserted
    `,
    [deckId, fronts, backs]
  );

  const insertedIds = rows.map(row => row.id);
  if (insertedIds.length > 0) {
    try {
      await seedCardStateForCards(client, insertedIds);
    } catch (err) {
      const { code, message } = err as { code?: string; message?: string };
      if (code === '42501') {
        console.warn('Skipping card_state seed for new deck due to permissions:', message);
      } else {
        throw err;
      }
    }
  }

  return insertedIds;
}

async function columnExists(
  queryable: Queryable,
  schema: string,
  table: string,
  column: string
): Promise<boolean> {
  const result = await queryable.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
        AND column_name = $3
      LIMIT 1`,
    [schema, table, column]
  );
  return (result.rowCount ?? 0) > 0;
}

async function doesCardStateHaveUpdatedAt(client?: PoolClient): Promise<boolean> {
  if (cardStateSupportsUpdatedAt !== null) return cardStateSupportsUpdatedAt;
  try {
    cardStateSupportsUpdatedAt = await columnExists(
      client ?? pool,
      'srs',
      'card_state',
      'updated_at'
    );
  } catch (err) {
    console.warn(
      'Skipping updated_at detection for srs.card_state due to introspection error:',
      (err as Error).message
    );
    cardStateSupportsUpdatedAt = false;
  }
  return cardStateSupportsUpdatedAt;
}

async function doesDeckTableHaveCreatedBy(client?: Queryable): Promise<boolean> {
  if (deckSupportsCreatedBy !== null) return deckSupportsCreatedBy;
  try {
    deckSupportsCreatedBy = await columnExists(client ?? pool, 'srs', 'decks', 'created_by');
  } catch (err) {
    console.warn(
      'Skipping created_by detection for srs.decks due to introspection error:',
      (err as Error).message
    );
    deckSupportsCreatedBy = false;
  }
  return deckSupportsCreatedBy;
}

async function fetchReviewsColumnState(client: PoolClient): Promise<ReviewsColumnState> {
  if (reviewsColumnState) return reviewsColumnState;
  try {
    const { rows } = await client.query<{
      column_name: string;
      data_type: string;
      udt_schema: string;
      udt_name: string;
    }>(
      `SELECT column_name, data_type, udt_schema, udt_name
         FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2`,
      ['srs', 'reviews']
    );
    const state: ReviewsColumnState = { hasGrade: false, hasRating: false };
    for (const row of rows) {
      if (row.column_name === 'grade') state.hasGrade = true;
      else if (row.column_name === 'rating') {
        state.hasRating = true;
        state.ratingDataType = row.data_type;
        state.ratingUdtName =
          row.data_type.toLowerCase() === 'user-defined'
            ? `${row.udt_schema}.${row.udt_name}`
            : row.udt_name;
      }
    }
    reviewsColumnState = state;
  } catch (err) {
    console.warn(
      'Skipping reviews column detection due to introspection error:',
      (err as Error).message
    );
    reviewsColumnState = { hasGrade: false, hasRating: false };
  }
  return reviewsColumnState;
}

function coerceRatingValue(
  dataType: string | undefined,
  udtName: string | undefined,
  gradeLabel: string,
  gradeScore: number
): string | number {
  if (!dataType) return gradeScore;
  const normalized = dataType.toLowerCase();
  if (normalized.includes('int') || normalized.includes('numeric')) return gradeScore;
  if (normalized.includes('char') || normalized.includes('text')) return gradeLabel;
  if (normalized === 'user-defined') {
    const udt = udtName?.toLowerCase() ?? '';
    if (udt.includes('review_rating') || udt.includes('grade')) return gradeLabel;
    return gradeLabel;
  }
  return gradeScore;
}

function buildRatingCorrectCondition(state: ReviewsColumnState): string {
  const dataType = state.ratingDataType?.toLowerCase() ?? '';
  if (
    dataType.includes('int') ||
    dataType.includes('numeric') ||
    dataType.includes('decimal') ||
    dataType.includes('double') ||
    dataType.includes('real')
  ) {
    return 'r.rating >= 2';
  }

  if (dataType.includes('char') || dataType.includes('text')) {
    return "LOWER(r.rating::text) IN ('good', 'easy', '3', '2')";
  }

  if (dataType === 'user-defined') {
    const udt = state.ratingUdtName?.toLowerCase() ?? '';
    if (udt.includes('review_rating') || udt.includes('grade')) {
      return "LOWER(r.rating::text) IN ('good', 'easy')";
    }
  }

  return "LOWER(r.rating::text) IN ('good', 'easy', '3', '2')";
}

async function logReviewEvent(
  client: PoolClient,
  userId: string,
  cardId: number,
  gradeLabel: string,
  gradeScore: number
): Promise<void> {
  let attempts = 0;
  while (attempts < 2) {
    const state = await fetchReviewsColumnState(client);
    if (!state.hasGrade && !state.hasRating) {
      if (!reviewsLoggingNoticeShown) {
        console.info('srs.reviews missing grade/rating columns; skipping review history logging.');
        reviewsLoggingNoticeShown = true;
      }
      return;
    }

    const columns = ['user_id', 'card_id'];
    const values: Array<string | number> = [userId, cardId];

    if (state.hasGrade) {
      columns.push('grade');
      values.push(gradeLabel);
    }
    if (state.hasRating) {
      columns.push('rating');
      values.push(coerceRatingValue(state.ratingDataType, state.ratingUdtName, gradeLabel, gradeScore));
    }

    const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
    const sql = `INSERT INTO srs.reviews (${columns.join(', ')}) VALUES (${placeholders})`;

    try {
      await client.query(sql, values);
      return;
    } catch (err) {
      const { code, message } = err as { code?: string; message?: string };
      if (code === '42501' || code === '22P02') {
        console.warn('Skipping review log due to database constraints:', message);
        return;
      }
      if (code === '42703' || code === '23502') {
        reviewsColumnState = null;
        reviewsLoggingNoticeShown = false;
        attempts += 1;
        continue;
      }
      throw err;
    }
  }
  console.warn('Skipping review log after repeated schema mismatches.');
}

interface AuthedRequest extends Request {
  userId: string;
  user?: any; // Store user info
}

const auth: RequestHandler = (req: Request, res: Response, next: express.NextFunction): void => {
  if (!req.path.startsWith('/api')) return next();

  // Public endpoints
  if (req.path === '/api/login' || req.path === '/api/users') {
    return next();
  }

  const headerUserId = req.header('x-user-id');
  if (!headerUserId) {
    res.status(401).json({ error: 'Missing user context' });
    return;
  }

  (req as AuthedRequest).userId = headerUserId;
  next();
};

const loginSchema = z.object({
  username: z.string(),
  picturePassword: z.string()
});

interface User {
  id: string;
  username: string;
  display_name: string;
  user_type: string;
}

interface UserWithPicture extends User {
  picture_password: string | null;
}

// Login endpoint
app.post('/api/login', async (req: Request, res: Response) => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid login data' });

  const { username, picturePassword } = parse.data;
  
  const { rows } = await pool.query(
    'SELECT id, username, display_name, user_type FROM srs.users WHERE username = $1 AND picture_password = $2',
    [username, picturePassword]
  );
  
  if (rows.length === 0) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  
  const user = rows[0] as User;
  res.json({ user, success: true });
});

// Public endpoint to list users for the picture-password login selector
app.get('/api/users', async (_req: Request, res: Response) => {
  const { rows } = await pool.query(
    `SELECT id, username, display_name, user_type, picture_password
       FROM srs.users
      ORDER BY display_name`
  );
  res.json(rows as UserWithPicture[]);
});

app.use(auth);

// Teacher dashboard endpoints - simplified versions without permission issues
app.get('/api/teacher/students', async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  if (!(await isTeacherUser(userId))) {
    res.status(403).json({ error: 'Teacher access required' });
    return;
  }

  const privileges = await ensureStudentProgressPrivileges();
  if (!privileges.select) {
    warnStudentProgress('student_progress read access not available; returning limited student list.');
    const { rows } = await pool.query(
      `
      SELECT 
        u.id,
        u.username,
        u.display_name,
        u.created_at,
        u.updated_at
      FROM srs.users u
      WHERE u.user_type = 'student'
      ORDER BY u.username
      `
    );
    res.json(
      rows.map(row => ({
        id: row.id,
        username: row.username,
        display_name: row.display_name,
        total_reviews: 0,
        correct_reviews: 0,
        cards_completed: 0,
        created_at: row.created_at,
        last_activity: row.updated_at ? new Date(row.updated_at).toISOString() : null
      }))
    );
    return;
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT 
        u.id,
        u.username,
        u.display_name,
        u.created_at,
        COALESCE(sp.total_reviews, 0) AS total_reviews,
        COALESCE(sp.correct_reviews, 0) AS correct_reviews,
        COALESCE(sp.cards_completed, 0) AS cards_completed,
        COALESCE(
          latest_review.latest_activity,
          sp.updated_at,
          u.updated_at
        ) AS last_activity
      FROM srs.users u
      LEFT JOIN srs.student_progress sp ON sp.user_id = u.id
      LEFT JOIN LATERAL (
        SELECT MAX(r.created_at) AS latest_activity
        FROM srs.reviews r
        WHERE r.user_id = u.id
      ) AS latest_review ON TRUE
      WHERE u.user_type = 'student'
      ORDER BY u.username
      `
    );
    const formatted = rows.map(row => ({
      id: row.id,
      username: row.username,
      display_name: row.display_name,
      total_reviews: Number(row.total_reviews ?? 0),
      correct_reviews: Number(row.correct_reviews ?? 0),
      cards_completed: Number(row.cards_completed ?? 0),
      created_at: row.created_at,
      last_activity: row.last_activity ? new Date(row.last_activity).toISOString() : null
    }));
    res.json(formatted);
  } catch (err) {
    const { code, message } = err as { code?: string; message?: string };
    if (code === '42501') {
      studentProgressPrivileges = { select: false, insert: false, update: false };
      warnStudentProgress(`Skipping progress joins for teacher list due to permissions: ${message}`);
      const { rows } = await pool.query(
        `
        SELECT 
          u.id,
          u.username,
          u.display_name,
          u.created_at,
          u.updated_at
        FROM srs.users u
        WHERE u.user_type = 'student'
        ORDER BY u.username
        `
      );
      res.json(
        rows.map(row => ({
          id: row.id,
          username: row.username,
          display_name: row.display_name,
          total_reviews: 0,
          correct_reviews: 0,
          cards_completed: 0,
          created_at: row.created_at,
          last_activity: row.updated_at ? new Date(row.updated_at).toISOString() : null
        }))
      );
      return;
    }
    console.error('Failed to load teacher student list', err);
    res.status(500).json({ error: 'Failed to load students' });
  }
});

app.get('/api/teacher/stats/:userId', async (req: Request, res: Response) => {
  const { userId: requesterId } = req as AuthedRequest;
  if (!(await isTeacherUser(requesterId))) {
    res.status(403).json({ error: 'Teacher access required' });
    return;
  }

  const userId = req.params.userId;
  const client = await pool.connect();
  try {
    const privileges = await ensureStudentProgressPrivileges(client);
    if (!privileges.select) {
      warnStudentProgress('student_progress read access not available; returning empty stats.');
      res.json({
        stats: { total_reviews: 0, correct_reviews: 0, cards_completed: 0 },
        recentReviews: []
      });
      return;
    }

    const statsResult = await client.query(
      `
      SELECT 
        COALESCE(total_reviews, 0) AS total_reviews,
        COALESCE(correct_reviews, 0) AS correct_reviews,
        COALESCE(cards_completed, 0) AS cards_completed
      FROM srs.student_progress
      WHERE user_id = $1
      `,
      [userId]
    );

    const statsRow = statsResult.rows[0];
    const stats = {
      total_reviews: Number(statsRow?.total_reviews ?? 0),
      correct_reviews: Number(statsRow?.correct_reviews ?? 0),
      cards_completed: Number(statsRow?.cards_completed ?? 0)
    };

    const reviewState = await fetchReviewsColumnState(client);
    let recentRows: Array<{ review_day: unknown; reviews_count: number; correct_count: number | null }> = [];
    let deckTotals: Array<{
      deck_id: string | null;
      deck_name: string | null;
      total_reviews: number;
      correct_reviews: number;
    }> = [];
    const deckRecentMap = new Map<
      string | null,
      Array<{ review_day: unknown; reviews_count: number; correct_count: number | null; deck_name: string | null }>
    >();

    if (reviewState.hasGrade || reviewState.hasRating) {
      const correctCondition = reviewState.hasGrade
        ? "r.grade IN ('good', 'easy')"
        : buildRatingCorrectCondition(reviewState);

      const recentResult = await client.query(
        `
        SELECT 
          date_trunc('day', r.created_at) AS review_day,
          COUNT(*) AS reviews_count,
          SUM(CASE WHEN ${correctCondition} THEN 1 ELSE 0 END) AS correct_count
        FROM srs.reviews r
        WHERE r.user_id = $1
          AND r.created_at >= NOW() - INTERVAL '14 days'
        GROUP BY review_day
        ORDER BY review_day DESC
        LIMIT 14
        `,
        [userId]
      );

      recentRows = recentResult.rows as Array<{
        review_day: unknown;
        reviews_count: number;
        correct_count: number | null;
      }>;

      const deckTotalsResult = await client.query(
        `
        SELECT 
          c.deck_id,
          d.name AS deck_name,
          COUNT(*) AS total_reviews,
          SUM(CASE WHEN ${correctCondition} THEN 1 ELSE 0 END) AS correct_reviews
        FROM srs.reviews r
        JOIN srs.cards c ON c.id = r.card_id
        LEFT JOIN srs.decks d ON d.id = c.deck_id
        WHERE r.user_id = $1
        GROUP BY c.deck_id, d.name
        `,
        [userId]
      );
      deckTotals = deckTotalsResult.rows.map(row => ({
        deck_id: row.deck_id ?? null,
        deck_name: row.deck_name ?? null,
        total_reviews: Number(row.total_reviews ?? 0),
        correct_reviews: Number(row.correct_reviews ?? 0)
      }));

      const deckRecentResult = await client.query(
        `
        SELECT 
          c.deck_id,
          d.name AS deck_name,
          date_trunc('day', r.created_at) AS review_day,
          COUNT(*) AS reviews_count,
          SUM(CASE WHEN ${correctCondition} THEN 1 ELSE 0 END) AS correct_count
        FROM srs.reviews r
        JOIN srs.cards c ON c.id = r.card_id
        LEFT JOIN srs.decks d ON d.id = c.deck_id
        WHERE r.user_id = $1
          AND r.created_at >= NOW() - INTERVAL '14 days'
        GROUP BY c.deck_id, d.name, review_day
        ORDER BY review_day DESC
        `,
        [userId]
      );

      for (const row of deckRecentResult.rows as Array<{
        deck_id: string | null;
        deck_name: string | null;
        review_day: unknown;
        reviews_count: number;
        correct_count: number | null;
      }>) {
        const key = row.deck_id ?? 'unknown';
        if (!deckRecentMap.has(row.deck_id ?? null)) {
          deckRecentMap.set(row.deck_id ?? null, []);
        }
        deckRecentMap.get(row.deck_id ?? null)?.push({
          deck_name: row.deck_name,
          review_day: row.review_day,
          reviews_count: row.reviews_count,
          correct_count: row.correct_count
        });
      }
    }

    const deckStats = deckTotals.map(row => ({
      deck_id: row.deck_id,
      deck_name: row.deck_name ?? 'Unknown deck',
      total_reviews: row.total_reviews,
      correct_reviews: row.correct_reviews,
      recentReviews: (deckRecentMap.get(row.deck_id) ?? [])
        .map(entry => ({
          date: formatReviewDay(entry.review_day),
          reviews_count: Number(entry.reviews_count),
          correct_count: Number(entry.correct_count ?? 0)
        }))
        .reverse()
    }));

    res.json({
      stats,
      recentReviews: recentRows
        .map(row => ({
          date: formatReviewDay(row.review_day),
          reviews_count: Number(row.reviews_count),
          correct_count: Number(row.correct_count ?? 0)
        }))
        .reverse(),
      deckStats
    });
  } catch (err) {
    const { code, message } = err as { code?: string; message?: string };
    if (code === '42501') {
      warnStudentProgress(`Skipping detailed teacher stats due to permissions: ${message}`);
      studentProgressPrivileges = { select: false, insert: false, update: false };
      res.json({
        stats: { total_reviews: 0, correct_reviews: 0, cards_completed: 0 },
        recentReviews: []
      });
    } else {
      console.error('Failed to load teacher stats', err);
      res.status(500).json({ error: 'Failed to load stats' });
    }
  } finally {
    client.release();
  }
});

app.get('/api/teacher/decks', async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  if (!(await isTeacherUser(userId))) {
    res.status(403).json({ error: 'Teacher access required' });
    return;
  }

  try {
    const includeCreatedBy = await doesDeckTableHaveCreatedBy(pool);
    const selectColumns = includeCreatedBy
      ? `d.id, d.name, d.description, d.created_at, d.created_by`
      : `d.id, d.name, d.description, d.created_at`;
    const groupColumns = includeCreatedBy
      ? 'd.id, d.name, d.description, d.created_at, d.created_by'
      : 'd.id, d.name, d.description, d.created_at';

    const { rows } = await pool.query(
      `
      SELECT 
        ${selectColumns},
        COUNT(c.id) AS card_count
      FROM srs.decks d
      LEFT JOIN srs.cards c ON c.deck_id = d.id
      GROUP BY ${groupColumns}
      ORDER BY d.created_at ASC
      `
    );

    res.json(
      rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description ?? '',
        created_at: row.created_at,
        created_by: 'created_by' in row ? row.created_by : null,
        card_count: Number(row.card_count ?? 0)
      }))
    );
  } catch (err) {
    console.error('Failed to load decks', err);
    res.status(500).json({ error: 'Failed to load decks' });
  }
});

app.get('/api/teacher/decks/:deckId/cards', async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  if (!(await isTeacherUser(userId))) {
    res.status(403).json({ error: 'Teacher access required' });
    return;
  }

  const { deckId } = req.params;
  const client = await pool.connect();
  try {
    const includeCreatedBy = await doesDeckTableHaveCreatedBy(client);
    const deckResult = await client.query(
      includeCreatedBy
        ? `SELECT id, name, description, created_at, created_by FROM srs.decks WHERE id = $1`
        : `SELECT id, name, description, created_at FROM srs.decks WHERE id = $1`,
      [deckId]
    );
    if (deckResult.rowCount === 0) {
      res.status(404).json({ error: 'Deck not found' });
      return;
    }

    const { rows: cardRows } = await client.query(
      `
      SELECT id, front, back, created_at
        FROM srs.cards
       WHERE deck_id = $1
       ORDER BY created_at ASC, id ASC
       LIMIT 500
      `,
      [deckId]
    );

    const countResult = await client.query<{ card_count: number }>(
      `SELECT COUNT(*)::integer AS card_count FROM srs.cards WHERE deck_id = $1`,
      [deckId]
    );
    const cardCount = countResult.rows[0]?.card_count ?? cardRows.length;

    res.json({
      deck: includeCreatedBy
        ? deckResult.rows[0]
        : { ...deckResult.rows[0], created_by: null },
      card_count: cardCount,
      cards: cardRows.map(row => ({
        id: row.id,
        front: row.front,
        back: row.back,
        created_at: row.created_at
      }))
    });
  } catch (err) {
    console.error('Failed to load deck cards', err);
    res.status(500).json({ error: 'Failed to load deck cards' });
  } finally {
    client.release();
  }
});

app.get('/api/decks', async (_req: Request, res: Response) => {
  try {
    const includeCreatedBy = await doesDeckTableHaveCreatedBy(pool);
    const selectColumns = includeCreatedBy
      ? `d.id,
         d.name,
         COALESCE(d.description, '') AS description,
         d.created_at,
         d.created_by`
      : `d.id,
         d.name,
         COALESCE(d.description, '') AS description,
         d.created_at`;
    const groupColumns = includeCreatedBy
      ? 'd.id, d.name, d.description, d.created_at, d.created_by'
      : 'd.id, d.name, d.description, d.created_at';

    const { rows } = await pool.query(
      `
      SELECT 
        ${selectColumns},
        COUNT(c.id) AS card_count
      FROM srs.decks d
      LEFT JOIN srs.cards c ON c.deck_id = d.id
      GROUP BY ${groupColumns}
      ORDER BY d.created_at ASC
      `
    );

    res.json(
      rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description ?? '',
        created_at: row.created_at,
        created_by: includeCreatedBy ? row.created_by : null,
        card_count: Number(row.card_count ?? 0)
      }))
    );
  } catch (err) {
    console.error('Failed to list decks', err);
    res.status(500).json({ error: 'Failed to list decks' });
  }
});

app.get('/api/decks/:deckId', async (req: Request, res: Response) => {
  const { deckId } = req.params;
  try {
    const includeCreatedBy = await doesDeckTableHaveCreatedBy(pool);
    const selectColumns = includeCreatedBy
      ? `d.id,
        d.name,
        COALESCE(d.description, '') AS description,
        d.created_at,
        d.created_by`
      : `d.id,
        d.name,
        COALESCE(d.description, '') AS description,
        d.created_at`;
    const groupColumns = includeCreatedBy
      ? 'd.id, d.name, d.description, d.created_at, d.created_by'
      : 'd.id, d.name, d.description, d.created_at';

    const { rows } = await pool.query(
      `
      SELECT 
        ${selectColumns},
        COUNT(c.id) AS card_count
      FROM srs.decks d
      LEFT JOIN srs.cards c ON c.deck_id = d.id
      WHERE d.id = $1
      GROUP BY ${groupColumns}
      `,
      [deckId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Deck not found' });
      return;
    }

    const deck = rows[0];
    res.json({
      id: deck.id,
      name: deck.name,
      description: deck.description ?? '',
      created_at: deck.created_at,
      created_by: includeCreatedBy ? deck.created_by : null,
      card_count: Number(deck.card_count ?? 0)
    });
  } catch (err) {
    console.error('Failed to load shared deck', err);
    res.status(500).json({ error: 'Failed to load deck' });
  }
});

app.post('/api/teacher/decks', async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  if (!(await isTeacherUser(userId))) {
    res.status(403).json({ error: 'Teacher access required' });
    return;
  }

  const parse = createDeckSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Invalid deck payload' });
    return;
  }

  const { name, description, cards } = parse.data;
  const trimmedName = name.trim();
  if (!trimmedName) {
    res.status(400).json({ error: 'Deck name is required' });
    return;
  }

  const client = await pool.connect();
  try {
    const includeCreatedBy = await doesDeckTableHaveCreatedBy(client);
    await client.query('BEGIN');
    const deckResult = includeCreatedBy
      ? await client.query(
          `INSERT INTO srs.decks (name, description, created_by)
           VALUES ($1, $2, $3)
           RETURNING id, name, description, created_at, created_by`,
          [trimmedName, description?.trim() || null, userId]
        )
      : await client.query(
          `INSERT INTO srs.decks (name, description)
           VALUES ($1, $2)
           RETURNING id, name, description, created_at`,
          [trimmedName, description?.trim() || null]
        );
    const deck = deckResult.rows[0];

    let insertedIds: number[] = [];
    if (cards && cards.length > 0) {
      insertedIds = await insertDeckCards(client, deck.id, cards);
    }

    await client.query('COMMIT');

    const { rows } = await pool.query<{ card_count: number }>(
      `SELECT COUNT(*)::integer AS card_count FROM srs.cards WHERE deck_id = $1`,
      [deck.id]
    );

    res.status(201).json({
      id: deck.id,
      name: deck.name,
      description: deck.description ?? '',
      created_at: deck.created_at,
      created_by: 'created_by' in deck ? deck.created_by : null,
      card_count: rows[0]?.card_count ?? insertedIds.length,
      added_cards: insertedIds.length
    });
  } catch (err) {
    await client.query('ROLLBACK');
    const { code } = err as { code?: string };
    if (code === '23505') {
      res.status(409).json({ error: 'Deck name already exists' });
    } else {
      console.error('Failed to create deck', err);
      res.status(500).json({ error: 'Failed to create deck' });
    }
  } finally {
    client.release();
  }
});

app.post('/api/teacher/decks/:deckId/cards', async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  if (!(await isTeacherUser(userId))) {
    res.status(403).json({ error: 'Teacher access required' });
    return;
  }

  const parse = addDeckCardsSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Invalid card payload' });
    return;
  }

  const { deckId } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const deckResult = await client.query(
      `SELECT id FROM srs.decks WHERE id = $1`,
      [deckId]
    );
    if (deckResult.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Deck not found' });
      return;
    }

    const insertedIds = await insertDeckCards(client, deckId, parse.data.cards);
    await client.query('COMMIT');

    const { rows } = await pool.query<{ card_count: number }>(
      `SELECT COUNT(*)::integer AS card_count FROM srs.cards WHERE deck_id = $1`,
      [deckId]
    );

    res.status(201).json({
      added_cards: insertedIds.length,
      card_count: rows[0]?.card_count ?? null,
      card_ids: insertedIds
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to add cards to deck', err);
    res.status(500).json({ error: 'Failed to add cards' });
  } finally {
    client.release();
  }
});

app.post('/api/teacher/clear/:userId', async (req: Request, res: Response) => {
  // Return success for now due to permissions
  res.json({ success: true, message: 'All student data cleared (placeholder)' });
});

app.post('/api/teacher/reset-srs/:userId', async (req: Request, res: Response) => {
  // Return success for now due to permissions
  res.json({ success: true, message: 'SRS scheduling reset (placeholder)' });
});

const createStudentSchema = z.object({
  username: z.string().min(1).max(255),
  displayName: z.string().min(1).max(255),
  picturePassword: z.enum(['1', '2', '3', '4', '5']),
  email: z.string().email().optional()
});

app.post('/api/teacher/students', async (req: Request, res: Response) => {
  const parse = createStudentSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid student data' });
  }

  const { username, displayName, picturePassword, email } = parse.data;

  const client = await pool.connect();
  try {
    const existing = await client.query(
      `SELECT 1 FROM srs.users WHERE username = $1`,
      [username]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const derivedEmail = email ?? `${username}@students.local`;

    const insertUser = await client.query(
      `INSERT INTO srs.users (username, display_name, user_type, picture_password, email)
       VALUES ($1, $2, 'student', $3, $4)
       RETURNING id, username, display_name, user_type, created_at, updated_at`,
      [username, displayName, picturePassword, derivedEmail]
    );
    const newUser = insertUser.rows[0] as User & { created_at: Date; updated_at: Date };
    const newUserId = newUser.id;

    await client.query(
      `INSERT INTO srs.student_progress (user_id, total_reviews, correct_reviews, cards_completed)
       VALUES ($1, 0, 0, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [newUserId]
    ).catch(err => {
      if ((err as { code?: string }).code === '42501') {
        console.warn('Skipping student_progress seed due to permissions.');
        return;
      }
      throw err;
    });

    await client.query(
      `INSERT INTO srs.card_state (user_id, card_id, due_at, interval_days, ease_factor, reps)
       SELECT $1, c.id, NOW(), 0, 2.5, 0
         FROM srs.cards c
       ON CONFLICT (user_id, card_id) DO NOTHING`,
      [newUserId]
    ).catch(err => {
      if ((err as { code?: string }).code === '42501') {
        console.warn('Skipping card_state seed due to permissions.');
        return;
      }
      throw err;
    });

    res.status(201).json({
      id: newUser.id,
      username: newUser.username,
      display_name: newUser.display_name,
      user_type: newUser.user_type,
      created_at: newUser.created_at,
      updated_at: newUser.updated_at,
      total_reviews: 0,
      correct_reviews: 0,
      cards_completed: 0,
      last_activity: newUser.updated_at
    });
  } catch (err) {
    console.error('Failed to create student', err);
    res.status(500).json({ error: 'Failed to create student' });
  } finally {
    client.release();
  }
});

app.delete('/api/teacher/students/:studentId', async (req: Request, res: Response) => {
  const { studentId } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const dependentTables = ['srs.reviews', 'srs.card_state', 'srs.student_progress'];
    const missingDeletePrivileges: string[] = [];

    for (const table of dependentTables) {
      try {
        await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [studentId]);
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === '42501') {
          missingDeletePrivileges.push(table);
        } else {
          throw err;
        }
      }
    }

    if (missingDeletePrivileges.length > 0) {
      await client.query('ROLLBACK');
      console.warn(
        `Missing delete privileges for dependent tables (${missingDeletePrivileges.join(
          ', '
        )}); attempting archive fallback.`
      );
      const archived = await archiveStudent(studentId);
      if (archived) {
        return res.json({ success: true, archived: true, message: archived.message });
      }
      return res
        .status(403)
        .json({ error: 'Insufficient database privileges to remove student data.' });
    }

    const result = await client.query(
      `DELETE FROM srs.users
       WHERE id = $1 AND user_type = 'student'
       RETURNING id`,
      [studentId]
    );

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Student not found' });
    }

    await client.query('COMMIT');
    res.json({ success: true, removed: true });
  } catch (err) {
    await client.query('ROLLBACK');
    const { code } = err as { code?: string };
    if (code === '42501') {
      const archived = await archiveStudent(studentId);
      if (archived) {
        return res.json({ success: true, archived: true, message: archived.message });
      }
      console.warn('Unable to archive student after permission denied during delete.');
      return res
        .status(403)
        .json({ error: 'Insufficient database privileges to remove student data.' });
    }
    console.error('Failed to delete student', err);
    res.status(500).json({ error: 'Failed to delete student' });
  } finally {
    client.release();
  }
});

const deckCardSchema = z.object({
  front: z.string().min(1).max(1024),
  back: z.string().min(1).max(1024)
});

const createDeckSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1024).optional(),
  cards: z.array(deckCardSchema).max(500).optional()
});

const addDeckCardsSchema = z.object({
  cards: z.array(deckCardSchema).min(1).max(500)
});

const gradeSchema = z.object({ grade: z.enum(['again','hard','good','easy']) });

// Get cards using the user's card_state entries
app.get('/api/cards', async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const limitParam = req.query.limit;
  let limit: number | undefined;
  if (typeof limitParam === 'string') {
    const parsed = parseInt(limitParam, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return res.status(400).json({ error: 'Invalid limit' });
    }
    limit = parsed;
  }

  const setParamRaw = typeof req.query.set === 'string' ? req.query.set.trim() : null;
  const setParam = setParamRaw ? setParamRaw.toLowerCase() : null;
  let practiceSet: '9x9' | 'full' = 'full';
  let deckFilterId: string | null = null;

  if (setParam) {
    if (setParam === '9x9') {
      practiceSet = '9x9';
    } else if (setParam === 'full') {
      practiceSet = 'full';
    } else if (setParam.startsWith('deck:')) {
      deckFilterId = setParamRaw!.slice(5);
    } else {
      return res.status(400).json({ error: 'Invalid set' });
    }
  }

  if (typeof req.query.deck === 'string' && req.query.deck.trim()) {
    deckFilterId = req.query.deck.trim();
  }

  const defaultDeckId = await getDefaultDeckId();
  if (!deckFilterId) {
    deckFilterId = defaultDeckId;
  }

  if (practiceSet === '9x9') {
    if (!defaultDeckId) {
      return res.status(500).json({ error: 'Default deck unavailable' });
    }
    if (deckFilterId && deckFilterId !== defaultDeckId) {
      return res.status(400).json({ error: '9x9 practice is only available for the default deck' });
    }
    deckFilterId = defaultDeckId;
  }

  if (!deckFilterId) {
    return res.status(400).json({ error: 'Deck selection required' });
  }

  const sessionLogBase = {
    userId,
    practiceSet,
    deckFilterId,
    limit
  };

  const buildWhereAndParams = (includeDeckFilter: boolean) => {
    const params: (string | number)[] = [userId];
    const whereParts: string[] = [];

    if (includeDeckFilter && deckFilterId) {
      const deckIndex = params.push(deckFilterId);
      whereParts.push(`(c.deck_id = $${deckIndex}::uuid OR c.deck_id IS NULL)`);
    }

    if (practiceSet === '9x9') {
      const factorMatch = "regexp_match(lower(c.front), '(\\d+)\\D+(\\d+)')";
      const factor1Expr = `COALESCE(((${factorMatch})[1])::integer, 100)`;
      const factor2Expr = `COALESCE(((${factorMatch})[2])::integer, 100)`;
      whereParts.push(`(
        ${factor1Expr} <= 9
        AND ${factor2Expr} <= 9
      )`);
    }

    const whereSQL =
      whereParts.length > 0 ? '\n  AND ' + whereParts.join('\n  AND ') : '';

    let limitClause = '';
    if (limit !== undefined) {
      params.push(limit);
      limitClause = `LIMIT $${params.length}`;
    }

    const query = `
      SELECT
        c.id AS card_id,
        cs.id AS card_state_id,
        cs.due_at,
        cs.interval_days,
        cs.ease_factor::float AS ease_factor,
        cs.reps AS repetitions,
        cs.last_reviewed_at
      FROM srs.cards c
      LEFT JOIN srs.card_state cs
        ON cs.card_id = c.id
       AND cs.user_id = $1
      WHERE 1=1${whereSQL}
      ORDER BY
        CASE
          WHEN cs.id IS NOT NULL AND cs.due_at <= NOW() THEN 0
          WHEN cs.id IS NULL THEN 1
          ELSE 2
        END,
        COALESCE(cs.due_at, NOW()) ASC,
        c.id ASC
      ${limitClause}
    `;

    return { query, params };
  };

  const runCandidateQuery = async (includeDeckFilter: boolean) => {
    const { query, params } = buildWhereAndParams(includeDeckFilter);
    console.log('cards:session:query', {
      ...sessionLogBase,
      includeDeckFilter,
      query,
      params
    });
    const result = await client.query<CandidateRow>(query, params);
    return { result, params };
  };

  type CandidateRow = {
    card_id: number;
    card_state_id: string | null;
  };

  type FinalRow = {
    card_state_id: string;
    card_id: number;
    front: string;
    back: string;
    next_review: Date;
    interval_days: number;
    ease_factor: number;
    repetitions: number;
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let { result: initialResult } = await runCandidateQuery(true);
    let candidates = initialResult.rows;

    if (candidates.length === 0 && deckFilterId) {
      console.log('cards:session:fallback-missing-deck', sessionLogBase);
      const { result: fallbackResult } = await runCandidateQuery(false);
      candidates = fallbackResult.rows;
    }

    console.log('cards:session:candidates', {
      ...sessionLogBase,
      candidateCount: candidates.length
    });

    if (candidates.length === 0) {
      console.log('cards:session:no-candidates', sessionLogBase);
      await client.query('COMMIT');
      return res.json([]);
    }

    const rawCardIds = candidates.map(row => row.card_id);
    const cardIdLooksUuid = rawCardIds.some(id => {
      if (typeof id !== 'string') return false;
      return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id);
    });
    const normalizeId = (value: CandidateRow['card_id']) => {
      if (cardIdLooksUuid) return String(value);
      if (typeof value === 'number') return value;
      const parsed = Number.parseInt(String(value), 10);
      if (Number.isNaN(parsed)) {
        console.warn('cards:session:unexpected-card-id', {
          ...sessionLogBase,
          value
        });
        return null;
      }
      return parsed;
    };

    const cardIds = rawCardIds
      .map(normalizeId)
      .filter((id): id is number | string => id !== null);
    const missingCardIds = candidates
      .filter(row => !row.card_state_id)
      .map(row => normalizeId(row.card_id))
      .filter((id): id is number | string => id !== null);

    if (cardIds.length === 0) {
      console.warn('cards:session:no-normalized-card-ids', {
        ...sessionLogBase,
        rawCardIds
      });
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Failed to normalize card ids' });
    }

    console.log('cards:session:card-ids', {
      ...sessionLogBase,
      cardIds,
      missingCardIds,
      looksLikeUuid: cardIdLooksUuid
    });

    if (missingCardIds.length > 0) {
      console.log('cards:session:seeding-missing', {
        ...sessionLogBase,
        missingCount: missingCardIds.length
      });
      await client.query(
        `
        INSERT INTO srs.card_state (user_id, card_id, due_at, interval_days, ease_factor, reps)
        SELECT $1, c.id, NOW(), 0, 2.5, 0
          FROM srs.cards c
         WHERE c.id = ANY($2::${cardIdLooksUuid ? 'uuid' : 'integer'}[])
        ON CONFLICT (user_id, card_id) DO NOTHING
        `,
        [userId, missingCardIds]
      );
    }

    const { rows: finalRows } = await client.query<FinalRow>(
      `
      SELECT 
        cs.id AS card_state_id,
        cs.card_id,
        c.front,
        c.back,
        cs.due_at AS next_review,
        cs.interval_days,
        cs.ease_factor::float AS ease_factor,
        cs.reps AS repetitions
      FROM srs.card_state cs
      INNER JOIN srs.cards c ON c.id = cs.card_id
      WHERE cs.user_id = $1
        AND cs.card_id = ANY($2::${cardIdLooksUuid ? 'uuid' : 'integer'}[])
      `,
      [userId, cardIds]
    );

    await client.query('COMMIT');

    const finalByCardId = new Map<number, FinalRow>();
    for (const row of finalRows) {
      finalByCardId.set(row.card_id, row);
    }

    const ordered = candidates
      .map(candidate => finalByCardId.get(candidate.card_id))
      .filter((row): row is FinalRow => !!row);

    console.log('cards:session:final', {
      ...sessionLogBase,
      returnedCount: ordered.length,
      missingAfterJoin: candidates.length - ordered.length
    });

    return res.json(
      ordered.map(row => ({
        card_state_id: row.card_state_id,
        card_id: row.card_id,
        front: row.front,
        back: row.back,
        next_review: row.next_review,
        interval_days: row.interval_days,
        ease_factor: row.ease_factor,
        repetitions: row.repetitions,
        last_grade: null
      }))
    );
  } catch (err) {
    console.error('cards:session:error', { ...sessionLogBase, error: (err as Error).message });
    await client.query('ROLLBACK');
    console.error('Failed to load cards', err);
    return res.status(500).json({ error: 'Failed to load cards' });
  } finally {
    client.release();
  }
});

// Update card SRS data and log review history
app.post('/api/review/:cardStateId', async (req: Request, res: Response) => {
  const parse = gradeSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid grade' });

  const gradeMap: Record<string, number> = { again:0, hard:1, good:2, easy:3 };
  const g = gradeMap[parse.data.grade];
  const { userId } = req as AuthedRequest;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const cardStateId = req.params.cardStateId;
  if (!cardStateId || !/^[0-9a-fA-F-]{36}$/.test(cardStateId)) {
    return res.status(400).json({ error: 'Invalid card state id' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT card_id, ease_factor::float, interval_days, reps
         FROM srs.card_state
        WHERE user_id = $1 AND id = $2
        FOR UPDATE`,
      [userId, cardStateId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Card not found' });
    }
    let { card_id: originalCardId, ease_factor: ef, interval_days: ivl, reps } = rows[0] as {
      card_id: number;
      ease_factor: number;
      interval_days: number;
      reps: number;
    };

    // --- SM-2(ish) update ---
    // Grades: 0 again, 1 hard, 2 good, 3 easy
    if (g < 2) {
      reps = 0;
      ivl = 1;
    } else {
      reps += 1;
      if (reps === 1) ivl = 1;
      else if (reps === 2) ivl = 6;
      else ivl = Math.max(1, Math.round(ivl * ef));
    }

    // Ease factor adjustment (classic SM-2)
    // ef' = ef + (0.1 - (3 - q) * (0.08 + (3 - q) * 0.02))
    const q = g; // 0..3 (we mapped 0..3 instead of 0..5; works fine)
    const delta = 0.1 - (3 - q) * (0.08 + (3 - q) * 0.02);
    ef = Math.max(1.3, ef + delta);

    // Gentle boosts/nerfs for Easy/Hard
    if (g === 3) ivl = Math.round(ivl * 1.3);

    const dueAt = new Date();
    dueAt.setUTCDate(dueAt.getUTCDate() + ivl);

    const supportsUpdatedAt = await doesCardStateHaveUpdatedAt(client);
    const updateParams = [dueAt, ivl, ef, reps, cardStateId, userId];
    const updateWithUpdatedAt = `UPDATE srs.card_state
          SET due_at = $1, interval_days = $2, ease_factor = $3,
              reps = $4, last_reviewed_at = now(), updated_at = now()
        WHERE id = $5 AND user_id = $6`;
    const updateWithoutUpdatedAt = `UPDATE srs.card_state
          SET due_at = $1, interval_days = $2, ease_factor = $3,
              reps = $4, last_reviewed_at = now()
        WHERE id = $5 AND user_id = $6`;

    if (supportsUpdatedAt) {
      await client.query('SAVEPOINT review_card_state_update');
      try {
        await client.query(updateWithUpdatedAt, updateParams);
        await client.query('RELEASE SAVEPOINT review_card_state_update');
      } catch (err) {
        const pgErr = err as { code?: string; message?: string };
        const missingUpdatedAt =
          pgErr.code === '42703' && pgErr.message && pgErr.message.includes('updated_at');

        if (!missingUpdatedAt) {
          await client.query('ROLLBACK TO SAVEPOINT review_card_state_update');
          throw err;
        }

        await client.query('ROLLBACK TO SAVEPOINT review_card_state_update');
        cardStateSupportsUpdatedAt = false;
        console.warn(
          'Detected missing updated_at on srs.card_state; continuing without updating that column.'
        );
        await client.query(updateWithoutUpdatedAt, updateParams);
        await client.query('RELEASE SAVEPOINT review_card_state_update');
      }
    } else {
      await client.query(updateWithoutUpdatedAt, updateParams);
    }

    await logReviewEvent(client, userId, originalCardId, parse.data.grade, g);

    const correctIncrement = parse.data.grade === 'good' || parse.data.grade === 'easy' ? 1 : 0;
    const progressPrivileges = await ensureStudentProgressPrivileges(client);
    const canMutateProgress = progressPrivileges.insert && progressPrivileges.update;
    let progressSkipped = !canMutateProgress;
    let progressRowCount = 0;

    if (!canMutateProgress) {
      warnStudentProgress('student_progress write access not available; skipping progress tracking.');
      studentProgressPrivileges = {
        select: progressPrivileges.select,
        insert: false,
        update: false
      };
    } else {
      try {
        const progressResult = await client.query(
          `UPDATE srs.student_progress
              SET total_reviews = total_reviews + 1,
                  correct_reviews = correct_reviews + $2,
                  cards_completed = (
                    SELECT COUNT(DISTINCT card_id)
                    FROM srs.reviews
                    WHERE user_id = $1
                  ),
                  updated_at = NOW()
            WHERE user_id = $1`,
          [userId, correctIncrement]
        );
        progressRowCount = progressResult.rowCount ?? 0;
      } catch (err) {
        const { code, message } = err as { code?: string; message?: string };
        if (code === '42501') {
          warnStudentProgress(`Skipping student_progress update due to permissions: ${message}`);
          studentProgressPrivileges = {
            select: progressPrivileges.select,
            insert: false,
            update: false
          };
          progressSkipped = true;
        } else {
          throw err;
        }
      }
    }

    if (!progressSkipped && progressRowCount === 0) {
      try {
        await client.query(
          `INSERT INTO srs.student_progress (user_id, total_reviews, correct_reviews, cards_completed)
           VALUES (
             $1,
             1,
             $2,
             (
               SELECT COUNT(DISTINCT card_id)
               FROM srs.reviews
               WHERE user_id = $1
             )
           )`,
          [userId, correctIncrement]
        );
      } catch (err) {
        const { code, message } = err as { code?: string; message?: string };
        if (code === '42501') {
          warnStudentProgress(`Skipping student_progress insert due to permissions: ${message}`);
          studentProgressPrivileges = {
            select: progressPrivileges.select,
            insert: false,
            update: false
          };
        } else {
          throw err;
        }
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true, next_review: dueAt.toISOString(), interval_days: ivl, ease_factor: ef, repetitions: reps });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Review update failed:', e);
    res.status(500).json({ error: 'Update failed' });
  } finally {
    client.release();
  }
});

const clientBuildPath = path.resolve(__dirname, '../../client/build');
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
} else {
  console.warn(`Client build assets not found at ${clientBuildPath}; API-only mode.`);
}

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API on :${port}`));
