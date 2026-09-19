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
        await pool.query('TRUNCATE loadout.days, loadout.ledger, loadout.requests, loadout.legacy');
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
        const after = (await call('/balances')).body;
        assert.equal(after.xp - before.xp, 10);
        assert.equal(after.coins - before.coins, 2);

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
