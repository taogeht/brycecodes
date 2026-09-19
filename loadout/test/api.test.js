'use strict';
// Integration test for the pack loop against a real Postgres. Skipped unless
// TEST_DATABASE_URL is set — it TRUNCATES loadout.* tables, so never point it
// at production.
//
//   TEST_DATABASE_URL=postgres://… node --test loadout/test/api.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { Pool } = require('pg');
const tz = require('../lib/tz');

const URL_ = process.env.TEST_DATABASE_URL;
if (!URL_) {
    test('api (skipped: TEST_DATABASE_URL not set)', { skip: true }, () => {});
} else {
    const pool = new Pool({ connectionString: URL_ });
    const loadout = require('../api')(pool, { auth: { pin: '1234' } });
    let server, base, hqCookie;
    const today = tz.dateKey();

    async function call(path, { method = 'GET', body, hq = false } = {}) {
        const res = await fetch(base + path, {
            method, headers: { 'content-type': 'application/json', ...(hq ? { cookie: hqCookie } : {}) },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
    }

    test.before(async () => {
        await loadout.bootstrap();
        await pool.query('TRUNCATE loadout.days, loadout.ledger, loadout.requests, loadout.legacy, loadout.config');
        await loadout.bootstrap(); // re-seed the default config
        const app = express();
        app.use(express.json());
        app.use('/api/loadout', loadout.router);
        await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
        base = `http://127.0.0.1:${server.address().port}/api/loadout`;
        const login = await call('/hq/login', { method: 'POST', body: { pin: '1234' } });
        assert.equal(login.status, 200);
        hqCookie = login.headers.get('set-cookie').split(';')[0];
    });
    test.after(async () => { server.close(); await pool.end(); });

    test('parent routes need the PIN; wrong PIN is rejected', async () => {
        assert.equal((await call(`/day/${today}/pack/items`, { method: 'POST', body: { items: [] } })).status, 401);
        assert.equal((await call('/hq/login', { method: 'POST', body: { pin: '0000' } })).status, 401);
        assert.equal((await call('/config', { method: 'PUT', body: {} })).status, 401);
    });

    test('pack loop: write → tick → add → submit pays once → locked → verify never changes award', async () => {
        let r = await call(`/day/${today}/pack/items`, { method: 'POST', hq: true, body: { items: [{ label: 'Science textbook' }, { label: 'Reading log' }, { label: '  ' }] } });
        assert.equal(r.status, 200);
        assert.deepEqual(r.body.packCheck.items.map(i => i.label), ['Science textbook', 'Reading log']);
        const [a, b] = r.body.packCheck.items.map(i => i.id);

        // nothing ticked → cannot submit
        assert.equal((await call(`/day/${today}/pack/submit`, { method: 'POST' })).status, 400);

        await call(`/day/${today}/pack/tick`, { method: 'POST', body: { itemId: a, checked: true } });
        r = await call(`/day/${today}/pack/items/add`, { method: 'POST', body: { label: 'Permission slip', checked: true } });
        assert.equal(r.body.item.source, 'child');

        // parent rewrite keeps the tick on a surviving item (by id) and the child item
        r = await call(`/day/${today}/pack/items`, { method: 'POST', hq: true, body: { items: [{ id: a, label: 'Science textbook (renamed)' }, { label: 'Math workbook' }] } });
        const items = r.body.packCheck.items;
        assert.deepEqual(items.map(i => [i.label, i.source, i.checked]), [
            ['Science textbook (renamed)', 'parent', true], ['Math workbook', 'parent', false], ['Permission slip', 'child', true]]);
        assert.ok(!items.some(i => i.id === b), 'dropped item is gone');

        const before = (await call('/balances')).body;
        r = await call(`/day/${today}/pack/submit`, { method: 'POST' });
        assert.equal(r.status, 200);
        assert.deepEqual(r.body.awarded, { xp: 10, coins: 2, screenMinutes: 0 });
        assert.equal(r.body.already, false);
        assert.deepEqual(r.body.split, { xp: 10, coins: 1, bank: 1, screenMinutes: 0 });
        const after = (await call('/balances')).body;
        assert.equal(after.xp - before.xp, 10);
        assert.equal(after.coins - before.coins, 1, 'spendable half');
        assert.equal(after.bank - before.bank, 1, 'bank half');

        // locked
        assert.equal((await call(`/day/${today}/pack/tick`, { method: 'POST', body: { itemId: a, checked: false } })).status, 409);
        assert.equal((await call(`/day/${today}/pack/items/add`, { method: 'POST', body: { label: 'x' } })).status, 409);
        assert.equal((await call(`/day/${today}/pack/items`, { method: 'POST', hq: true, body: { items: [{ label: 'y' }] } })).status, 409);

        // second submit, and reopen + resubmit, never pay again
        r = await call(`/day/${today}/pack/submit`, { method: 'POST' });
        assert.equal(r.body.already, true);
        await call(`/day/${today}/pack/reopen`, { method: 'POST', hq: true });
        r = await call(`/day/${today}/pack/submit`, { method: 'POST' });
        assert.equal(r.body.already, false);
        assert.deepEqual((await call('/balances')).body, after);
        const ledger = (await call('/ledger')).body;
        assert.equal(ledger.filter(e => e.source.type === 'packCheck').length, 1);

        // verify records arrival, ignores unknown ids, does not touch the award
        const mathId = items.find(i => i.label === 'Math workbook').id;
        r = await call(`/day/${today}/pack/verify`, { method: 'POST', hq: true, body: { arrived: [a, 'bogus'], missing: [mathId, a], note: 'left math on desk' } });
        assert.deepEqual(r.body.packCheck.verification.arrived, [a]);
        assert.deepEqual(r.body.packCheck.verification.missing, [mathId]);
        assert.deepEqual((await call('/balances')).body, after);

        const h = (await call('/history/pack?weeks=1')).body;
        const d = h.days.find(x => x.date === today);
        assert.equal(d.counts.tickedMissing, 0);
        assert.equal(d.counts.notTickedMissing, 1);
        assert.deepEqual(d.notTicked, ['Math workbook']);
    });

    test('check-in: pays on target, power-ups pay below target, deltas are monotonic, never double-pays', async () => {
        const bal = async () => (await call('/balances')).body;
        const b0 = await bal();
        // below target with a power-up → only the power-up pays
        let r = await call(`/day/${today}/checkin`, { method: 'POST', body: { questId: 'math-academy', value: 10, powerUps: ['started-promptly', 'bogus'] } });
        assert.equal(r.status, 200);
        assert.equal(r.body.checkin.targetMet, false);
        assert.deepEqual(r.body.checkin.powerUps, ['started-promptly']);
        assert.deepEqual(r.body.paid, { xp: 3, coins: 1, screenMinutes: 0 });
        const b1 = await bal();
        assert.equal(b1.xp - b0.xp, 3); assert.equal(b1.coins - b0.coins, 1);
        // same log again → nothing new paid
        r = await call(`/day/${today}/checkin`, { method: 'POST', body: { questId: 'math-academy', value: 10, powerUps: ['started-promptly'] } });
        assert.deepEqual(r.body.paid, { xp: 0, coins: 0, screenMinutes: 0 });
        // reach target + add a power-up → base + new power-up pay, old one doesn't repeat
        r = await call(`/day/${today}/checkin`, { method: 'POST', body: { questId: 'math-academy', value: 35, powerUps: ['started-promptly', 'stayed-with-hard'] } });
        assert.equal(r.body.checkin.targetMet, true);
        assert.deepEqual(r.body.paid, { xp: 11, coins: 3, screenMinutes: 10 });
        assert.deepEqual(r.body.split, { xp: 11, coins: 2, bank: 1, screenMinutes: 10 });
        assert.deepEqual(r.body.checkin.awarded, { xp: 14, coins: 4, screenMinutes: 10 });
        assert.deepEqual(r.body.checkin.paid, { xp: 14, coins: 4, screenMinutes: 10 });
        // taking a power-up away → refused for Edward
        r = await call(`/day/${today}/checkin`, { method: 'POST', body: { questId: 'math-academy', value: 35, powerUps: ['started-promptly'] } });
        assert.equal(r.status, 409);
        // one check-in per quest per day
        assert.equal((await call(`/day/${today}`)).body.checkins.filter(c => c.questId === 'math-academy').length, 1);
        // ledger: exactly two earn rows for this check-in
        const ledger = (await call('/ledger')).body.filter(e => e.source.type === 'checkin' && e.source.questId === 'math-academy');
        assert.equal(ledger.length, 2);
        // future / unknown / off-board
        assert.equal((await call(`/day/${tz.addDays(today, 1)}/checkin`, { method: 'POST', body: { questId: 'reading', value: 20 } })).status, 400);
        assert.equal((await call(`/day/${today}/checkin`, { method: 'POST', body: { questId: 'nope', value: 20 } })).status, 400);
        assert.equal((await call(`/day/${today}/checkin`, { method: 'POST', body: { questId: 'pack-check', value: 1 } })).status, 400);
    });

    test('check-in: requiresParentConfirm pays on confirm; adjust writes an adjust row and needs a note', async () => {
        // piano is weekdays only — pick the most recent weekday as the log date (hq may log any past day)
        let date = today;
        while (['sat', 'sun'].includes(tz.weekday(date))) date = tz.addDays(date, -1);
        const b0 = (await call('/balances')).body;
        let r = await call(`/day/${date}/checkin`, { method: 'POST', hq: true, body: { questId: 'piano', value: 25, powerUps: ['started-promptly'] } });
        assert.equal(r.status, 200);
        assert.equal(r.body.pending, true);
        assert.deepEqual(r.body.paid, { xp: 0, coins: 0, screenMinutes: 0 });
        assert.deepEqual((await call('/balances')).body, b0);
        const id = r.body.checkin.id;
        assert.equal((await call('/checkins/pending', { hq: true })).body.some(p => p.checkin.id === id), true);
        // Edward can't confirm; parent can, once
        assert.equal((await call(`/checkin/${id}/confirm`, { method: 'POST' })).status, 401);
        r = await call(`/checkin/${id}/confirm`, { method: 'POST', hq: true });
        assert.equal(r.body.checkin.status, 'confirmed');
        const b1 = (await call('/balances')).body;
        assert.equal(b1.xp - b0.xp, 11); assert.equal(b1.coins - b0.coins, 2); assert.equal(b1.bank - b0.bank, 1); assert.equal(b1.screenMinutes - b0.screenMinutes, 10);
        assert.equal((await call(`/checkin/${id}/confirm`, { method: 'POST', hq: true })).body.already, true);
        assert.deepEqual((await call('/balances')).body, b1);
        // Edward is now locked out of it
        assert.equal((await call(`/day/${date}/checkin`, { method: 'POST', body: { questId: 'piano', value: 30 } })).status, 409);
        // adjust: note required; delta lands as an adjust row
        assert.equal((await call(`/checkin/${id}/adjust`, { method: 'POST', hq: true, body: { awarded: { xp: 5, coins: 1, screenMinutes: 0 } } })).status, 400);
        r = await call(`/checkin/${id}/adjust`, { method: 'POST', hq: true, body: { awarded: { xp: 5, coins: 1, screenMinutes: 0 }, note: 'only 10 minutes really' } });
        assert.equal(r.body.checkin.status, 'adjusted');
        const b2 = (await call('/balances')).body;
        assert.equal(b2.xp - b1.xp, -6); assert.equal(b2.coins - b1.coins, -1); assert.equal(b2.bank - b1.bank, -1); assert.equal(b2.screenMinutes - b1.screenMinutes, -10);
        assert.equal(b2.lifetimeXp, b1.lifetimeXp, 'lifetime XP never decreases');
        const adj = (await call('/ledger')).body.find(e => e.kind === 'adjust' && e.source.checkinId === id);
        assert.equal(adj && adj.note, 'only 10 minutes really');
    });

    test('check-in: weekly-cadence quests cap at timesPerWeek', async () => {
        const cfg = (await call('/config')).body;
        cfg.quests.push({ id: 'bins', name: 'Bins', kind: 'simple', xp: 0, coins: 20, screenMinutes: 0, activeDays: [], cadence: 'weekly', timesPerWeek: 1, requiredForStreak: false, enabled: true });
        assert.equal((await call('/config', { method: 'PUT', hq: true, body: cfg })).status, 200);
        const mon = tz.mondayOf(today);
        // log it on monday (hq can log any past day), then try again another day the same week
        let r = await call(`/day/${mon}/checkin`, { method: 'POST', hq: true, body: { questId: 'bins' } });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.deepEqual(r.body.paid, { xp: 0, coins: 20, screenMinutes: 0 });
        if (today !== mon) {
            r = await call(`/day/${today}/checkin`, { method: 'POST', body: { questId: 'bins' } });
            assert.equal(r.status, 409);
        }
        const t = (await call('/today')).body;
        assert.equal(t.weekCounts.bins, 1);
    });

    test('vault: request reserves, approve spends once, deny/cancel write nothing, suggestions become rewards', async () => {
        const bal = async () => (await call('/balances')).body;
        // seed some coins
        await call('/config', { method: 'PUT', hq: true, body: (await call('/config')).body }); // no-op, ensures config exists
        const cur = await bal();
        await pool.query(`INSERT INTO loadout.ledger (kind, coins, screen_minutes, note) VALUES ('adjust', $1, $2, 'test seed')`, [50 - cur.coins, 30 - cur.screenMinutes]);
        const b0 = await bal();
        let v = (await call('/vault')).body;
        const dinner = v.rewards.find(r => r.id === 'friday-dinner');   // 35 coins
        const pocket = v.rewards.find(r => r.id === 'pocket-money');    // 20 coins
        const pass = v.rewards.find(r => r.id === 'game-pass-30');      // 30 screen minutes
        assert.equal(dinner.affordable, true); assert.equal(pocket.affordable, true); assert.equal(pass.affordable, true);
        // request dinner (35) → reserved; pocket (20) is now unaffordable with 50 − 35 = 15 available
        let r = await call('/rewards/friday-dinner/request', { method: 'POST' });
        assert.equal(r.status, 200);
        assert.equal(r.body.vault.available.coins, b0.coins - 35);
        assert.equal(r.body.vault.rewards.find(x => x.id === 'pocket-money').affordable, false);
        assert.equal((await call('/rewards/pocket-money/request', { method: 'POST' })).status, 409);
        assert.equal((await call('/rewards/friday-dinner/request', { method: 'POST' })).status, 409, 'duplicate');
        assert.deepEqual(await bal(), b0, 'nothing spent on request');
        const dinnerReq = r.body.request.id;
        // deny writes nothing and frees the reservation
        r = await call(`/requests/${dinnerReq}/deny`, { method: 'POST', hq: true, body: { note: 'Not this week' } });
        assert.equal(r.body.request.status, 'denied'); assert.equal(r.body.request.note, 'Not this week');
        assert.deepEqual(await bal(), b0);
        assert.equal((await call('/vault')).body.available.coins, b0.coins);
        // request + approve pocket money → spend row, once
        r = await call('/rewards/pocket-money/request', { method: 'POST' });
        const pocketReq = r.body.request.id;
        assert.equal((await call(`/requests/${pocketReq}/approve`, { method: 'POST' })).status, 401);
        r = await call(`/requests/${pocketReq}/approve`, { method: 'POST', hq: true });
        assert.equal(r.status, 200); assert.equal(r.body.request.status, 'approved'); assert.ok(r.body.txn);
        const b1 = await bal();
        assert.equal(b1.coins, b0.coins - 20); assert.equal(b1.xp, b0.xp); assert.equal(b1.bank, b0.bank, 'spends never touch the bank');
        assert.equal((await call(`/requests/${pocketReq}/approve`, { method: 'POST', hq: true })).status, 409, 'no double approve');
        assert.equal((await bal()).coins, b1.coins);
        // screen-minute reward
        r = await call('/rewards/game-pass-30/request', { method: 'POST' });
        r = await call(`/requests/${r.body.request.id}/approve`, { method: 'POST', hq: true });
        assert.equal((await bal()).screenMinutes, b0.screenMinutes - 30);
        // 30 coins left: dinner (35) is out of reach, pocket money (20) is not
        assert.equal((await call('/rewards/friday-dinner/request', { method: 'POST' })).status, 409);
        // cancel
        r = await call('/rewards/pocket-money/request', { method: 'POST' });
        assert.equal(r.status, 200);
        const c = r.body.request.id;
        r = await call(`/requests/${c}/cancel`, { method: 'POST' });
        assert.equal(r.body.request.status, 'cancelled');
        assert.equal((await call(`/requests/${c}/approve`, { method: 'POST', hq: true })).status, 409);
        // approve re-checks the live balance: request with 30, drain to 15 behind its back, approve → refused, still open
        r = await call('/rewards/pocket-money/request', { method: 'POST' });
        const d = r.body.request.id;
        await pool.query(`INSERT INTO loadout.ledger (kind, coins, note) VALUES ('adjust', -15, 'test drain')`);
        r = await call(`/requests/${d}/approve`, { method: 'POST', hq: true });
        assert.equal(r.status, 409);
        assert.equal((await call('/requests?status=open')).body.some(x => x.id === d), true);
        assert.equal((await call(`/requests/${d}/deny`, { method: 'POST', hq: true, body: { note: 'balance moved' } })).body.request.status, 'denied');
        await pool.query(`INSERT INTO loadout.ledger (kind, coins, note) VALUES ('adjust', 15, 'test undrain')`);
        // suggestion → reward
        r = await call('/requests/suggest', { method: 'POST', body: { name: 'Lego set', coins: 300, why: 'Been wanting it' } });
        assert.equal(r.body.request.kind, 'suggest');
        const sid = r.body.request.id;
        assert.equal((await call(`/requests/${sid}/approve`, { method: 'POST', hq: true, body: { coins: 0 } })).status, 409, 'needs a cost');
        r = await call(`/requests/${sid}/approve`, { method: 'POST', hq: true, body: { coins: 400, savingsGoal: true } });
        assert.equal(r.body.reward.id, 'lego-set'); assert.equal(r.body.reward.cost.coins, 400); assert.equal(r.body.reward.savingsGoal, true);
        assert.equal(r.body.request.note, 'Been wanting it', 'child note kept when parent adds none');
        assert.ok((await call('/config')).body.rewards.some(x => x.id === 'lego-set'));
        assert.deepEqual(await bal(), { ...b1, screenMinutes: b0.screenMinutes - 30 }, 'suggestion approval spends nothing');
    });

    test('parent balance adjust: explicit buckets, note required', async () => {
        const b0 = (await call('/balances')).body;
        assert.equal((await call('/ledger/adjust', { method: 'POST', hq: true, body: { bank: -100 } })).status, 400);
        assert.equal((await call('/ledger/adjust', { method: 'POST', body: { bank: -100, note: 'x' } })).status, 401);
        const r = await call('/ledger/adjust', { method: 'POST', hq: true, body: { bank: -100, coins: 5, note: 'Moved 100 to his account, 5 coin bonus' } });
        assert.equal(r.status, 200);
        assert.equal(r.body.balances.bank, b0.bank - 100); assert.equal(r.body.balances.coins, b0.coins + 5);
        assert.equal(r.body.txn.kind, 'adjust'); assert.equal(r.body.txn.source.type, 'balance-adjust');
    });

    test('history/quests counts done days against days on the board', async () => {
        const h = (await call('/history/quests?weeks=1')).body;
        const math = h.quests.find(x => x.id === 'math-academy');
        assert.ok(math && math.totals.active >= 1 && math.totals.done >= 1, JSON.stringify(math));
        assert.ok(math.totals.done <= math.totals.active);
        assert.equal(h.quests.some(x => x.id === 'pack-check'), false);
        const bins = h.quests.find(x => x.id === 'bins');
        assert.equal(bins.cadence, 'weekly'); assert.equal(bins.totals.active, 1); assert.equal(bins.totals.done, 1);
    });

    test('date param is validated', async () => {
        assert.equal((await call('/day/2026-13-01')).status, 400);
        assert.equal((await call('/day/nope')).status, 400);
    });

    test('config PUT must keep the pack-check quest', async () => {
        const cfg = (await call('/config')).body;
        const r = await call('/config', { method: 'PUT', hq: true, body: { ...cfg, quests: cfg.quests.filter(q => q.id !== 'pack-check') } });
        assert.equal(r.status, 400);
        cfg.pack.recurringItems = [{ id: 'rec_1', label: 'Water bottle' }];
        assert.equal((await call('/config', { method: 'PUT', hq: true, body: cfg })).status, 200);
        assert.deepEqual((await call('/config')).body.pack.recurringItems, [{ id: 'rec_1', label: 'Water bottle' }]);
    });
}
