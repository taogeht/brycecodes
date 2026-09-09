/**
 * Test suite for the Alphabet Time server.
 *
 * Run:  bun test
 *
 * DB_PATH is set to an in-memory database *before* importing server.ts, so the
 * suite never touches the real ./alphabet.db. server.ts only binds its HTTP port
 * under `import.meta.main`, so importing it here is side-effect-free apart from
 * creating the schema in the throwaway in-memory DB. We drive the real request
 * handler (`handleApi`) directly — no port, no fetch.
 */
import { test, expect, describe } from "bun:test";

process.env.DB_PATH = ":memory:";
const { grade, areaOf, handleApi, rollOffWeekend } = await import("./server.ts");

const DAY_MS = 86_400_000;

/* Call the real API handler with a constructed Request. */
async function api(method: string, path: string, body?: unknown) {
  const req = new Request("http://test" + path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await handleApi(req, new URL(req.url));
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function newStudent(name = "Tester") {
  const { status, body } = await api("POST", "/api/students", { name });
  expect(status).toBe(201);
  return body;
}

/* A fresh SRS card as grade() expects it (camelCase, ease 2.5). */
function freshCard() {
  return {
    reps: 0, ease: 2.5, intervalDays: 0, dueAt: 0,
    lapses: 0, totalSeen: 0, totalCorrect: 0, lastSeenAt: 0,
  };
}

describe("grade — SM-2 lite scheduler", () => {
  test("first correct: reps→1, interval 1 day, due in 1 day", () => {
    const c = freshCard();
    grade(c, true);
    expect(c.reps).toBe(1);
    expect(c.intervalDays).toBe(1);
    expect(c.totalSeen).toBe(1);
    expect(c.totalCorrect).toBe(1);
    expect(c.ease).toBeCloseTo(2.55, 5);
    // Interval is 1 day, but the due-date is nudged off weekends (Mon–Fri app),
    // so it's at least a day out and never lands on Sat/Sun.
    expect(c.dueAt - c.lastSeenAt).toBeGreaterThanOrEqual(1 * DAY_MS);
    expect([1, 2, 3, 4, 5]).toContain(new Date(c.dueAt).getDay());
  });

  test("interval ladder: 1 → 3 → round(prev * ease)", () => {
    const c = freshCard();
    grade(c, true);                       // reps 1
    expect(c.intervalDays).toBe(1);
    grade(c, true);                       // reps 2
    expect(c.intervalDays).toBe(3);
    grade(c, true);                       // reps 3: round(3 * 2.60) = 8
    expect(c.reps).toBe(3);
    expect(c.intervalDays).toBe(8);
  });

  test("ease is capped at 2.8 no matter how many correct answers", () => {
    const c = freshCard();
    for (let i = 0; i < 50; i++) grade(c, true);
    expect(c.ease).toBeLessThanOrEqual(2.8);
    expect(c.ease).toBeCloseTo(2.8, 5);
  });

  test("incorrect: reps→0, lapse++, interval 0, ease −0.2, re-due in 60s", () => {
    const c = freshCard();
    grade(c, true);                       // get some reps/interval first
    grade(c, true);
    const easeBefore = c.ease;
    grade(c, false);
    expect(c.reps).toBe(0);
    expect(c.lapses).toBe(1);
    expect(c.intervalDays).toBe(0);
    expect(c.ease).toBeCloseTo(easeBefore - 0.2, 5);
    expect(c.dueAt - c.lastSeenAt).toBe(60_000);   // 60s relearn loop
  });

  test("ease floors at 1.3 no matter how many lapses", () => {
    const c = freshCard();
    for (let i = 0; i < 50; i++) grade(c, false);
    expect(c.ease).toBeGreaterThanOrEqual(1.3);
    expect(c.ease).toBeCloseTo(1.3, 5);
  });
});

describe("rollOffWeekend — keep due-dates on school days", () => {
  const base = new Date(2026, 5, 1, 12, 0, 0).getTime(); // swept across two weeks

  test("weekday timestamps pass through unchanged", () => {
    for (let i = 0; i < 14; i++) {
      const ts = base + i * DAY_MS;
      const day = new Date(ts).getDay();
      if (day >= 1 && day <= 5) expect(rollOffWeekend(ts)).toBe(ts);
    }
  });

  test("Saturday/Sunday roll forward to a Monday", () => {
    let sawWeekend = false;
    for (let i = 0; i < 14; i++) {
      const ts = base + i * DAY_MS;
      const day = new Date(ts).getDay();
      if (day === 0 || day === 6) {
        sawWeekend = true;
        const rolled = rollOffWeekend(ts);
        expect(new Date(rolled).getDay()).toBe(1);   // Monday
        expect(rolled).toBeGreaterThanOrEqual(ts);
      }
    }
    expect(sawWeekend).toBe(true);
  });

  test("grade never schedules a review onto a weekend", () => {
    const c = freshCard();
    for (let i = 0; i < 12; i++) {
      grade(c, true);
      const day = new Date(c.dueAt).getDay();
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(5);
    }
  });
});

describe("areaOf — card type → practice area", () => {
  test("letters and phonics share the 'main' area", () => {
    expect(areaOf("letter")).toBe("main");
    expect(areaOf("phonics")).toBe("main");
  });
  test("sight / cvc / cvce / book each stand alone", () => {
    expect(areaOf("sight")).toBe("sight");
    expect(areaOf("cvc")).toBe("cvc");
    expect(areaOf("cvce")).toBe("cvce");
    expect(areaOf("book")).toBe("book");
  });
  test("unknown types fall back to 'main'", () => {
    expect(areaOf("whatever")).toBe("main");
  });
});

describe("student lifecycle + letter answers", () => {
  test("a new student starts in alphabet mode with a full A–Z card set", async () => {
    const stu = await newStudent();
    expect(stu.settings.mode).toBe("alphabet");
    expect(stu.settings.case).toBe("upper");
    expect(Object.keys(stu.cards)).toContain("A");
    expect(stu.cards.A.reps).toBe(0);
    expect(stu.session.reviewed).toBe(0);
  });

  test("answering a letter schedules the card and bumps the main session", async () => {
    const stu = await newStudent();
    const r = await api("POST", `/api/students/${stu.id}/answer`, {
      type: "letter", key: "A", correct: true,
    });
    expect(r.status).toBe(200);
    expect(r.body.cards.A.reps).toBe(1);
    expect(r.body.cards.A.intervalDays).toBe(1);
    expect(r.body.session.reviewed).toBe(1);
    expect(r.body.session.correct).toBe(1);
    expect(r.body.session.streak).toBe(1);
    expect(r.body.session.newIntroduced).toBe(1);  // first sighting of a new card
  });

  test("a wrong answer resets reps, records a lapse, and breaks the streak", async () => {
    const stu = await newStudent();
    await api("POST", `/api/students/${stu.id}/answer`, { type: "letter", key: "B", correct: true });
    const r = await api("POST", `/api/students/${stu.id}/answer`, { type: "letter", key: "B", correct: false });
    expect(r.body.cards.B.reps).toBe(0);
    expect(r.body.cards.B.lapses).toBe(1);
    expect(r.body.session.reviewed).toBe(2);
    expect(r.body.session.correct).toBe(1);
    expect(r.body.session.streak).toBe(0);
  });

  test("undo restores the card and session to the prior answer's snapshot", async () => {
    const stu = await newStudent();
    await api("POST", `/api/students/${stu.id}/answer`, { type: "letter", key: "C", correct: true });  // reps 1
    await api("POST", `/api/students/${stu.id}/answer`, { type: "letter", key: "C", correct: false }); // reps 0
    const r = await api("POST", `/api/students/${stu.id}/undo`);
    expect(r.status).toBe(200);
    expect(r.body.cards.C.reps).toBe(1);        // back to the post-first-answer state
    expect(r.body.cards.C.lapses).toBe(0);
    expect(r.body.session.reviewed).toBe(1);
    expect(r.body.session.streak).toBe(1);
  });

  test("undo with nothing to undo is a 400", async () => {
    const stu = await newStudent();
    const r = await api("POST", `/api/students/${stu.id}/undo`);
    expect(r.status).toBe(400);
  });
});

describe("per-area session isolation", () => {
  test("answering a CVC card touches the cvc session, not main", async () => {
    const stu = await newStudent();
    // Create a global CVC word; it backfills a card for every student.
    const made = await api("POST", "/api/cvc", { kind: "cvc", onset: "c", rime: "at" });
    expect(made.status).toBe(201);

    // Re-read the student to get the backfilled card's id (the answer key).
    const before = await api("GET", `/api/students/${stu.id}`);
    const word = before.body.cvcWords.find((w: any) => w.text === "cat");
    expect(word).toBeTruthy();

    const r = await api("POST", `/api/students/${stu.id}/answer`, {
      type: "cvc", key: word.id, correct: true,
    });
    expect(r.status).toBe(200);
    expect(r.body.cvcSession.reviewed).toBe(1);   // cvc area moved
    expect(r.body.cvcSession.correct).toBe(1);
    expect(r.body.session.reviewed).toBe(0);       // main area untouched
    expect(r.body.cvceSession.reviewed).toBe(0);   // cvce area untouched
  });
});

describe("placement — seed known cards", () => {
  test("placing letters marks them young/started, leaves others untouched", async () => {
    const stu = await newStudent();
    const r = await api("POST", `/api/students/${stu.id}/place`, { type: "letter", keys: ["A", "B", "C"] });
    expect(r.status).toBe(200);
    // Placed cards seed as 'young': interval 3, reps 2, at least one seen/correct.
    expect(r.body.cards.A.intervalDays).toBe(3);
    expect(r.body.cards.A.reps).toBe(2);
    expect(r.body.cards.A.totalSeen).toBeGreaterThanOrEqual(1);
    expect(r.body.cards.A.totalCorrect).toBeGreaterThanOrEqual(1);
    // Due a few days out, never on a weekend.
    expect([1, 2, 3, 4, 5]).toContain(new Date(r.body.cards.A.dueAt).getDay());
    // An unmarked letter stays brand-new.
    expect(r.body.cards.Z.totalSeen).toBe(0);
    expect(r.body.cards.Z.intervalDays).toBe(0);
    // Placement is not practice — the session is untouched.
    expect(r.body.session.reviewed).toBe(0);
  });

  test("unknown type is rejected", async () => {
    const stu = await newStudent();
    const r = await api("POST", `/api/students/${stu.id}/place`, { type: "bogus", keys: ["A"] });
    expect(r.status).toBe(400);
  });
});

describe("reset", () => {
  test("reset wipes progress across every card kind and session", async () => {
    const stu = await newStudent();
    await api("POST", `/api/students/${stu.id}/answer`, { type: "letter", key: "D", correct: true });
    const r = await api("POST", `/api/students/${stu.id}/reset`);
    expect(r.status).toBe(200);
    expect(r.body.cards.D.reps).toBe(0);
    expect(r.body.cards.D.totalSeen).toBe(0);
    expect(r.body.session.reviewed).toBe(0);
    expect(r.body.cvcSession.reviewed).toBe(0);
  });
});

describe("book words — the level reader's new sounds", () => {
  test("a book word backfills a card and keeps its own list", async () => {
    const stu = await newStudent("Booker");
    const made = await api("POST", "/api/cvc", { kind: "book", onset: "sh", rime: "ip" });
    expect(made.status).toBe(201);
    expect(made.body.kind).toBe("book");

    const snap = await api("GET", `/api/students/${stu.id}`);
    const word = snap.body.bookWords.find((w: any) => w.text === "ship");
    expect(word).toBeTruthy();
    // The digraph onset stays one chunk, so the flash reveals "sh" then "ip".
    expect(word.onset).toBe("sh");
    expect(word.rime).toBe("ip");
    // A book word must not leak into the CVC / CVCe decks.
    expect(snap.body.cvcWords.some((w: any) => w.text === "ship")).toBe(false);
    expect(snap.body.cvceWords.some((w: any) => w.text === "ship")).toBe(false);
  });

  test("answering a book card touches only the book session", async () => {
    const stu = await newStudent("Reader");
    await api("POST", "/api/cvc", { kind: "book", onset: "ch", rime: "op" });
    const snap = await api("GET", `/api/students/${stu.id}`);
    const word = snap.body.bookWords.find((w: any) => w.text === "chop");

    const r = await api("POST", `/api/students/${stu.id}/answer`, {
      type: "book", key: word.id, correct: true,
    });
    expect(r.status).toBe(200);
    expect(r.body.bookSession.reviewed).toBe(1);
    expect(r.body.bookSession.correct).toBe(1);
    expect(r.body.session.reviewed).toBe(0);      // main untouched
    expect(r.body.cvcSession.reviewed).toBe(0);   // cvc untouched
    expect(r.body.cvceSession.reviewed).toBe(0);  // cvce untouched
  });

  test("undo restores a book card and its session row", async () => {
    const stu = await newStudent("Undoer");
    await api("POST", "/api/cvc", { kind: "book", onset: "tr", rime: "ain" });
    const snap = await api("GET", `/api/students/${stu.id}`);
    const word = snap.body.bookWords.find((w: any) => w.text === "train");

    await api("POST", `/api/students/${stu.id}/answer`, { type: "book", key: word.id, correct: true });
    const undone = await api("POST", `/api/students/${stu.id}/undo`);
    expect(undone.status).toBe(200);
    const back = undone.body.bookWords.find((w: any) => w.id === word.id);
    expect(back.card.reps).toBe(0);
    expect(back.card.totalSeen).toBe(0);
    expect(undone.body.bookSession.reviewed).toBe(0);
  });

  test("book is a selectable mode and the roster counts its words", async () => {
    const stu = await newStudent("Switcher");
    const patched = await api("PATCH", `/api/students/${stu.id}`, { mode: "book" });
    expect(patched.status).toBe(200);
    expect(patched.body.settings.mode).toBe("book");

    const bookCount = patched.body.bookWords.length;
    expect(bookCount).toBeGreaterThan(0);

    const roster = await api("GET", "/api/roster");
    const row = roster.body.find((r: any) => r.id === stu.id);
    expect(row.mode).toBe("book");
    expect(row.total).toBe(bookCount);
  });

  test("placement seeds book words without touching the session", async () => {
    const stu = await newStudent("Placer");
    const snap = await api("GET", `/api/students/${stu.id}`);
    const word = snap.body.bookWords[0];
    const r = await api("POST", `/api/students/${stu.id}/place`, { type: "book", keys: [word.id] });
    expect(r.status).toBe(200);
    const placed = r.body.bookWords.find((w: any) => w.id === word.id);
    expect(placed.card.intervalDays).toBe(3);
    expect(placed.card.reps).toBe(2);
    expect(r.body.bookSession.reviewed).toBe(0);
  });

  test("reset clears book progress too", async () => {
    const stu = await newStudent("Resetter");
    const snap = await api("GET", `/api/students/${stu.id}`);
    const word = snap.body.bookWords[0];
    await api("POST", `/api/students/${stu.id}/answer`, { type: "book", key: word.id, correct: true });
    const r = await api("POST", `/api/students/${stu.id}/reset`);
    expect(r.status).toBe(200);
    const after = r.body.bookWords.find((w: any) => w.id === word.id);
    expect(after.card.totalSeen).toBe(0);
    expect(r.body.bookSession.reviewed).toBe(0);
  });

  test("an unknown word kind is rejected", async () => {
    const r = await api("POST", "/api/cvc", { kind: "nonsense", onset: "x", rime: "y" });
    expect(r.status).toBe(400);
  });
});
