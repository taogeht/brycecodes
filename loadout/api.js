'use strict';
// Loadout API (spec §7), mounted by the root server at /api/loadout.
// Parent-only routes are gated by auth.requireHq; Edward's routes are open,
// matching the old chores app.
const express = require('express');
const tz = require('./lib/tz');
const S = require('./lib/scoring');
const makeStore = require('./lib/store');
const makeAuth = require('./lib/auth');

const HISTORY_LOOKBACK_DAYS = 200; // enough for the streak walk and 4+ weeks of history

function bad(res, message, status = 400) {
    return res.status(status).json({ error: 'bad-request', message });
}

function cleanLabel(s) {
    return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function wrap(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = function loadout(pool, opts = {}) {
    const store = makeStore(pool);
    const auth = makeAuth(opts.auth);
    const router = express.Router();

    function bootstrap() {
        return store.bootstrap().catch(err => console.error('[loadout] schema bootstrap failed:', err.message));
    }

    // Validate the :date param once for every /day route.
    router.param('date', (req, res, next, date) => {
        if (!tz.isDateKey(date)) return bad(res, 'date must be YYYY-MM-DD');
        req.dateKey = date;
        next();
    });

    // ── HQ session ──────────────────────────────────────────────────────
    router.post('/hq/login', auth.login);
    router.post('/hq/logout', auth.logout);
    router.get('/hq/session', auth.session);

    // ── Config ──────────────────────────────────────────────────────────
    router.get('/config', wrap(async (req, res) => {
        res.json(await store.getConfig());
    }));

    router.put('/config', auth.requireHq, wrap(async (req, res) => {
        const cfg = req.body;
        if (!cfg || typeof cfg !== 'object' || !Array.isArray(cfg.quests) || !Array.isArray(cfg.rewards)) {
            return bad(res, 'config must include quests[] and rewards[]');
        }
        if (!cfg.quests.some(q => q.id === 'pack-check' && q.kind === 'packCheck')) {
            return bad(res, 'config must keep the pack-check quest');
        }
        res.json(await store.saveConfig(cfg));
    }));

    // ── Today (one call for Edward's home screen) ───────────────────────
    async function todayPayload() {
        const today = tz.dateKey();
        const [config, day, bal, days] = await Promise.all([
            store.getConfig(), store.getDay(today), store.balances(),
            store.daysBetween(tz.addDays(today, -HISTORY_LOOKBACK_DAYS), tz.addDays(today, -1)),
        ]);
        days[today] = day;
        const quests = S.questsActiveOn(config, today);
        return {
            date: today, weekday: tz.weekday(today), now: tz.nowISO(),
            isSchoolDay: quests.some(q => q.kind === 'packCheck'),
            day, quests, balances: bal,
            level: S.levelFor(config, bal.lifetimeXp),
            streak: S.streak(config, days, today),
            child: config.child,
        };
    }
    router.get('/today', wrap(async (req, res) => res.json(await todayPayload())));

    router.get('/balances', wrap(async (req, res) => {
        const [config, bal] = await Promise.all([store.getConfig(), store.balances()]);
        res.json({ ...bal, level: S.levelFor(config, bal.lifetimeXp) });
    }));

    router.get('/ledger', wrap(async (req, res) => {
        res.json(await store.ledger({ limit: Math.min(500, Number(req.query.limit) || 100) }));
    }));

    // ── Day record ──────────────────────────────────────────────────────
    router.get('/day/:date', wrap(async (req, res) => {
        res.json(await store.getDay(req.dateKey));
    }));

    // Parent writes or replaces the list. Child-added items and ticks on
    // parent items that survive (matched by id) are preserved.
    router.post('/day/:date/pack/items', auth.requireHq, wrap(async (req, res) => {
        const incoming = Array.isArray(req.body && req.body.items) ? req.body.items : null;
        if (!incoming) return bad(res, 'items[] required');
        const labels = incoming.map(i => ({ id: i && i.id, label: cleanLabel(i && i.label) })).filter(i => i.label);
        const { day, result } = await store.withDay(req.dateKey, day => {
            if (day.packCheck && day.packCheck.submittedAt && !req.body.force) {
                return { conflict: 'Already submitted for this day. Reopen it first.' };
            }
            const now = tz.nowISO();
            if (!day.packCheck) day.packCheck = store.blankPack(now, 'parent');
            const prev = new Map(day.packCheck.items.filter(i => i.source === 'parent').map(i => [i.id, i]));
            const parentItems = labels.map(l => {
                const old = l.id && prev.get(l.id);
                return old
                    ? { ...old, label: l.label }
                    : { id: store.newId('itm'), label: l.label, source: 'parent', checked: false, checkedAt: null };
            });
            const childItems = day.packCheck.items.filter(i => i.source === 'child');
            day.packCheck.items = [...parentItems, ...childItems];
            day.packCheck.writtenAt = now;
            day.packCheck.writtenBy = 'parent';
            return {};
        });
        if (result.conflict) return res.status(409).json({ error: 'submitted', message: result.conflict, day });
        res.json(day);
    }));

    // Child adds an ad-hoc "came up today" item.
    router.post('/day/:date/pack/items/add', wrap(async (req, res) => {
        const label = cleanLabel(req.body && req.body.label);
        if (!label) return bad(res, 'label required');
        const checked = !!(req.body && req.body.checked);
        const { day, result } = await store.withDay(req.dateKey, day => {
            if (day.packCheck && day.packCheck.submittedAt) return { conflict: true };
            const now = tz.nowISO();
            if (!day.packCheck) day.packCheck = store.blankPack(now, 'child');
            const item = { id: store.newId('itm'), label, source: 'child', checked, checkedAt: checked ? now : null };
            day.packCheck.items.push(item);
            return { item };
        });
        if (result.conflict) return res.status(409).json({ error: 'submitted', message: 'Already submitted.', day });
        res.json({ day, item: result.item });
    }));

    router.post('/day/:date/pack/tick', wrap(async (req, res) => {
        const { itemId, checked } = req.body || {};
        if (!itemId) return bad(res, 'itemId required');
        const { day, result } = await store.withDay(req.dateKey, day => {
            if (!day.packCheck) return { missing: true };
            if (day.packCheck.submittedAt) return { conflict: true };
            const item = day.packCheck.items.find(i => i.id === itemId);
            if (!item) return { missing: true };
            item.checked = !!checked;
            item.checkedAt = checked ? tz.nowISO() : null;
            return {};
        });
        if (result.missing) return bad(res, 'no such item', 404);
        if (result.conflict) return res.status(409).json({ error: 'submitted', message: 'Already submitted.', day });
        res.json(day);
    }));

    // Rule 3: submitting with ≥1 ticked item pays the full pack-check award,
    // once. The award and the day record commit in the same transaction.
    router.post('/day/:date/pack/submit', wrap(async (req, res) => {
        const config = await store.getConfig();
        const { day, result } = await store.withDay(req.dateKey, async (day, client) => {
            if (!day.packCheck) return { empty: true };
            if (day.packCheck.submittedAt) return { already: true };
            const award = S.packAward(config, day.packCheck);
            if (!award) return { empty: true };
            day.packCheck.submittedAt = tz.nowISO();
            if (!day.packCheck.awarded) {
                const txn = await store.appendLedger({
                    kind: 'earn', ...award,
                    source: { type: 'packCheck', date: req.dateKey },
                    note: `Pack check ${req.dateKey}`,
                }, client);
                day.packCheck.awarded = award;
                day.packCheck.ledgerId = txn.id;
            }
            return { awarded: day.packCheck.awarded };
        });
        if (result.empty) return bad(res, 'Tick at least one item first.');
        res.json({ day, awarded: result.awarded || day.packCheck.awarded, already: !!result.already });
    }));

    // Parent lets Edward fix a mistaken submit. The award is not clawed back
    // and a second submit does not pay again.
    router.post('/day/:date/pack/reopen', auth.requireHq, wrap(async (req, res) => {
        const { day } = await store.withDay(req.dateKey, day => {
            if (day.packCheck) day.packCheck.submittedAt = null;
        });
        res.json(day);
    }));

    // Parent records what actually arrived. Feeds history only — rule 3
    // says verification never adjusts the award.
    router.post('/day/:date/pack/verify', auth.requireHq, wrap(async (req, res) => {
        const arrived = Array.isArray(req.body && req.body.arrived) ? req.body.arrived : [];
        const missing = Array.isArray(req.body && req.body.missing) ? req.body.missing : [];
        const note = cleanLabel(req.body && req.body.note).slice(0, 500);
        const { day, result } = await store.withDay(req.dateKey, day => {
            if (!day.packCheck) return { missing: true };
            const ids = new Set(day.packCheck.items.map(i => i.id));
            day.packCheck.verification = {
                verifiedAt: tz.nowISO(),
                arrived: arrived.filter(id => ids.has(id)),
                missing: missing.filter(id => ids.has(id) && !arrived.includes(id)),
                note,
            };
            return {};
        });
        if (result.missing) return bad(res, 'no pack check for that day', 404);
        res.json(day);
    }));

    // ── History (§6 /hq/history, §7 GET /api/history/pack) ──────────────
    // Per-day pack stats plus weekday aggregates. The comparison that
    // matters is ticked vs arrived: ticked-but-missing is a packing problem,
    // not-ticked-but-needed is an attention problem.
    function packDayStats(key, day) {
        const pc = day && day.packCheck;
        if (!pc) return null;
        const v = pc.verification;
        const arrived = new Set(v ? v.arrived : []);
        const missing = new Set(v ? v.missing : []);
        const items = pc.items.map(i => ({
            id: i.id, label: i.label, source: i.source, checked: !!i.checked,
            arrived: v ? (arrived.has(i.id) ? true : missing.has(i.id) ? false : null) : null,
        }));
        return {
            date: key, weekday: tz.weekday(key),
            written: pc.items.some(i => i.source === 'parent'),
            submitted: !!pc.submittedAt, verified: !!v,
            counts: {
                items: items.length,
                ticked: items.filter(i => i.checked).length,
                arrived: items.filter(i => i.arrived === true).length,
                missing: items.filter(i => i.arrived === false).length,
                tickedMissing: items.filter(i => i.checked && i.arrived === false).length,
                notTicked: items.filter(i => !i.checked).length,
                notTickedMissing: items.filter(i => !i.checked && i.arrived === false).length,
            },
            tickedMissing: items.filter(i => i.checked && i.arrived === false).map(i => i.label),
            notTicked: items.filter(i => !i.checked).map(i => i.label),
            note: v ? v.note : '',
            awarded: pc.awarded, items,
        };
    }

    router.get('/history/pack', wrap(async (req, res) => {
        const weeks = Math.min(52, Math.max(1, Number(req.query.weeks) || 4));
        const today = tz.dateKey();
        const from = tz.mondayOf(tz.addDays(today, -7 * (weeks - 1)));
        const to = tz.addDays(tz.mondayOf(today), 6);
        const daysMap = await store.daysBetween(from, to);
        const days = Object.keys(daysMap).sort().map(k => packDayStats(k, daysMap[k])).filter(Boolean);
        const byWeekday = {};
        for (const wd of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
            const ds = days.filter(d => d.weekday === wd && d.written);
            if (!ds.length) continue;
            const sum = k => ds.reduce((a, d) => a + d.counts[k], 0);
            byWeekday[wd] = {
                days: ds.length, submitted: ds.filter(d => d.submitted).length, verified: ds.filter(d => d.verified).length,
                items: sum('items'), ticked: sum('ticked'), arrived: sum('arrived'), missing: sum('missing'),
                tickedMissing: sum('tickedMissing'), notTicked: sum('notTicked'), notTickedMissing: sum('notTickedMissing'),
            };
        }
        res.json({ from, to, today, weeks, days, byWeekday });
    }));

    // ── HQ daily-log bundle ─────────────────────────────────────────────
    router.get('/hq/overview', auth.requireHq, wrap(async (req, res) => {
        const date = tz.isDateKey(req.query.date) ? req.query.date : tz.dateKey();
        const [config, day, bal, open] = await Promise.all([
            store.getConfig(), store.getDay(date), store.balances(), store.requests({ status: 'open' }),
        ]);
        const pendingCheckins = []; // populated once quests land (phase 2)
        res.json({ date, weekday: tz.weekday(date), today: tz.dateKey(), day, balances: bal,
            level: S.levelFor(config, bal.lifetimeXp), pendingCheckins, openRequests: open, config });
    }));

    // Most recent day (before `date`) that has a parent-written list — for
    // "copy last list" on /hq/list.
    router.get('/hq/last-list', auth.requireHq, wrap(async (req, res) => {
        const before = tz.isDateKey(req.query.before) ? req.query.before : tz.dateKey();
        const { rows } = await pool.query(
            `SELECT to_char(date, 'YYYY-MM-DD') AS key, data FROM loadout.days
             WHERE date < $1 AND data->'packCheck'->'items' IS NOT NULL
             ORDER BY date DESC LIMIT 14`, [before]);
        const hit = rows.find(r => (r.data.packCheck.items || []).some(i => i.source === 'parent'));
        if (!hit) return res.json(null);
        res.json({ date: hit.key, items: hit.data.packCheck.items.filter(i => i.source === 'parent').map(i => ({ label: i.label })) });
    }));

    router.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
        console.error('[loadout]', req.method, req.originalUrl, err);
        res.status(500).json({ error: 'server', message: err.message });
    });

    return { router, bootstrap, store, auth };
};
