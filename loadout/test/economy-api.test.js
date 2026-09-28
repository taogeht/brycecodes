'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const express = require('express');
const tz = require('../lib/tz');
const E = require('../lib/economy');
if (!process.env.TEST_DATABASE_URL) {
    test('economy database integration (needs TEST_DATABASE_URL)', { skip: true }, () => {});
} else {
    // Run test files with --test-concurrency=1: both integration files use this scratch DB.
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const store = require('../lib/store')(pool);
    const loadout = require('../api')(pool, { auth: { pin: '1234' } });
    let server, base, cookie;
    const today = tz.dateKey(), week = tz.addDays(tz.mondayOf(today), -7);
    async function call(path, body, hq = false, method = body === undefined ? 'GET' : 'POST') {
        const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(hq ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
        return { status: r.status, body: await r.json() };
    }
    test.before(async () => {
        await store.bootstrap();
        await pool.query('TRUNCATE loadout.days,loadout.ledger,loadout.requests,loadout.legacy,loadout.config,loadout.payouts');
        await pool.query("INSERT INTO loadout.config(id,data) VALUES ('singleton',$1)", [JSON.stringify(require('./fixtures/legacy-config')())]);
        // Pre-existing Loadout earnings and a prior check-in remain auditable.
        await store.appendLedger({ kind: 'earn', xp: 18, coins: 3, bank: 1, source: { type: 'checkin' } });
        const source = { anchorMonday: '2026-01-05', chores: E.CHORES, weeks: [{ earned: 15, saved: 7 }, { earned: 100, saved: 50 }] };
        await pool.query("INSERT INTO loadout.legacy(id,source,summary) VALUES ('chores',$1,$2)", [JSON.stringify(source), JSON.stringify({ openingBank: 57 })]);
        await store.appendLedger({ kind: 'adjust', bank: 57, source: { type: 'legacy-import' } });
        await store.bootstrap();
        const app = express(); app.use(express.json()); app.use(loadout.router);
        server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
        base = `http://127.0.0.1:${server.address().port}`;
        const r = await fetch(base + '/hq/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"pin":"1234"}' });
        cookie = r.headers.get('set-cookie').split(';')[0];
    });
    test.after(async () => { if (server) await new Promise(r => server.close(r)); await pool.end(); });
    test('migration keeps the exact savings and total earned, clears old payable cash, and is idempotent', async () => {
        const e = (await call('/earnings')).body;
        assert.equal(e.lifetimeEarned, 119); assert.equal(e.cashPaid, 61); assert.equal(e.savingsPaid, 58); assert.equal(e.unpaid, 0);
        assert.ok(e.historicalWeeks.every(w => w.status === 'paid'));
        assert.equal((await store.balances()).bank, 58);
        assert.equal((await store.balances()).coins, 0);
        const before = await store.ledger(); await store.bootstrap(); assert.deepEqual(await store.ledger(), before);
    });
    test('unimported chores are archived with paid history and exact savings', async () => {
        await store.transaction(async client => {
            await client.query('SAVEPOINT rehearsal');
            await client.query('TRUNCATE loadout.legacy,loadout.ledger,loadout.days');
            await client.query('CREATE SCHEMA IF NOT EXISTS chores; CREATE TABLE IF NOT EXISTS chores.state(id text PRIMARY KEY,data jsonb)');
            const source = { anchorMonday: week, chores: E.CHORES, weeks: [{ earned: 15, saved: 7 }] };
            await client.query("INSERT INTO chores.state VALUES('singleton',$1) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data", [JSON.stringify(source)]);
            const original = require('./fixtures/legacy-config')();
            await E.migrate(client, original);
            const e = await store.earnings(client);
            assert.equal(e.lifetimeEarned, 15); assert.equal(e.cashPaid, 8); assert.equal(e.savingsPaid, 7); assert.equal(e.unpaid, 0);
            assert.deepEqual((await client.query("SELECT source FROM loadout.legacy WHERE id='chores'")).rows[0].source, source);
            // A new earning in the historical week retains the week's rounding.
            await store.appendLedger({ kind: 'earn', coins: 5, source: { economy: 2, date: week, type: 'checkin' } }, client);
            const updated = await store.earnings(client);
            assert.equal(updated.lifetimeEarned, 20);
            assert.equal(updated.weeks[0].cashDue, 2); assert.equal(updated.weeks[0].savingsDue, 3);
            assert.equal(updated.historicalWeeks.length, 0, 'merged week appears once');
            await client.query('ROLLBACK TO SAVEPOINT rehearsal');
        });
    });
    test('activity accrual is by duration, re-logging only adds the difference', async () => {
        const path = `/day/${today}/checkin`;
        for (const [value, delta] of [[5,5],[5,0],[30,25]]) {
            const r = await call(path, { questId: 'reading', value });
            assert.equal(r.status, 200); assert.equal(r.body.paid.xp, delta); assert.equal(r.body.paid.coins, 0);
        }
        assert.equal((await call(path, { questId: 'math-academy', value: 12 })).body.paid.xp, 12);
        for (const value of [-1, 0.5, 1441, 'bad']) assert.equal((await call(path, { questId: 'reading', value })).status, 400);
        assert.equal((await call(path, { questId: 'reading', value: 20 })).status, 409);
    });
    test('concurrent first chore submissions pay once, weekly payout splits the gross week and cannot repeat', async () => {
        const r = await Promise.all([1,2].map(() => call(`/day/${week}/checkin`, { questId: 'wipe-the-table', value: 1 }, true)));
        assert.ok(r.every(r => r.status === 200));
        let e = (await call('/earnings')).body;
        assert.equal(e.unpaid, 5); assert.equal(e.lifetimeEarned, 124);
        assert.equal((await call(`/earnings/${week}/pay`, {})).status, 401);
        const payouts = await Promise.all([1,2].map(() => call(`/earnings/${week}/pay`, {}, true)));
        assert.deepEqual(payouts.map(r => r.status).sort(), [200,409]);
        e = (await call('/earnings')).body;
        assert.equal(e.unpaid, 0); assert.equal(e.cashPaid, 64); assert.equal(e.savingsPaid, 60); assert.equal(e.lifetimeEarned, 124);
        const day = (await call(`/day/${week}`)).body;
        assert.equal((await call(`/checkin/${day.checkins[0].id}/adjust`, { awarded: { xp: 0, coins: 0, screenMinutes: 0 }, note: 'test correction' }, true)).status, 409);
        // A later entry in the paid week pays only the new amount. Rounding is weekly.
        await call(`/day/${tz.addDays(week,1)}/checkin`, { questId: 'wipe-the-table', value: 1 }, true);
        const later = await call(`/earnings/${week}/pay`, {}, true);
        assert.equal(later.status, 200); assert.equal(later.body.payout.cash, 2); assert.equal(later.body.payout.savings, 3);
        assert.equal((await call(`/earnings/${tz.mondayOf(today)}/pay`, {}, true)).status, 409);
    });
    test('reward reservations cannot overspend XP and approving twice never spends money', async () => {
        const cfg = await store.getConfig();
        cfg.rewards = [{ id: 'a', name: 'A', cost: { xp: 40 } }, { id: 'b', name: 'B', cost: { xp: 40 } }];
        await store.saveConfig(cfg);
        const before = await store.balances(); // 60 XP
        const results = await Promise.all(['a','b'].map(id => call(`/rewards/${id}/request`, {})));
        assert.deepEqual(results.map(r => r.status).sort(), [200,409]);
        const id = results.find(r => r.status === 200).body.request.id;
        assert.equal((await call(`/requests/${id}/approve`, {}, true)).status, 200);
        assert.equal((await call(`/requests/${id}/approve`, {}, true)).status, 409);
        const after = await store.balances();
        assert.equal(after.xp, before.xp - 40); assert.equal(after.lifetimeXp, before.lifetimeXp);
        assert.equal(after.coins, before.coins); assert.equal(after.bank, before.bank);
    });
    test('parent can add an XP-priced suggestion and cannot overwrite opening earnings', async () => {
        const sug = await call('/requests/suggest', { name: 'Climbing', xp: 75 });
        const approved = await call(`/requests/${sug.body.request.id}/approve`, { xp: 80 }, true);
        assert.equal(approved.status, 200); assert.deepEqual(approved.body.reward.cost, { xp: 80 });
        const cfg = (await call('/config')).body, opening = cfg.earningsOpening;
        cfg.earningsOpening = { earned: 999999 };
        const saved = await call('/config', cfg, true, 'PUT'); assert.equal(saved.status, 200); assert.deepEqual(saved.body.earningsOpening, opening);
    });
}
