'use strict';
// Loadout API (spec §7), mounted by the root server at /api/loadout.
// Parent-only routes are gated by auth.requireHq; Edward's routes are open,
// matching the old chores app.
const express = require('express');
const crypto = require('crypto');
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

const CHECKIN_ID_RE = /^chk_(\d{4})(\d{2})(\d{2})_[0-9a-f]{8}$/;
function checkinDate(id) {
    const m = CHECKIN_ID_RE.exec(String(id || ''));
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
function toInt(v, { min = 0, max = 100000 } = {}) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
}
function awardDelta(total, paid) {
    const p = paid || S.ZERO;
    return S.award(total.xp - p.xp, total.coins - p.coins, total.screenMinutes - p.screenMinutes);
}
function isNegative(a) { return a.xp < 0 || a.coins < 0 || a.screenMinutes < 0; }
function isZero(a) { return a.xp === 0 && a.coins === 0 && a.screenMinutes === 0; }
// Days in the Mon–Sun week of `date` on which `questId` was logged with target met.
function weekCount(daysByKey, date, questId, exceptDate) {
    const mon = tz.mondayOf(date);
    let n = 0;
    for (let i = 0; i < 7; i++) {
        const k = tz.addDays(mon, i);
        if (k === exceptDate) continue;
        const d = daysByKey[k];
        if (d && (d.checkins || []).some(c => c.questId === questId && c.targetMet)) n++;
    }
    return n;
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
        const weekCounts = {};
        for (const q of quests) if ((q.cadence || 'daily') === 'weekly') weekCounts[q.id] = weekCount(days, today, q.id);
        return {
            date: today, weekday: tz.weekday(today), now: tz.nowISO(),
            isSchoolDay: quests.some(q => q.kind === 'packCheck'),
            day, quests, weekCounts, powerUps: config.powerUps || [], balances: bal,
            packMode: (config.pack && config.pack.mode) || 'paper',
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

    // ── Quest check-ins (§5 rules 1, 2, 6, 7) ───────────────────────────
    // One check-in per quest per day. Re-logging recomputes the award and
    // pays only the delta over what's already been paid; deltas must be ≥ 0
    // (add minutes or a power-up, never remove — lowering is a parent
    // adjustment). requiresParentConfirm quests pay nothing until confirmed
    // and are locked for Edward afterwards.
    async function payDelta(checkin, delta, kind, note, client, date) {
        if (isZero(delta)) return null;
        const txn = await store.appendLedger({
            kind, ...delta,
            source: { type: kind === 'adjust' ? 'checkin-adjust' : 'checkin', date, checkinId: checkin.id, questId: checkin.questId },
            note,
        }, client);
        checkin.paid = S.addAwards(checkin.paid || S.ZERO, delta);
        checkin.ledgerIds = [...(checkin.ledgerIds || []), txn.id];
        return txn;
    }

    router.post('/day/:date/checkin', wrap(async (req, res) => {
        const date = req.dateKey;
        const today = tz.dateKey();
        const hq = auth.isHq(req);
        if (date > today) return bad(res, 'That day has not happened yet.');
        if (!hq && date < tz.addDays(today, -1)) return bad(res, 'Only today or yesterday can be logged. Ask a parent for older days.');
        const config = await store.getConfig();
        const quest = S.questById(config, req.body && req.body.questId);
        if (!quest || quest.enabled === false || quest.kind === 'packCheck') return bad(res, 'Unknown quest.');
        if (!S.questsActiveOn(config, date).some(q => q.id === quest.id)) return bad(res, quest.name + ' is not on the board that day.');

        const value = quest.kind === 'simple' ? 1 : toInt(req.body.value);
        if (value === null) return bad(res, 'value must be a whole number ≥ 0');
        const focusMinutes = toInt(req.body.focusMinutes || 0, { max: 24 * 60 });
        const powerUps = Array.isArray(req.body.powerUps) ? req.body.powerUps.map(String) : [];
        const computed = S.checkinAward(config, quest, { value, powerUps });

        const weekly = (quest.cadence || 'daily') === 'weekly';
        const daysThisWeek = weekly ? await store.daysBetween(tz.mondayOf(date), tz.addDays(tz.mondayOf(date), 6)) : null;

        const { day, result } = await store.withDay(date, async (day, client) => {
            day.checkins = day.checkins || [];
            let c = day.checkins.find(x => x.questId === quest.id);
            const now = tz.nowISO();
            if (c && !hq && (c.status === 'adjusted' || (quest.requiresParentConfirm && c.status === 'confirmed'))) {
                return { conflict: 'A parent has already confirmed this one. Ask them to adjust it.' };
            }
            if (weekly && !c && computed.targetMet && weekCount(daysThisWeek, date, quest.id, date) >= (quest.timesPerWeek || 1)) {
                return { conflict: `Already done ${quest.timesPerWeek || 1}× this week.` };
            }
            if (!c) {
                c = { id: `chk_${date.replace(/-/g, '')}_${crypto.randomBytes(4).toString('hex')}`, questId: quest.id,
                    loggedAt: now, paid: S.ZERO, ledgerIds: [], status: quest.requiresParentConfirm ? 'pending' : 'confirmed' };
                day.checkins.push(c);
            }
            const delta = awardDelta(computed.total, c.paid);
            if (isNegative(delta) && !hq) return { conflict: 'You can add to a check-in but not take away. Ask a parent to adjust it.' };
            Object.assign(c, { value, focusMinutes, powerUps: computed.applied, targetMet: computed.targetMet,
                awarded: computed.total, base: computed.base, updatedAt: now });
            let paidNow = S.ZERO;
            if (c.status !== 'pending') {
                await payDelta(c, delta, isNegative(delta) ? 'adjust' : 'earn', `${quest.name} ${date}`, client, date);
                paidNow = delta;
            }
            return { checkin: c, paidNow };
        });
        if (result.conflict) return res.status(409).json({ error: 'conflict', message: result.conflict, day });
        res.json({ day, checkin: result.checkin, paid: result.paidNow, pending: result.checkin.status === 'pending' });
    }));

    // Pending check-ins across the last 30 days, oldest first.
    router.get('/checkins/pending', auth.requireHq, wrap(async (req, res) => {
        const today = tz.dateKey();
        const [config, days] = await Promise.all([store.getConfig(), store.daysBetween(tz.addDays(today, -30), today)]);
        const out = [];
        for (const key of Object.keys(days).sort()) {
            for (const c of days[key].checkins || []) {
                if (c.status !== 'pending') continue;
                const q = S.questById(config, c.questId);
                out.push({ date: key, checkin: c, quest: q ? { id: q.id, name: q.name, kind: q.kind, target: q.target, unitLabel: q.unitLabel } : null });
            }
        }
        res.json(out);
    }));

    router.param('checkinId', (req, res, next, id) => {
        const date = checkinDate(id);
        if (!date || !tz.isDateKey(date)) return bad(res, 'bad check-in id');
        req.checkinDate = date;
        req.checkinId = id;
        next();
    });

    router.post('/checkin/:checkinId/confirm', auth.requireHq, wrap(async (req, res) => {
        const config = await store.getConfig();
        const { day, result } = await store.withDay(req.checkinDate, async (day, client) => {
            const c = (day.checkins || []).find(x => x.id === req.checkinId);
            if (!c) return { missing: true };
            if (c.status !== 'pending') return { checkin: c, already: true };
            const q = S.questById(config, c.questId);
            c.status = 'confirmed';
            c.confirmedAt = tz.nowISO();
            await payDelta(c, awardDelta(c.awarded, c.paid), 'earn', `${q ? q.name : c.questId} ${req.checkinDate} (confirmed)`, client, req.checkinDate);
            return { checkin: c };
        });
        if (result.missing) return bad(res, 'no such check-in', 404);
        res.json({ day, checkin: result.checkin, already: !!result.already });
    }));

    // Rule 7: parent sets the award outright; the difference is an `adjust`
    // ledger row with a required note.
    router.post('/checkin/:checkinId/adjust', auth.requireHq, wrap(async (req, res) => {
        const a = req.body && req.body.awarded || {};
        const awarded = S.award(toInt(a.xp, { min: -100000 }), toInt(a.coins, { min: -100000 }), toInt(a.screenMinutes, { min: -100000 }));
        const note = cleanLabel(req.body && req.body.note).slice(0, 300);
        if (!note) return bad(res, 'A note is required for adjustments.');
        const config = await store.getConfig();
        const { day, result } = await store.withDay(req.checkinDate, async (day, client) => {
            const c = (day.checkins || []).find(x => x.id === req.checkinId);
            if (!c) return { missing: true };
            const q = S.questById(config, c.questId);
            c.awarded = awarded;
            c.status = 'adjusted';
            c.note = note;
            c.adjustedAt = tz.nowISO();
            await payDelta(c, awardDelta(awarded, c.paid), 'adjust', note, client, req.checkinDate);
            return { checkin: c };
        });
        if (result.missing) return bad(res, 'no such check-in', 404);
        res.json({ day, checkin: result.checkin });
    }));

    // ── Vault: rewards, requests, approvals (§5 rule 6) ─────────────────
    // A request reserves coins (Edward can't request past balance − open
    // requests); nothing leaves the ledger until a parent approves, which
    // re-checks the live balance inside the transaction.
    function costOf(r) { const c = r && r.cost || {}; return { coins: c.coins | 0, screenMinutes: c.screenMinutes | 0 }; }
    function reservedFrom(open) {
        return open.filter(r => r.kind === 'redeem').reduce((a, r) => { const c = costOf(r); return { coins: a.coins + c.coins, screenMinutes: a.screenMinutes + c.screenMinutes }; }, { coins: 0, screenMinutes: 0 });
    }
    function canAfford(bal, reserved, cost) {
        return bal.coins - reserved.coins >= cost.coins && bal.screenMinutes - reserved.screenMinutes >= cost.screenMinutes;
    }

    async function vaultPayload() {
        const [config, bal, open, recent] = await Promise.all([
            store.getConfig(), store.balances(), store.requests({ status: 'open' }), store.requests({ limit: 40 }),
        ]);
        const reserved = reservedFrom(open);
        const rewards = (config.rewards || []).filter(r => r.enabled !== false).map(r => {
            const cost = costOf(r);
            return { ...r, cost, affordable: canAfford(bal, reserved, cost), pending: open.some(o => o.kind === 'redeem' && o.rewardId === r.id) };
        });
        return {
            balances: bal, reserved, available: { coins: bal.coins - reserved.coins, screenMinutes: bal.screenMinutes - reserved.screenMinutes },
            level: S.levelFor(config, bal.lifetimeXp), coinValue: config.coinValue || { currency: 'TWD', perCoin: 0 },
            rewards, open, recent: recent.filter(r => r.status !== 'open').slice(0, 12), child: config.child,
        };
    }
    router.get('/vault', wrap(async (req, res) => res.json(await vaultPayload())));

    router.get('/requests', wrap(async (req, res) => {
        const status = ['open', 'approved', 'denied', 'cancelled'].includes(req.query.status) ? req.query.status : undefined;
        res.json(await store.requests({ status, limit: Math.min(500, Number(req.query.limit) || 200) }));
    }));

    router.post('/rewards/:id/request', wrap(async (req, res) => {
        const config = await store.getConfig();
        const reward = (config.rewards || []).find(r => r.id === req.params.id && r.enabled !== false);
        if (!reward) return bad(res, 'That reward is not available.', 404);
        const cost = costOf(reward);
        const [bal, open] = await Promise.all([store.balances(), store.requests({ status: 'open' })]);
        if (open.some(o => o.kind === 'redeem' && o.rewardId === reward.id)) return res.status(409).json({ error: 'duplicate', message: 'Already requested — waiting for a parent.' });
        if (!canAfford(bal, reservedFrom(open), cost)) return res.status(409).json({ error: 'insufficient', message: 'Not enough saved up yet.' });
        const request = await store.createRequest({ kind: 'redeem', rewardId: reward.id, name: reward.name, cost });
        res.json({ request, vault: await vaultPayload() });
    }));

    router.post('/requests/suggest', wrap(async (req, res) => {
        const name = cleanLabel(req.body && req.body.name);
        if (!name) return bad(res, 'Give the reward a name.');
        const cost = { coins: toInt(req.body && req.body.coins || 0) || 0, screenMinutes: 0 };
        const note = cleanLabel(req.body && req.body.why).slice(0, 300);
        const request = await store.createRequest({ kind: 'suggest', name, cost, note });
        res.json({ request, vault: await vaultPayload() });
    }));

    router.post('/requests/:id/cancel', wrap(async (req, res) => {
        const out = await store.resolveRequest(req.params.id, req0 => req0.status === 'open' ? { status: 'cancelled', note: 'Cancelled by Edward' } : { refuse: 'Already ' + req0.status + '.' });
        if (out.missing) return bad(res, 'no such request', 404);
        if (out.refuse) return res.status(409).json({ error: 'resolved', message: out.refuse });
        res.json({ request: out.request, vault: await vaultPayload() });
    }));

    router.post('/requests/:id/approve', auth.requireHq, wrap(async (req, res) => {
        const note = cleanLabel(req.body && req.body.note).slice(0, 300);
        const config = await store.getConfig();
        const out = await store.resolveRequest(req.params.id, async (r, client) => {
            if (r.status !== 'open') return { refuse: 'Already ' + r.status + '.' };
            if (r.kind === 'redeem') {
                const cost = costOf(r);
                const bal = await store.balances(client);
                if (bal.coins < cost.coins || bal.screenMinutes < cost.screenMinutes) return { refuse: 'Not enough in the balance right now.' };
                const txn = await store.appendLedger({
                    kind: 'spend', xp: 0, coins: -cost.coins, screenMinutes: -cost.screenMinutes,
                    source: { type: 'reward', requestId: r.id, rewardId: r.rewardId, name: r.name }, note: note || r.name,
                }, client);
                return { status: 'approved', note, txn };
            }
            // suggestion → becomes a reward with the cost the parent sets
            const coins = toInt(req.body && req.body.coins != null ? req.body.coins : (r.cost && r.cost.coins) || 0) || 0;
            const screenMinutes = toInt(req.body && req.body.screenMinutes || 0) || 0;
            if (!coins && !screenMinutes) return { refuse: 'Set a cost (coins or screen minutes) to approve a suggestion.' };
            let base = r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'reward', id = base, n = 2;
            config.rewards = config.rewards || [];
            while (config.rewards.some(x => x.id === id)) id = base + '-' + n++;
            const reward = { id, name: r.name, cost: { ...(coins ? { coins } : {}), ...(screenMinutes ? { screenMinutes } : {}) }, enabled: true, savingsGoal: !!(req.body && req.body.savingsGoal), suggested: true };
            config.rewards.push(reward);
            await client.query(`UPDATE loadout.config SET data = $1, updated_at = NOW() WHERE id = 'singleton'`, [JSON.stringify(config)]);
            return { status: 'approved', note, reward };
        });
        if (out.missing) return bad(res, 'no such request', 404);
        if (out.refuse) return res.status(409).json({ error: 'refused', message: out.refuse });
        res.json({ request: out.request, txn: out.txn || null, reward: out.reward || null });
    }));

    router.post('/requests/:id/deny', auth.requireHq, wrap(async (req, res) => {
        const note = cleanLabel(req.body && req.body.note).slice(0, 300);
        const out = await store.resolveRequest(req.params.id, r => r.status === 'open' ? { status: 'denied', note } : { refuse: 'Already ' + r.status + '.' });
        if (out.missing) return bad(res, 'no such request', 404);
        if (out.refuse) return res.status(409).json({ error: 'refused', message: out.refuse });
        res.json({ request: out.request });
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

    // Quest completion by week: for each enabled non-pack quest, how many
    // days it was on the board (up to today) and how many were done.
    router.get('/history/quests', wrap(async (req, res) => {
        const weeks = Math.min(52, Math.max(1, Number(req.query.weeks) || 4));
        const today = tz.dateKey();
        const from = tz.mondayOf(tz.addDays(today, -7 * (weeks - 1)));
        const [config, days] = await Promise.all([store.getConfig(), store.daysBetween(from, today)]);
        const quests = (config.quests || []).filter(q => q.enabled !== false && q.kind !== 'packCheck');
        const out = quests.map(q => ({ id: q.id, name: q.name, kind: q.kind, cadence: q.cadence || 'daily', timesPerWeek: q.timesPerWeek || 1,
            requiredForStreak: q.requiredForStreak !== false, weeks: [], totals: { active: 0, done: 0 } }));
        for (let w = 0; w < weeks; w++) {
            const mon = tz.addDays(from, 7 * w);
            for (const o of out) {
                const q = quests.find(x => x.id === o.id);
                let active = 0, done = 0;
                for (let i = 0; i < 7; i++) {
                    const k = tz.addDays(mon, i);
                    if (k > today) break;
                    const onBoard = S.questsActiveOn(config, k).some(x => x.id === q.id);
                    if (!onBoard) continue;
                    active++;
                    const d = days[k];
                    if (d && (d.checkins || []).some(c => c.questId === q.id && c.targetMet)) done++;
                }
                if (o.cadence === 'weekly') active = Math.min(active, o.timesPerWeek);
                o.weeks.push({ monday: mon, active, done: Math.min(done, active || done) });
                o.totals.active += active; o.totals.done += Math.min(done, active || done);
            }
        }
        res.json({ from, to: today, weeks, quests: out });
    }));

    // ── HQ daily-log bundle ─────────────────────────────────────────────
    router.get('/hq/overview', auth.requireHq, wrap(async (req, res) => {
        const date = tz.isDateKey(req.query.date) ? req.query.date : tz.dateKey();
        const today = tz.dateKey();
        const [config, day, bal, open, recent] = await Promise.all([
            store.getConfig(), store.getDay(date), store.balances(), store.requests({ status: 'open' }),
            store.daysBetween(tz.addDays(today, -30), today),
        ]);
        const pendingCheckins = [];
        for (const key of Object.keys(recent).sort()) {
            for (const c of recent[key].checkins || []) {
                if (c.status === 'pending') pendingCheckins.push({ date: key, checkin: c, quest: S.questById(config, c.questId) });
            }
        }
        res.json({ date, weekday: tz.weekday(date), today, day, balances: bal,
            level: S.levelFor(config, bal.lifetimeXp), pendingCheckins, openRequests: open, config,
            questsOnBoard: S.questsActiveOn(config, date) });
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

    // True once scripts/migrate-chores-to-loadout.js has run. server.js uses
    // this to redirect /chores → /loadout without a second deploy. Memoised
    // for a minute; a false answer is re-checked so the cutover is quick.
    let legacyMemo = { at: 0, value: false };
    async function legacyImported() {
        if (legacyMemo.value) return true;
        if (Date.now() - legacyMemo.at < 60000) return false;
        try {
            const { rows } = await pool.query(`SELECT 1 FROM loadout.legacy WHERE id = 'chores'`);
            legacyMemo = { at: Date.now(), value: rows.length > 0 };
        } catch (e) { legacyMemo = { at: Date.now(), value: false }; }
        return legacyMemo.value;
    }

    return { router, bootstrap, store, auth, legacyImported };
};
