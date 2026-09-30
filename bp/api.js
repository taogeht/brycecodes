'use strict';
// Blood-pressure log. Router factory mounted at /api/bp (see server.js).
// One reading per calendar day (date is the key); saving a date replaces it.
// Health data: every route needs the parent HQ cookie, except that writes also
// accept the BP_API_KEY header so a phone shortcut can log a reading.
const express = require('express');
const crypto = require('crypto');
const B = require('./lib/bp');
const tz = require('../loadout/lib/tz');

// Real readings taken before the module existed; inserted once, into an empty table.
const SEED = [
    { date: '2026-09-28', sys: 137, dia: 79, pulse: null },
    { date: '2026-09-29', sys: 129, dia: 69, pulse: null },
    { date: '2026-09-30', sys: 121, dia: 74, pulse: 59 },
];

module.exports = function makeBp(pool, auth) {
    const router = express.Router();
    const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(err => {
        console.error('[bp]', err.message);
        res.status(500).json({ error: 'server', message: 'Something went wrong.' });
    });

    let bootPromise;
    function bootstrap() {
        bootPromise = (async () => {
            await pool.query(`
                CREATE SCHEMA IF NOT EXISTS bp;
                CREATE TABLE IF NOT EXISTS bp.readings (
                    date DATE PRIMARY KEY,
                    sys SMALLINT NOT NULL CHECK (sys BETWEEN 60 AND 260),
                    dia SMALLINT NOT NULL CHECK (dia BETWEEN 30 AND 160 AND dia < sys),
                    pulse SMALLINT CHECK (pulse BETWEEN 30 AND 220),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )`);
            const { rows } = await pool.query('SELECT 1 FROM bp.readings LIMIT 1');
            if (!rows.length) {
                for (const r of SEED) {
                    await pool.query('INSERT INTO bp.readings (date, sys, dia, pulse) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
                        [r.date, r.sys, r.dia, r.pulse]);
                }
            }
        })().catch(err => { console.error('[bp] schema bootstrap failed:', err.message); throw err; });
        bootPromise.catch(() => {});
        return bootPromise;
    }
    router.use((req, res, next) => {
        Promise.resolve(bootPromise).then(() => next(), () =>
            res.status(503).json({ error: 'unavailable', message: 'Blood pressure log is unavailable until its database setup succeeds.' }));
    });

    const apiKey = process.env.BP_API_KEY;
    function hasKey(req) {
        const given = req.headers['x-api-key'];
        if (!apiKey || !given) return false;
        const a = Buffer.from(String(given)), b = Buffer.from(apiKey);
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    }
    const requireWriter = (req, res, next) => (hasKey(req) ? next() : auth.requireHq(req, res, next));

    async function load() {
        const { rows } = await pool.query(
            `SELECT to_char(date,'YYYY-MM-DD') AS date, sys, dia, pulse FROM bp.readings ORDER BY date ASC`);
        return rows;
    }

    router.get('/', auth.requireHq, wrap(async (req, res) => {
        const readings = await load();
        res.json({
            today: tz.dateKey(),
            readings: readings.map(r => ({ ...r, category: B.category(r.sys, r.dia) })),
            summary: B.summarize(readings),
            labels: B.LABELS,
        });
    }));

    router.get('/summary', auth.requireHq, wrap(async (req, res) => {
        res.json({ today: tz.dateKey(), labels: B.LABELS, ...B.summarize(await load()) });
    }));

    router.get('/export.csv', auth.requireHq, wrap(async (req, res) => {
        const rows = await load();
        res.type('text/csv').set('Content-Disposition', 'attachment; filename="bp-readings.csv"');
        res.send('date,sys,dia,pulse\n' + rows.map(r => `${r.date},${r.sys},${r.dia},${r.pulse ?? ''}`).join('\n') + '\n');
    }));

    router.post('/', requireWriter, wrap(async (req, res) => {
        const v = B.validate(req.body, tz.dateKey());
        if (v.error) return res.status(400).json({ error: 'bad-request', message: v.error });
        const r = v.value;
        await pool.query(
            `INSERT INTO bp.readings (date, sys, dia, pulse) VALUES ($1,$2,$3,$4)
             ON CONFLICT (date) DO UPDATE SET sys = EXCLUDED.sys, dia = EXCLUDED.dia,
                pulse = EXCLUDED.pulse, updated_at = NOW()`,
            [r.date, r.sys, r.dia, r.pulse]);
        res.json({ ...r, category: B.category(r.sys, r.dia) });
    }));

    router.delete('/:date', auth.requireHq, wrap(async (req, res) => {
        if (!B.isDateKey(req.params.date)) return res.status(400).json({ error: 'bad-request', message: 'date must be YYYY-MM-DD' });
        const { rowCount } = await pool.query('DELETE FROM bp.readings WHERE date = $1', [req.params.date]);
        if (!rowCount) return res.status(404).json({ error: 'not-found', message: 'No reading for that date.' });
        res.json({ success: true });
    }));

    return { router, bootstrap };
};
