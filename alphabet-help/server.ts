/**
 * Alphabet Time — Bun + SQLite server
 *
 * Run:   bun server.ts
 * Open:  http://localhost:4321  (override with PORT=… bun server.ts)
 *
 * Data lives in ./alphabet.db (one file, copy it to back up).
 */

import path from "path";
import { Database } from "bun:sqlite";

const dbPath = process.env.DB_PATH ?? path.join(import.meta.dir, "alphabet.db");
const db = new Database(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    case_mode   TEXT NOT NULL DEFAULT 'upper'
  );

  CREATE TABLE IF NOT EXISTS classes (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cards (
    student_id     TEXT NOT NULL,
    letter         TEXT NOT NULL,
    reps           INTEGER NOT NULL DEFAULT 0,
    ease           REAL    NOT NULL DEFAULT 2.5,
    interval_days  INTEGER NOT NULL DEFAULT 0,
    due_at         INTEGER NOT NULL DEFAULT 0,
    lapses         INTEGER NOT NULL DEFAULT 0,
    total_seen     INTEGER NOT NULL DEFAULT 0,
    total_correct  INTEGER NOT NULL DEFAULT 0,
    last_seen_at   INTEGER,
    PRIMARY KEY (student_id, letter),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sessions (
    student_id  TEXT NOT NULL,
    date        TEXT NOT NULL,
    reviewed    INTEGER NOT NULL DEFAULT 0,
    correct     INTEGER NOT NULL DEFAULT 0,
    streak      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (student_id, date),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS phonics (
    id          TEXT PRIMARY KEY,
    text        TEXT NOT NULL,
    example     TEXT,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS phonics_cards (
    student_id     TEXT NOT NULL,
    phonics_id     TEXT NOT NULL,
    reps           INTEGER NOT NULL DEFAULT 0,
    ease           REAL    NOT NULL DEFAULT 2.5,
    interval_days  INTEGER NOT NULL DEFAULT 0,
    due_at         INTEGER NOT NULL DEFAULT 0,
    lapses         INTEGER NOT NULL DEFAULT 0,
    total_seen     INTEGER NOT NULL DEFAULT 0,
    total_correct  INTEGER NOT NULL DEFAULT 0,
    last_seen_at   INTEGER,
    PRIMARY KEY (student_id, phonics_id),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (phonics_id) REFERENCES phonics(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sight_words (
    id          TEXT PRIMARY KEY,
    text        TEXT NOT NULL,
    group_no    INTEGER NOT NULL,
    position    INTEGER NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sight_word_cards (
    student_id      TEXT NOT NULL,
    sight_word_id   TEXT NOT NULL,
    reps            INTEGER NOT NULL DEFAULT 0,
    ease            REAL    NOT NULL DEFAULT 2.5,
    interval_days   INTEGER NOT NULL DEFAULT 0,
    due_at          INTEGER NOT NULL DEFAULT 0,
    lapses          INTEGER NOT NULL DEFAULT 0,
    total_seen      INTEGER NOT NULL DEFAULT 0,
    total_correct   INTEGER NOT NULL DEFAULT 0,
    last_seen_at    INTEGER,
    PRIMARY KEY (student_id, sight_word_id),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (sight_word_id) REFERENCES sight_words(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sight_word_sessions (
    student_id  TEXT NOT NULL,
    date        TEXT NOT NULL,
    reviewed    INTEGER NOT NULL DEFAULT 0,
    correct     INTEGER NOT NULL DEFAULT 0,
    streak      INTEGER NOT NULL DEFAULT 0,
    new_introduced INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (student_id, date),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  );

  /* CVC ("cat"), CVCe ("cake") and book words, global like phonics. Each word
     is a beginning sound (onset) + ending chunk (rime); the rime carries the
     silent e for CVCe. 'book' holds the level reader's words, whose onset is
     often a new digraph (sh-ip, ch-op, tr-ain) rather than a single letter;
     it surfaces in the UI as "Phonics Kids 4" — the kind is the stored key,
     the label is display-only, so renaming the book needs no migration.
     The kind column is 'cvc', 'cvce' or 'book' — one table, three modes. */
  CREATE TABLE IF NOT EXISTS cvc_words (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL,
    onset       TEXT NOT NULL,
    rime        TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cvc_cards (
    student_id     TEXT NOT NULL,
    cvc_word_id    TEXT NOT NULL,
    reps           INTEGER NOT NULL DEFAULT 0,
    ease           REAL    NOT NULL DEFAULT 2.5,
    interval_days  INTEGER NOT NULL DEFAULT 0,
    due_at         INTEGER NOT NULL DEFAULT 0,
    lapses         INTEGER NOT NULL DEFAULT 0,
    total_seen     INTEGER NOT NULL DEFAULT 0,
    total_correct  INTEGER NOT NULL DEFAULT 0,
    last_seen_at   INTEGER,
    PRIMARY KEY (student_id, cvc_word_id),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (cvc_word_id) REFERENCES cvc_words(id) ON DELETE CASCADE
  );

  /* Per-(student, area, date) daily counters for the newer practice areas.
     'cvc', 'cvce' and 'book' each get their own row so streaks, the cap,
     and the weekly chart stay isolated per skill — same idea as
     sight_word_sessions, generalised by an area column. */
  CREATE TABLE IF NOT EXISTS area_sessions (
    student_id     TEXT NOT NULL,
    area           TEXT NOT NULL,
    date           TEXT NOT NULL,
    reviewed       INTEGER NOT NULL DEFAULT 0,
    correct        INTEGER NOT NULL DEFAULT 0,
    streak         INTEGER NOT NULL DEFAULT 0,
    new_introduced INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (student_id, area, date),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  );
`);

/* Idempotent migration: add `mode` to existing students tables */
try {
  db.exec("ALTER TABLE students ADD COLUMN mode TEXT NOT NULL DEFAULT 'alphabet'");
} catch (e) {
  /* column already exists */
}
try {
  db.exec("ALTER TABLE students ADD COLUMN new_per_day INTEGER NOT NULL DEFAULT 10");
} catch (e) {
  /* column already exists */
}
try {
  db.exec("ALTER TABLE students ADD COLUMN session_size INTEGER NOT NULL DEFAULT 10");
} catch (e) {
  /* column already exists */
}
try {
  db.exec("ALTER TABLE sessions ADD COLUMN new_introduced INTEGER NOT NULL DEFAULT 0");
} catch (e) {
  /* column already exists */
}
/* Class membership: nullable FK-by-convention. We unassign students manually
 * on class delete rather than rely on an ALTER-added foreign key. */
try {
  db.exec("ALTER TABLE students ADD COLUMN class_id TEXT");
} catch (e) {
  /* column already exists */
}

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const LOWER = "abcdefghijklmnopqrstuvwxyz".split("");
const DAY_MS = 24 * 60 * 60 * 1000;

const todayStr = () => new Date().toISOString().slice(0, 10);
const windowStartStr = (days: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString().slice(0, 10);
};
const uid = (prefix: string) => prefix + Math.random().toString(36).slice(2, 9);
const lettersFor = (mode: string) =>
  mode === "upper" ? UPPER : mode === "lower" ? LOWER : [...UPPER, ...LOWER];

const VALID_MODES = new Set(["alphabet", "mixed", "phonics", "sight", "cvc", "cvce", "book"]);
const VALID_CASES = new Set(["upper", "lower", "both"]);
/* The word kinds stored in cvc_words / cvc_cards. Each is also its own
 * practice area, so each keeps a separate daily session row. */
const WORD_KINDS = new Set(["cvc", "cvce", "book"]);

/* The practice "area" a card type belongs to. Each area keeps its own daily
 * session row so streaks / caps / weekly stats stay separated by skill.
 * letters + phonics share 'main'; sight and each word kind stand alone. */
const areaOf = (type: string) =>
  type === "sight" ? "sight" : WORD_KINDS.has(type) ? type : "main";

/* per-student one-step undo snapshots, in memory.
 * Sight/CVC cards log to their own session rows, so the snapshot holds
 * whichever session row was actually mutated, tagged with its area. */
type Snap = {
  type: "letter" | "phonics" | "sight" | "cvc" | "cvce" | "book";
  key: string;
  card: any;
  session: any;
  area: string;
};
const undoSnaps = new Map<string, Snap>();

/* Fry First 100 sight words, seeded into the global sight_words table
 * on first boot. Position is the canonical sort order (group 1 first). */
const FRY_FIRST_100: { group: number; words: string[] }[] = [
  { group: 1, words: ["the","of","and","a","to","in","is","you","that","it","he","was","for","on","are","as","with","his","they","I","at","be","this","have","from"] },
  { group: 2, words: ["or","one","had","by","word","but","not","what","all","were","we","when","your","can","said","there","use","an","each","which","she","do","how","their","if"] },
  { group: 3, words: ["will","up","other","about","out","many","then","time","these","so","some","her","would","make","like","him","into","has","look","two","more","write","go","see","number"] },
  { group: 4, words: ["no","way","could","people","my","than","first","water","been","call","who","oil","its","now","find","long","down","day","did","get","come","made","may","part","over"] },
];

/* ---------- Prepared statements ---------- */
const qStudent       = db.query("SELECT * FROM students WHERE id = ?");
const qStudents      = db.query("SELECT id, name, class_id AS classId FROM students ORDER BY name COLLATE NOCASE");
const qCardsFor      = db.query("SELECT * FROM cards WHERE student_id = ?");
const qCard          = db.query("SELECT * FROM cards WHERE student_id = ? AND letter = ?");
const qSession       = db.query("SELECT * FROM sessions WHERE student_id = ? AND date = ?");
const qRecentSessions = db.query("SELECT * FROM sessions WHERE student_id = ? AND date >= ? ORDER BY date");
const qInsertStudent = db.query("INSERT INTO students (id, name, created_at, case_mode, mode) VALUES (?, ?, ?, ?, ?)");
const qInsertCard    = db.query("INSERT OR IGNORE INTO cards (student_id, letter, due_at) VALUES (?, ?, ?)");
const qInsertSession = db.query("INSERT OR IGNORE INTO sessions (student_id, date) VALUES (?, ?)");
const qUpdateCard    = db.query(`
  UPDATE cards SET reps = ?, ease = ?, interval_days = ?, due_at = ?,
    lapses = ?, total_seen = ?, total_correct = ?, last_seen_at = ?
  WHERE student_id = ? AND letter = ?
`);
const qUpdateSession = db.query(`
  UPDATE sessions SET reviewed = ?, correct = ?, streak = ?, new_introduced = ?
  WHERE student_id = ? AND date = ?
`);

/* ---------- Classes ---------- */
const qClassesAll = db.query(`
  SELECT c.id, c.name, c.created_at,
         (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id) AS studentCount
  FROM classes c
  ORDER BY c.name COLLATE NOCASE
`);
const qClass                 = db.query("SELECT * FROM classes WHERE id = ?");
const qInsertClass           = db.query("INSERT INTO classes (id, name, created_at) VALUES (?, ?, ?)");
const qUpdateClass           = db.query("UPDATE classes SET name = ? WHERE id = ?");
const qDeleteClass           = db.query("DELETE FROM classes WHERE id = ?");
const qUnassignClassStudents = db.query("UPDATE students SET class_id = NULL WHERE class_id = ?");
const qSetStudentClass       = db.query("UPDATE students SET class_id = ? WHERE id = ?");

const qPhonicsAll      = db.query("SELECT * FROM phonics ORDER BY created_at");
const qPhonics         = db.query("SELECT * FROM phonics WHERE id = ?");
const qInsertPhonics   = db.query("INSERT INTO phonics (id, text, example, created_at) VALUES (?, ?, ?, ?)");
const qUpdatePhonics   = db.query("UPDATE phonics SET text = ?, example = ? WHERE id = ?");
const qDeletePhonics   = db.query("DELETE FROM phonics WHERE id = ?");
const qPhonicsCardsFor = db.query(`
  SELECT p.id, p.text, p.example, pc.reps, pc.ease, pc.interval_days, pc.due_at,
         pc.lapses, pc.total_seen, pc.total_correct, pc.last_seen_at
  FROM phonics p
  JOIN phonics_cards pc ON pc.phonics_id = p.id
  WHERE pc.student_id = ?
  ORDER BY p.created_at
`);
const qPhonicsCard       = db.query("SELECT * FROM phonics_cards WHERE student_id = ? AND phonics_id = ?");
const qInsertPhonicsCard = db.query("INSERT OR IGNORE INTO phonics_cards (student_id, phonics_id, due_at) VALUES (?, ?, ?)");
const qUpdatePhonicsCard = db.query(`
  UPDATE phonics_cards SET reps = ?, ease = ?, interval_days = ?, due_at = ?,
    lapses = ?, total_seen = ?, total_correct = ?, last_seen_at = ?
  WHERE student_id = ? AND phonics_id = ?
`);
const qBackfillPhonicsCardsForStudent = db.query(`
  INSERT OR IGNORE INTO phonics_cards (student_id, phonics_id, due_at)
  SELECT ?, id, ? FROM phonics
`);
const qBackfillPhonicsCardsForPhonics = db.query(`
  INSERT OR IGNORE INTO phonics_cards (student_id, phonics_id, due_at)
  SELECT id, ?, ? FROM students
`);

const qSightWordsAll      = db.query("SELECT * FROM sight_words ORDER BY position");
const qSightWordsCount    = db.query("SELECT COUNT(*) AS c FROM sight_words");
const qInsertSightWord    = db.query("INSERT INTO sight_words (id, text, group_no, position, created_at) VALUES (?, ?, ?, ?, ?)");
const qSightCardsFor      = db.query(`
  SELECT sw.id, sw.text, sw.group_no, sw.position,
         swc.reps, swc.ease, swc.interval_days, swc.due_at,
         swc.lapses, swc.total_seen, swc.total_correct, swc.last_seen_at
  FROM sight_words sw
  JOIN sight_word_cards swc ON swc.sight_word_id = sw.id
  WHERE swc.student_id = ?
  ORDER BY sw.position
`);
const qSightCard          = db.query("SELECT * FROM sight_word_cards WHERE student_id = ? AND sight_word_id = ?");
const qInsertSightCard    = db.query("INSERT OR IGNORE INTO sight_word_cards (student_id, sight_word_id, due_at) VALUES (?, ?, ?)");
const qUpdateSightCard    = db.query(`
  UPDATE sight_word_cards SET reps = ?, ease = ?, interval_days = ?, due_at = ?,
    lapses = ?, total_seen = ?, total_correct = ?, last_seen_at = ?
  WHERE student_id = ? AND sight_word_id = ?
`);
const qBackfillSightCardsForStudent = db.query(`
  INSERT OR IGNORE INTO sight_word_cards (student_id, sight_word_id, due_at)
  SELECT ?, id, ? FROM sight_words
`);

const qSightSession         = db.query("SELECT * FROM sight_word_sessions WHERE student_id = ? AND date = ?");
const qInsertSightSession   = db.query("INSERT OR IGNORE INTO sight_word_sessions (student_id, date) VALUES (?, ?)");
const qUpdateSightSession   = db.query(`
  UPDATE sight_word_sessions SET reviewed = ?, correct = ?, streak = ?, new_introduced = ?
  WHERE student_id = ? AND date = ?
`);
const qRecentSightSessions  = db.query("SELECT * FROM sight_word_sessions WHERE student_id = ? AND date >= ? ORDER BY date");

/* ---- CVC / CVCe words (global) + per-student cards ---- */
const qCvcWordsAll  = db.query("SELECT * FROM cvc_words ORDER BY created_at");
const qCvcWord      = db.query("SELECT * FROM cvc_words WHERE id = ?");
const qInsertCvcWord = db.query("INSERT INTO cvc_words (id, kind, onset, rime, created_at) VALUES (?, ?, ?, ?, ?)");
const qUpdateCvcWord = db.query("UPDATE cvc_words SET onset = ?, rime = ? WHERE id = ?");
const qDeleteCvcWord = db.query("DELETE FROM cvc_words WHERE id = ?");
const qCvcCardsForKind = db.query(`
  SELECT w.id, w.kind, w.onset, w.rime,
         cc.reps, cc.ease, cc.interval_days, cc.due_at,
         cc.lapses, cc.total_seen, cc.total_correct, cc.last_seen_at
  FROM cvc_words w
  JOIN cvc_cards cc ON cc.cvc_word_id = w.id
  WHERE cc.student_id = ? AND w.kind = ?
  ORDER BY w.created_at
`);
const qCvcCard       = db.query("SELECT * FROM cvc_cards WHERE student_id = ? AND cvc_word_id = ?");
const qUpdateCvcCard = db.query(`
  UPDATE cvc_cards SET reps = ?, ease = ?, interval_days = ?, due_at = ?,
    lapses = ?, total_seen = ?, total_correct = ?, last_seen_at = ?
  WHERE student_id = ? AND cvc_word_id = ?
`);
const qBackfillCvcCardsForStudent = db.query(`
  INSERT OR IGNORE INTO cvc_cards (student_id, cvc_word_id, due_at)
  SELECT ?, id, ? FROM cvc_words
`);
const qBackfillCvcCardsForWord = db.query(`
  INSERT OR IGNORE INTO cvc_cards (student_id, cvc_word_id, due_at)
  SELECT id, ?, ? FROM students
`);

/* ---- Area sessions (cvc, cvce, book) ---- */
const qAreaSession        = db.query("SELECT * FROM area_sessions WHERE student_id = ? AND area = ? AND date = ?");
const qInsertAreaSession  = db.query("INSERT OR IGNORE INTO area_sessions (student_id, area, date) VALUES (?, ?, ?)");
const qUpdateAreaSession  = db.query(`
  UPDATE area_sessions SET reviewed = ?, correct = ?, streak = ?, new_introduced = ?
  WHERE student_id = ? AND area = ? AND date = ?
`);
const qRecentAreaSessions = db.query("SELECT * FROM area_sessions WHERE student_id = ? AND area = ? AND date >= ? ORDER BY date");

/* Seed the Fry list once on first boot. Idempotent — re-running with rows
 * present is a no-op. Use the same uid() helper as everything else so ids
 * look consistent. */
function seedSightWords() {
  const count = (qSightWordsCount.get() as any).c as number;
  if (count > 0) return;
  const now = Date.now();
  let position = 0;
  for (const g of FRY_FIRST_100) {
    for (const w of g.words) {
      qInsertSightWord.run(uid("sw_"), w, g.group, position++, now);
    }
  }
}
seedSightWords();

/* ---------- Helpers ---------- */
function ensureLetterCards(studentId: string, caseMode: string) {
  const now = Date.now();
  for (const l of lettersFor(caseMode)) qInsertCard.run(studentId, l, now);
}

function ensurePhonicsCards(studentId: string) {
  qBackfillPhonicsCardsForStudent.run(studentId, Date.now());
}

function ensureSightWordCards(studentId: string) {
  qBackfillSightCardsForStudent.run(studentId, Date.now());
}

function ensureCvcCards(studentId: string) {
  qBackfillCvcCardsForStudent.run(studentId, Date.now());
}

function rollSession(studentId: string) {
  qInsertSession.run(studentId, todayStr());
  qInsertSightSession.run(studentId, todayStr());
  qInsertAreaSession.run(studentId, "cvc", todayStr());
  qInsertAreaSession.run(studentId, "cvce", todayStr());
  qInsertAreaSession.run(studentId, "book", todayStr());
}

/* Read / write the daily session row for any area, transparently routing to
 * the right table. Returns a plain row (a fresh zeroed object if missing). */
function getSessionRow(studentId: string, area: string) {
  const row =
    area === "sight" ? qSightSession.get(studentId, todayStr())
    : WORD_KINDS.has(area) ? qAreaSession.get(studentId, area, todayStr())
    : qSession.get(studentId, todayStr());
  return (row as any) || { date: todayStr(), reviewed: 0, correct: 0, streak: 0, new_introduced: 0 };
}
function writeSessionRow(studentId: string, area: string, r: any, date = todayStr()) {
  if (area === "sight") {
    qUpdateSightSession.run(r.reviewed, r.correct, r.streak, r.new_introduced ?? 0, studentId, date);
  } else if (WORD_KINDS.has(area)) {
    qUpdateAreaSession.run(r.reviewed, r.correct, r.streak, r.new_introduced ?? 0, studentId, area, date);
  } else {
    qUpdateSession.run(r.reviewed, r.correct, r.streak, r.new_introduced ?? 0, studentId, date);
  }
}

function cardRowToJs(r: any) {
  return {
    letter: r.letter,
    reps: r.reps,
    ease: r.ease,
    intervalDays: r.interval_days,
    dueAt: r.due_at,
    lapses: r.lapses,
    totalSeen: r.total_seen,
    totalCorrect: r.total_correct,
    lastSeenAt: r.last_seen_at,
  };
}

function phonicsRowToJs(r: any) {
  return {
    id: r.id,
    text: r.text,
    example: r.example,
    card: {
      reps: r.reps,
      ease: r.ease,
      intervalDays: r.interval_days,
      dueAt: r.due_at,
      lapses: r.lapses,
      totalSeen: r.total_seen,
      totalCorrect: r.total_correct,
      lastSeenAt: r.last_seen_at,
    },
  };
}

function sightWordRowToJs(r: any) {
  return {
    id: r.id,
    text: r.text,
    group: r.group_no,
    position: r.position,
    card: {
      reps: r.reps,
      ease: r.ease,
      intervalDays: r.interval_days,
      dueAt: r.due_at,
      lapses: r.lapses,
      totalSeen: r.total_seen,
      totalCorrect: r.total_correct,
      lastSeenAt: r.last_seen_at,
    },
  };
}

function cvcWordRowToJs(r: any) {
  return {
    id: r.id,
    kind: r.kind,
    onset: r.onset,
    rime: r.rime,
    text: r.onset + r.rime,
    card: {
      reps: r.reps,
      ease: r.ease,
      intervalDays: r.interval_days,
      dueAt: r.due_at,
      lapses: r.lapses,
      totalSeen: r.total_seen,
      totalCorrect: r.total_correct,
      lastSeenAt: r.last_seen_at,
    },
  };
}

const sessionRowToJs = (s: any) => ({
  date: s.date,
  reviewed: s.reviewed,
  correct: s.correct,
  streak: s.streak,
  newIntroduced: s.new_introduced ?? 0,
});

function getStudent(id: string) {
  const stu = qStudent.get(id) as any;
  if (!stu) return null;
  ensureLetterCards(id, stu.case_mode);
  ensurePhonicsCards(id);
  ensureSightWordCards(id);
  ensureCvcCards(id);
  rollSession(id);
  const cards: Record<string, any> = {};
  for (const r of qCardsFor.all(id) as any[]) cards[r.letter] = cardRowToJs(r);
  const phonics = (qPhonicsCardsFor.all(id) as any[]).map(phonicsRowToJs);
  const sightWords = (qSightCardsFor.all(id) as any[]).map(sightWordRowToJs);
  const cvcWords = (qCvcCardsForKind.all(id, "cvc") as any[]).map(cvcWordRowToJs);
  const cvceWords = (qCvcCardsForKind.all(id, "cvce") as any[]).map(cvcWordRowToJs);
  const bookWords = (qCvcCardsForKind.all(id, "book") as any[]).map(cvcWordRowToJs);
  const sess = (qSession.get(id, todayStr()) as any)
    || { date: todayStr(), reviewed: 0, correct: 0, streak: 0 };
  const sightSess = (qSightSession.get(id, todayStr()) as any)
    || { date: todayStr(), reviewed: 0, correct: 0, streak: 0, new_introduced: 0 };
  const recent = (qRecentSessions.all(id, windowStartStr(7)) as any[]).map((s: any) => ({
    date: s.date,
    reviewed: s.reviewed,
    correct: s.correct,
    streak: s.streak,
    newIntroduced: s.new_introduced ?? 0,
  }));
  const recentSight = (qRecentSightSessions.all(id, windowStartStr(7)) as any[]).map(sessionRowToJs);
  const cvcSess = getSessionRow(id, "cvc");
  const cvceSess = getSessionRow(id, "cvce");
  const bookSess = getSessionRow(id, "book");
  const recentCvc = (qRecentAreaSessions.all(id, "cvc", windowStartStr(7)) as any[]).map(sessionRowToJs);
  const recentCvce = (qRecentAreaSessions.all(id, "cvce", windowStartStr(7)) as any[]).map(sessionRowToJs);
  const recentBook = (qRecentAreaSessions.all(id, "book", windowStartStr(7)) as any[]).map(sessionRowToJs);
  return {
    id: stu.id,
    name: stu.name,
    classId: stu.class_id ?? null,
    createdAt: stu.created_at,
    settings: {
      case: stu.case_mode,
      mode: stu.mode || "alphabet",
      newPerDay: stu.new_per_day ?? 10,
      sessionSize: stu.session_size ?? 10,
    },
    session: {
      date: sess.date,
      reviewed: sess.reviewed,
      correct: sess.correct,
      streak: sess.streak,
      newIntroduced: sess.new_introduced ?? 0,
    },
    sightSession: {
      date: sightSess.date,
      reviewed: sightSess.reviewed,
      correct: sightSess.correct,
      streak: sightSess.streak,
      newIntroduced: sightSess.new_introduced ?? 0,
    },
    cvcSession: sessionRowToJs(cvcSess),
    cvceSession: sessionRowToJs(cvceSess),
    bookSession: sessionRowToJs(bookSess),
    cards,
    phonics,
    sightWords,
    cvcWords,
    cvceWords,
    bookWords,
    recentSessions: recent,
    recentSightSessions: recentSight,
    recentCvcSessions: recentCvc,
    recentCvceSessions: recentCvce,
    recentBookSessions: recentBook,
  };
}

/* The app is used Monday–Friday. A due-date that lands on Sat/Sun can't be
 * reviewed until Monday, so snap it to Monday morning: Monday then reads as a
 * clean "due today" instead of "overdue", and backlog counts stay honest. This
 * only moves the timestamp off the weekend — it never changes interval length. */
function rollOffWeekend(ts: number): number {
  const d = new Date(ts);
  const day = d.getDay(); // 0 Sun … 6 Sat
  if (day === 6) d.setDate(d.getDate() + 2);       // Sat → Mon
  else if (day === 0) d.setDate(d.getDate() + 1);  // Sun → Mon
  else return ts;
  d.setHours(6, 0, 0, 0); // Monday, 6am local — ready before the school day starts
  return d.getTime();
}

/* SM-2 lite */
function grade(card: any, correct: boolean) {
  const t = Date.now();
  card.totalSeen += 1;
  card.lastSeenAt = t;
  if (correct) {
    card.totalCorrect += 1;
    card.reps += 1;
    if (card.reps === 1)       card.intervalDays = 1;
    else if (card.reps === 2)  card.intervalDays = 3;
    else                       card.intervalDays = Math.max(1, Math.round(card.intervalDays * card.ease));
    card.ease = Math.min(2.8, card.ease + 0.05);
  } else {
    card.reps = 0;
    card.lapses += 1;
    card.intervalDays = 0;
    card.ease = Math.max(1.3, card.ease - 0.2);
  }
  /* Relearn (interval 0) stays a 60s intraday loop; real day-based due-dates
   * skip the weekend so they surface on the next school day. */
  card.dueAt = card.intervalDays === 0
    ? t + 60_000
    : rollOffWeekend(t + card.intervalDays * DAY_MS);
}

/* ---------- HTTP ---------- */
const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
const notFound = () => new Response("Not found", { status: 404 });

async function handleApi(req: Request, url: URL): Promise<Response> {
  const p = url.pathname;
  const m = req.method;

  /* ---- Students ---- */
  if (p === "/api/students" && m === "GET") {
    return json(qStudents.all());
  }

  /* Teacher view: per-student progress for today. "Done" means the student
   * practiced today AND today's session is cleared — no session cards left
   * due (the same condition that gates the in-app done celebration). The
   * full backlog is reported separately as `backlogDue`. */
  if (p === "/api/roster" && m === "GET") {
    const list = qStudents.all() as any[];
    const now = Date.now();
    const todayStart = Date.parse(todayStr() + "T00:00:00Z");
    const result = list.map((s: any) => {
      const stu = getStudent(s.id);
      if (!stu) return null;
      const mode = stu.settings.mode;
      const caseMode = stu.settings.case;
      const cards: any[] = [];
      if (mode === "alphabet" || mode === "mixed") {
        for (const l of lettersFor(caseMode)) {
          const c = stu.cards[l];
          if (c) cards.push(c);
        }
      }
      if (mode === "phonics" || mode === "mixed") {
        for (const p of stu.phonics || []) cards.push(p.card);
      }
      if (mode === "sight") {
        for (const w of stu.sightWords || []) cards.push(w.card);
      }
      if (mode === "cvc") {
        for (const w of stu.cvcWords || []) cards.push(w.card);
      }
      if (mode === "cvce") {
        for (const w of stu.cvceWords || []) cards.push(w.card);
      }
      if (mode === "book") {
        for (const w of stu.bookWords || []) cards.push(w.card);
      }
      const cap = stu.settings.sessionSize ?? 10;
      const dueCards = cards.filter((c: any) => c.dueAt <= now);
      const touchedToday = cards.filter((c: any) => (c.lastSeenAt || 0) >= todayStart);
      const seenToday = touchedToday.length;
      const touchedDue = dueCards.filter((c: any) => (c.lastSeenAt || 0) >= todayStart).length;
      const budget = Math.max(0, cap - seenToday);
      /* Session-relevant count: today's leftovers plus a capped slice of the
       * untouched backlog — the same shape sessionQueue() uses on the client. */
      const sessionDue = touchedDue + Math.min(budget, dueCards.length - touchedDue);
      /* Mid-session if a card touched today is still due or in its 60s relearn
       * loop; guards against a "done" flash in the gap after a missed card. */
      const pendingTouched = touchedToday.some((c: any) => c.dueAt <= now || c.intervalDays === 0);
      const sess = mode === "sight" ? stu.sightSession
        : mode === "cvc" ? stu.cvcSession
        : mode === "cvce" ? stu.cvceSession
        : mode === "book" ? stu.bookSession
        : stu.session;
      return {
        id: s.id,
        name: s.name,
        classId: s.classId ?? null,
        mode,
        caseMode,
        total: cards.length,
        dueNow: sessionDue,
        backlogDue: dueCards.length,
        seenToday,
        reviewed: sess.reviewed,
        correct: sess.correct,
        doneToday: sess.reviewed > 0 && sessionDue === 0 && !pendingTouched,
      };
    }).filter(Boolean);
    return json(result);
  }

  if (p === "/api/students" && m === "POST") {
    const body = (await req.json()) as { name?: string; classId?: string | null };
    const name = (body.name || "").trim() || "Student";
    const id = uid("stu_");
    qInsertStudent.run(id, name, Date.now(), "upper", "alphabet");
    if (body.classId && qClass.get(body.classId)) qSetStudentClass.run(body.classId, id);
    ensureLetterCards(id, "upper");
    ensurePhonicsCards(id);
    ensureSightWordCards(id);
    ensureCvcCards(id);
    return json(getStudent(id), 201);
  }

  const mm = p.match(/^\/api\/students\/([^/]+)(?:\/(.+))?$/);
  if (mm) {
    const id = mm[1];
    const action = mm[2];

    if (!action && m === "GET") {
      const stu = getStudent(id);
      return stu ? json(stu) : notFound();
    }

    if (!action && m === "PATCH") {
      const body = (await req.json()) as { name?: string; case?: string; mode?: string; newPerDay?: number; sessionSize?: number; classId?: string | null };
      const stu = qStudent.get(id) as any;
      if (!stu) return notFound();
      if (body.name !== undefined && body.name.trim()) {
        db.query("UPDATE students SET name = ? WHERE id = ?").run(body.name.trim(), id);
      }
      if (body.case && VALID_CASES.has(body.case)) {
        db.query("UPDATE students SET case_mode = ? WHERE id = ?").run(body.case, id);
        ensureLetterCards(id, body.case);
      }
      if (body.mode && VALID_MODES.has(body.mode)) {
        db.query("UPDATE students SET mode = ? WHERE id = ?").run(body.mode, id);
      }
      if (body.newPerDay !== undefined) {
        const n = Math.max(1, Math.min(52, Math.floor(Number(body.newPerDay) || 10)));
        db.query("UPDATE students SET new_per_day = ? WHERE id = ?").run(n, id);
      }
      if (body.sessionSize !== undefined) {
        const n = Math.max(1, Math.min(100, Math.floor(Number(body.sessionSize) || 10)));
        db.query("UPDATE students SET session_size = ? WHERE id = ?").run(n, id);
      }
      if (body.classId !== undefined) {
        /* "" / null clears the class; a real id assigns only if it exists. */
        if (body.classId === null || body.classId === "") qSetStudentClass.run(null, id);
        else if (qClass.get(body.classId)) qSetStudentClass.run(body.classId, id);
      }
      return json(getStudent(id));
    }

    if (!action && m === "DELETE") {
      db.query("DELETE FROM students WHERE id = ?").run(id);
      undoSnaps.delete(id);
      return new Response(null, { status: 204 });
    }

    if (action === "answer" && m === "POST") {
      const body = (await req.json()) as { type: "letter" | "phonics" | "sight" | "cvc" | "cvce" | "book"; key: string; correct: boolean };
      const stu = qStudent.get(id) as any;
      if (!stu) return notFound();
      rollSession(id);
      /* Each card type belongs to an area (main / sight / cvc / cvce / book) that owns
       * its own daily session row — keeps streaks and the new-per-day cap
       * isolated per skill. Pick the row + the right card-update up front. */
      const area = areaOf(body.type);
      const sessRow = getSessionRow(id, area);

      let row: any;
      let applyUpdate: (card: any) => void;
      const writeCard = (q: any) => (card: any) => q.run(
        card.reps, card.ease, card.intervalDays, card.dueAt,
        card.lapses, card.totalSeen, card.totalCorrect, card.lastSeenAt,
        id, body.key
      );
      if (body.type === "letter") {
        row = qCard.get(id, body.key);
        applyUpdate = writeCard(qUpdateCard);
      } else if (body.type === "phonics") {
        row = qPhonicsCard.get(id, body.key);
        applyUpdate = writeCard(qUpdatePhonicsCard);
      } else if (body.type === "sight") {
        row = qSightCard.get(id, body.key);
        applyUpdate = writeCard(qUpdateSightCard);
      } else if (WORD_KINDS.has(body.type)) {
        row = qCvcCard.get(id, body.key);
        applyUpdate = writeCard(qUpdateCvcCard);
      } else {
        return json({ error: "unknown type" }, 400);
      }
      if (!row) return json({ error: "card not found" }, 404);

      const wasNew = row.total_seen === 0;
      undoSnaps.set(id, { type: body.type, key: body.key, card: { ...row }, session: { ...sessRow }, area });
      const card = {
        reps: row.reps,
        ease: row.ease,
        intervalDays: row.interval_days,
        dueAt: row.due_at,
        lapses: row.lapses,
        totalSeen: row.total_seen,
        totalCorrect: row.total_correct,
        lastSeenAt: row.last_seen_at,
      };
      grade(card, !!body.correct);
      applyUpdate(card);

      writeSessionRow(id, area, {
        reviewed: sessRow.reviewed + 1,
        correct: sessRow.correct + (body.correct ? 1 : 0),
        streak: body.correct ? sessRow.streak + 1 : 0,
        new_introduced: (sessRow.new_introduced ?? 0) + (wasNew ? 1 : 0),
      });

      return json(getStudent(id));
    }

    if (action === "undo" && m === "POST") {
      const snap = undoSnaps.get(id);
      if (!snap) return json({ error: "nothing to undo" }, 400);
      const c = snap.card;
      const restore = (q: any) => q.run(
        c.reps, c.ease, c.interval_days, c.due_at,
        c.lapses, c.total_seen, c.total_correct, c.last_seen_at,
        id, snap.key
      );
      if (snap.type === "letter") restore(qUpdateCard);
      else if (snap.type === "phonics") restore(qUpdatePhonicsCard);
      else if (snap.type === "sight") restore(qUpdateSightCard);
      else restore(qUpdateCvcCard); // cvc | cvce | book
      writeSessionRow(id, snap.area, snap.session, snap.session.date);
      undoSnaps.delete(id);
      return json(getStudent(id));
    }

    if (action === "reset" && m === "POST") {
      const stu = qStudent.get(id) as any;
      if (!stu) return notFound();
      db.query("DELETE FROM cards WHERE student_id = ?").run(id);
      db.query("DELETE FROM phonics_cards WHERE student_id = ?").run(id);
      db.query("DELETE FROM sight_word_cards WHERE student_id = ?").run(id);
      db.query("DELETE FROM cvc_cards WHERE student_id = ?").run(id);
      db.query("DELETE FROM sessions WHERE student_id = ?").run(id);
      db.query("DELETE FROM sight_word_sessions WHERE student_id = ?").run(id);
      db.query("DELETE FROM area_sessions WHERE student_id = ?").run(id);
      ensureLetterCards(id, stu.case_mode);
      ensurePhonicsCards(id);
      ensureSightWordCards(id);
      ensureCvcCards(id);
      undoSnaps.delete(id);
      return json(getStudent(id));
    }

    if (action === "place" && m === "POST") {
      /* Placement check: the teacher marks the cards a student already knows.
       * Each is seeded like a child who's answered correctly twice — interval 3
       * ('young'), one confirmation review a few school-days out, then it
       * graduates to mature on the next correct. Placement is not practice, so
       * no session counters move. Unmarked cards are left untouched (new). */
      const body = (await req.json()) as { type: string; keys: string[] };
      const stu = qStudent.get(id) as any;
      if (!stu) return notFound();
      let getQ: any, updQ: any;
      if (body.type === "letter")       { getQ = qCard;        updQ = qUpdateCard; }
      else if (body.type === "phonics") { getQ = qPhonicsCard; updQ = qUpdatePhonicsCard; }
      else if (body.type === "sight")   { getQ = qSightCard;   updQ = qUpdateSightCard; }
      else if (WORD_KINDS.has(body.type)) { getQ = qCvcCard; updQ = qUpdateCvcCard; }
      else return json({ error: "unknown type" }, 400);

      const keys = Array.isArray(body.keys) ? body.keys : [];
      const now = Date.now();
      const dueAt = rollOffWeekend(now + 3 * DAY_MS);
      for (const key of keys) {
        const row = getQ.get(id, key) as any;
        if (!row) continue;
        updQ.run(
          2,                               // reps (as if two correct answers)
          Math.max(row.ease ?? 2.5, 2.5),  // ease — never lower an existing higher ease
          3,                               // interval_days → 'young'
          dueAt,
          row.lapses,
          Math.max(row.total_seen, 1),
          Math.max(row.total_correct, 1),
          now,
          id, key
        );
      }
      return json(getStudent(id));
    }
  }

  /* ---- Classes ---- */
  if (p === "/api/classes" && m === "GET") {
    return json(qClassesAll.all());
  }
  if (p === "/api/classes" && m === "POST") {
    const body = (await req.json()) as { name?: string };
    const name = (body.name || "").trim();
    if (!name) return json({ error: "name required" }, 400);
    const id = uid("cls_");
    qInsertClass.run(id, name, Date.now());
    return json(qClass.get(id), 201);
  }
  const cm = p.match(/^\/api\/classes\/([^/]+)$/);
  if (cm) {
    const id = cm[1];
    if (m === "PATCH") {
      const body = (await req.json()) as { name?: string };
      const existing = qClass.get(id) as any;
      if (!existing) return notFound();
      const name = body.name !== undefined ? body.name.trim() : existing.name;
      if (!name) return json({ error: "name required" }, 400);
      qUpdateClass.run(name, id);
      return json(qClass.get(id));
    }
    if (m === "DELETE") {
      /* Students survive a class delete — they just become unassigned. */
      qUnassignClassStudents.run(id);
      qDeleteClass.run(id);
      return new Response(null, { status: 204 });
    }
  }

  /* ---- Phonics (global) ---- */
  if (p === "/api/phonics" && m === "GET") {
    return json(qPhonicsAll.all());
  }
  if (p === "/api/phonics" && m === "POST") {
    const body = (await req.json()) as { text?: string; example?: string };
    const text = (body.text || "").trim();
    if (!text) return json({ error: "text required" }, 400);
    const example = (body.example || "").trim() || null;
    const id = uid("ph_");
    qInsertPhonics.run(id, text, example, Date.now());
    /* every existing student now needs a card row for this sound */
    qBackfillPhonicsCardsForPhonics.run(id, Date.now());
    return json(qPhonics.get(id), 201);
  }
  const pm = p.match(/^\/api\/phonics\/([^/]+)$/);
  if (pm) {
    const id = pm[1];
    if (m === "PATCH") {
      const body = (await req.json()) as { text?: string; example?: string };
      const existing = qPhonics.get(id) as any;
      if (!existing) return notFound();
      const text = body.text !== undefined ? body.text.trim() : existing.text;
      if (!text) return json({ error: "text required" }, 400);
      const example = body.example !== undefined
        ? (body.example.trim() || null)
        : existing.example;
      qUpdatePhonics.run(text, example, id);
      return json(qPhonics.get(id));
    }
    if (m === "DELETE") {
      qDeletePhonics.run(id);
      return new Response(null, { status: 204 });
    }
  }

  /* ---- CVC / CVCe / book words (global) ---- */
  if (p === "/api/cvc" && m === "GET") {
    return json(qCvcWordsAll.all());
  }
  if (p === "/api/cvc" && m === "POST") {
    const body = (await req.json()) as { kind?: string; onset?: string; rime?: string };
    const kind = (body.kind || "").trim();
    if (!WORD_KINDS.has(kind)) return json({ error: "kind must be cvc, cvce or book" }, 400);
    const onset = (body.onset || "").trim();
    const rime = (body.rime || "").trim();
    if (!onset || !rime) return json({ error: "onset and rime required" }, 400);
    const id = uid("cvc_");
    qInsertCvcWord.run(id, kind, onset, rime, Date.now());
    /* every existing student needs a card row for this new word */
    qBackfillCvcCardsForWord.run(id, Date.now());
    return json(qCvcWord.get(id), 201);
  }
  const cvm = p.match(/^\/api\/cvc\/([^/]+)$/);
  if (cvm) {
    const id = cvm[1];
    if (m === "PATCH") {
      const body = (await req.json()) as { onset?: string; rime?: string };
      const existing = qCvcWord.get(id) as any;
      if (!existing) return notFound();
      const onset = body.onset !== undefined ? body.onset.trim() : existing.onset;
      const rime = body.rime !== undefined ? body.rime.trim() : existing.rime;
      if (!onset || !rime) return json({ error: "onset and rime required" }, 400);
      qUpdateCvcWord.run(onset, rime, id);
      return json(qCvcWord.get(id));
    }
    if (m === "DELETE") {
      qDeleteCvcWord.run(id);
      return new Response(null, { status: 204 });
    }
  }

  return notFound();
}

const indexFile = Bun.file(path.join(import.meta.dir, "index.html"));

// Only bind the port when run directly (`bun server.ts`). When imported — e.g.
// by the test suite — we skip the listener and just expose the handlers below.
if (import.meta.main) {
  const server = Bun.serve({
    hostname: "0.0.0.0",
    port: Number(process.env.PORT) || 4321,
    async fetch(req) {
      const url = new URL(req.url);
      const p = url.pathname;
      if (p === "/" || p === "/index.html") return new Response(indexFile);
      if (p.startsWith("/api/")) return handleApi(req, url);
      return notFound();
    },
  });

  console.log(`Alphabet Time → http://localhost:${server.port}`);
}

// Exported for the test suite (server.test.ts). The HTTP handler operates on
// the module-level `db`, so tests set DB_PATH to an isolated database first.
export { grade, areaOf, handleApi, getStudent, rollOffWeekend };
