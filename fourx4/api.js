'use strict';
// 4×4 training log. Router factory mounted at /api/4x4 (see server.js).
// Health data: every route needs the parent HQ cookie (loadout auth).
// Screenshots live on disk (FOURX4_UPLOAD_DIR, default /data/4x4-shots in the
// container); the DB row holds only the file name, and deleting the row deletes the file.
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const L = require('./lib/logic');
const tz = require('../loadout/lib/tz');

const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MEDIA_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const FILE_RE = /^[0-9a-f-]{36}\.(png|jpg|webp)$/;
const MAX_IMAGE = 5 * 1024 * 1024; // Anthropic's per-image limit

module.exports = function makeFourx4(pool, auth, opts = {}) {
    const router = express.Router();
    const uploadDir = opts.uploadDir || process.env.FOURX4_UPLOAD_DIR
        || (fs.existsSync('/data') ? '/data/4x4-shots' : path.join(__dirname, 'uploads'));
    const readModel = process.env.FOURX4_READ_MODEL || 'claude-haiku-4-5-20251001';
    const canRead = () => !!process.env.ANTHROPIC_API_KEY;

    const bad = (res, message, status = 400) => res.status(status).json({ error: 'bad-request', message });
    const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(err => {
        console.error('[4x4]', err.message);
        res.status(500).json({ error: 'server', message: 'Something went wrong.' });
    });

    let bootPromise;
    function bootstrap() {
        bootPromise = pool.query(`
            CREATE SCHEMA IF NOT EXISTS fourx4;
            CREATE TABLE IF NOT EXISTS fourx4.settings (
                id TEXT PRIMARY KEY DEFAULT 'singleton',
                max_hr SMALLINT NOT NULL DEFAULT 176,
                age SMALLINT,
                sex TEXT
            );
            INSERT INTO fourx4.settings (id, max_hr, age, sex) VALUES ('singleton', 176, 46, 'male') ON CONFLICT DO NOTHING;
            CREATE TABLE IF NOT EXISTS fourx4.sessions (
                id BIGSERIAL PRIMARY KEY,
                date DATE NOT NULL,
                level REAL[] NOT NULL,
                peak SMALLINT[] NOT NULL,
                rec SMALLINT[] NOT NULL,
                resting_hr SMALLINT,
                rpe SMALLINT,
                notes TEXT NOT NULL DEFAULT '',
                max_hr_at_time SMALLINT NOT NULL,
                watch JSONB,
                screenshot_path TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS fourx4_sessions_date_idx ON fourx4.sessions (date);
            CREATE TABLE IF NOT EXISTS fourx4.lifts (
                id BIGSERIAL PRIMARY KEY,
                date DATE NOT NULL,
                exercise TEXT NOT NULL,
                kg REAL NOT NULL,
                reps SMALLINT NOT NULL,
                sets SMALLINT NOT NULL DEFAULT 1,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS fourx4.cardio_fitness (
                id BIGSERIAL PRIMARY KEY,
                date DATE NOT NULL,
                vo2 REAL NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );`).catch(err => { console.error('[4x4] schema bootstrap failed:', err.message); throw err; });
        bootPromise.catch(() => {});
        return bootPromise;
    }
    router.use((req, res, next) => {
        Promise.resolve(bootPromise).then(() => next(), () =>
            res.status(503).json({ error: 'unavailable', message: '4×4 log is unavailable until its database setup succeeds.' }));
    });
    router.use(auth.requireHq);

    // ── Reads ───────────────────────────────────────────────────────────
    const D = `to_char(date,'YYYY-MM-DD') AS date`;
    async function loadAll() {
        const [s, sess, lifts, cardio] = await Promise.all([
            pool.query('SELECT max_hr, age, sex FROM fourx4.settings WHERE id = \'singleton\''),
            pool.query(`SELECT id::int, ${D}, level, peak, rec, resting_hr, rpe, notes, max_hr_at_time, watch, screenshot_path
                        FROM fourx4.sessions ORDER BY date ASC, id ASC`),
            pool.query(`SELECT id::int, ${D}, exercise, kg, reps, sets FROM fourx4.lifts ORDER BY date ASC, id ASC`),
            pool.query(`SELECT id::int, ${D}, vo2 FROM fourx4.cardio_fitness ORDER BY date ASC, id ASC`),
        ]);
        const settings = { maxHr: s.rows[0].max_hr, age: s.rows[0].age, sex: s.rows[0].sex };
        const sessions = sess.rows.map(r => {
            const row = { id: r.id, date: r.date, level: r.level, peak: r.peak, rec: r.rec, restingHr: r.resting_hr,
                rpe: r.rpe, notes: r.notes, maxHrAtTime: r.max_hr_at_time, watch: r.watch, screenshot: r.screenshot_path };
            return { ...row, stats: L.sessionStats(row) };
        });
        const liftRows = lifts.rows.map(l => ({ ...l, e1rm: Math.round(L.epley(l.kg, l.reps) * 10) / 10 }));
        return { settings, sessions, lifts: liftRows, cardio: cardio.rows };
    }

    router.get('/', wrap(async (req, res) => {
        const today = tz.dateKey();
        const d = await loadAll();
        res.json({ today, canRead: canRead(), phases: L.PHASES.map(p => ({ upTo: p.upTo === Infinity ? null : p.upTo, name: p.name })),
            ...d, progress: L.progress(d.sessions, d.cardio, today) });
    }));

    router.get('/summary', wrap(async (req, res) => {
        const today = tz.dateKey();
        const d = await loadAll();
        res.json({ today, ...L.progress(d.sessions, d.cardio, today), maxHr: d.settings.maxHr });
    }));

    // ── Settings ────────────────────────────────────────────────────────
    router.put('/settings', wrap(async (req, res) => {
        const v = L.validateSettings(req.body);
        if (v.error) return bad(res, v.error);
        await pool.query('UPDATE fourx4.settings SET max_hr = $1, age = $2, sex = $3 WHERE id = \'singleton\'',
            [v.value.maxHr, v.value.age, v.value.sex]);
        res.json(v.value);
    }));

    // ── Screenshots ─────────────────────────────────────────────────────
    const rawImage = express.raw({ type: Object.keys(IMAGE_TYPES), limit: MAX_IMAGE });
    const imageOnly = (req, res) => {
        if (!Buffer.isBuffer(req.body) || !req.body.length) { bad(res, 'Send a PNG, JPEG or WebP image up to 5 MB.'); return null; }
        return req.body;
    };
    const tooLarge = (err, req, res, next) => (err && err.type === 'entity.too.large'
        ? bad(res, 'That image is over 5 MB.', 413) : next(err));

    router.post('/screenshots', rawImage, tooLarge, wrap(async (req, res) => {
        const buf = imageOnly(req, res); if (!buf) return;
        const ext = IMAGE_TYPES[req.headers['content-type'].split(';')[0].trim()];
        const file = `${crypto.randomUUID()}.${ext}`;
        await fs.promises.mkdir(uploadDir, { recursive: true });
        await fs.promises.writeFile(path.join(uploadDir, file), buf);
        res.json({ file });
    }));

    router.get('/screenshots/:file', (req, res) => {
        if (!FILE_RE.test(req.params.file)) return bad(res, 'Bad file name.');
        res.set('Cache-Control', 'private, max-age=86400');
        res.sendFile(path.join(uploadDir, req.params.file), err => {
            if (err && !res.headersSent) res.status(404).json({ error: 'not-found', message: 'No such screenshot.' });
        });
    });

    router.delete('/screenshots/:file', wrap(async (req, res) => {
        if (!FILE_RE.test(req.params.file)) return bad(res, 'Bad file name.');
        const { rows } = await pool.query('SELECT 1 FROM fourx4.sessions WHERE screenshot_path = $1', [req.params.file]);
        if (rows.length) return bad(res, 'Delete the session to remove its screenshot.', 409);
        await fs.promises.unlink(path.join(uploadDir, req.params.file)).catch(() => {});
        res.json({ success: true });
    }));

    // Read an Apple Watch summary with Claude vision. Returns validated values
    // only; the page pre-fills its form and never auto-saves.
    router.post('/screenshots/read', rawImage, tooLarge, wrap(async (req, res) => {
        if (!canRead()) return bad(res, 'Screenshot reading is not configured.', 501);
        const buf = imageOnly(req, res); if (!buf) return;
        const media = req.headers['content-type'].split(';')[0].trim();
        let r;
        try {
            r = await fetch((process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages', {
                method: 'POST',
                signal: AbortSignal.timeout(45000),
                headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
                body: JSON.stringify({
                    model: readModel, max_tokens: 400,
                    messages: [{ role: 'user', content: [
                        { type: 'image', source: { type: 'base64', media_type: media, data: buf.toString('base64') } },
                        { type: 'text', text: L.readPrompt(tz.dateKey().slice(0, 4)) },
                    ] }],
                }),
            });
        } catch (err) {
            console.error('[4x4] vision request failed:', err.message);
            return res.status(502).json({ error: 'upstream', message: 'Could not reach the reader. Type the numbers in.' });
        }
        if (r.status === 429) return res.status(429).json({ error: 'rate-limited', message: 'Too many requests just now. Try again in a minute.' });
        if (!r.ok) {
            console.error('[4x4] vision API status', r.status);
            return res.status(502).json({ error: 'upstream', message: r.status === 400 ? 'That image could not be read. Try a PNG or JPEG screenshot.' : 'The reader is unavailable. Type the numbers in.' });
        }
        const j = await r.json();
        const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
        const parsed = L.parseReading(text);
        if (parsed.error) return res.status(422).json({ error: 'unreadable', message: parsed.error + ' Try again or type the numbers in.' });
        res.json(parsed.value);
    }));

    // ── Sessions ────────────────────────────────────────────────────────
    router.post('/sessions', wrap(async (req, res) => {
        const file = req.body && req.body.screenshot;
        if (file != null && !FILE_RE.test(file)) return bad(res, 'Bad screenshot reference.');
        if (file && !fs.existsSync(path.join(uploadDir, file))) return bad(res, 'That screenshot was not uploaded.');
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const cur = await client.query('SELECT max_hr FROM fourx4.settings WHERE id = \'singleton\' FOR UPDATE');
            const v = L.validateSession(req.body, { todayKey: tz.dateKey(), settingsMaxHr: cur.rows[0].max_hr, hasScreenshot: !!file });
            if (v.error) { await client.query('ROLLBACK'); return bad(res, v.error); }
            const s = v.value;
            if (s.newMaxHr !== null && s.newMaxHr !== cur.rows[0].max_hr) {
                await client.query('UPDATE fourx4.settings SET max_hr = $1 WHERE id = \'singleton\'', [s.newMaxHr]);
            }
            const { rows } = await client.query(
                `INSERT INTO fourx4.sessions (date, level, peak, rec, resting_hr, rpe, notes, max_hr_at_time, watch, screenshot_path)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id::int`,
                [s.date, s.level, s.peak, s.rec, s.restingHr, s.rpe, s.notes, s.maxHrAtTime,
                    s.watch ? JSON.stringify(s.watch) : null, file || null]);
            await client.query('COMMIT');
            res.json({ id: rows[0].id, date: s.date });
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            throw err;
        } finally { client.release(); }
    }));

    router.delete('/sessions/:id', wrap(async (req, res) => {
        const { rows } = await pool.query('DELETE FROM fourx4.sessions WHERE id = $1 RETURNING screenshot_path', [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'not-found', message: 'No such session.' });
        if (rows[0].screenshot_path && FILE_RE.test(rows[0].screenshot_path)) {
            await fs.promises.unlink(path.join(uploadDir, rows[0].screenshot_path)).catch(() => {});
        }
        res.json({ success: true });
    }));

    // ── Lifts + Cardio Fitness ──────────────────────────────────────────
    router.post('/lifts', wrap(async (req, res) => {
        const v = L.validateLift(req.body, tz.dateKey());
        if (v.error) return bad(res, v.error);
        const l = v.value;
        const { rows } = await pool.query('INSERT INTO fourx4.lifts (date, exercise, kg, reps, sets) VALUES ($1,$2,$3,$4,$5) RETURNING id::int',
            [l.date, l.exercise, l.kg, l.reps, l.sets]);
        res.json({ id: rows[0].id, ...l, e1rm: Math.round(L.epley(l.kg, l.reps) * 10) / 10 });
    }));
    router.delete('/lifts/:id', wrap(async (req, res) => {
        const { rowCount } = await pool.query('DELETE FROM fourx4.lifts WHERE id = $1', [req.params.id]);
        rowCount ? res.json({ success: true }) : res.status(404).json({ error: 'not-found', message: 'No such lift.' });
    }));

    router.post('/cardio', wrap(async (req, res) => {
        const v = L.validateCardio(req.body, tz.dateKey());
        if (v.error) return bad(res, v.error);
        const { rows } = await pool.query('INSERT INTO fourx4.cardio_fitness (date, vo2) VALUES ($1,$2) RETURNING id::int', [v.value.date, v.value.vo2]);
        res.json({ id: rows[0].id, ...v.value });
    }));
    router.delete('/cardio/:id', wrap(async (req, res) => {
        const { rowCount } = await pool.query('DELETE FROM fourx4.cardio_fitness WHERE id = $1', [req.params.id]);
        rowCount ? res.json({ success: true }) : res.status(404).json({ error: 'not-found', message: 'No such reading.' });
    }));

    return { router, bootstrap };
};
