'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/economy');
const S = require('../lib/scoring');
const cfg = require('../lib/default-config')();

test('minutes earn XP below target and beyond target; activities never pay money', () => {
    for (const id of ['reading', 'math-academy', 'power-moves', 'piano']) {
        const q = cfg.quests.find(q => q.id === id);
        for (const value of [0, 5, 20, 60]) {
            assert.deepEqual(S.checkinAward(cfg, q, { value, powerUps: ['started-promptly'] }).total,
                { xp: value, coins: 0, screenMinutes: 0 });
        }
        assert.equal(S.checkinAward(cfg, { ...q, xpPerMinute: 3 }, { value: 7 }).total.xp, 21);
    }
});
test('all eight chore rates carry forward, including pushups and floss', () => {
    for (const [id, value, amount] of [['take-out-garbage', 1, 10], ['clean-bathroom', 1, 100], ['pushups', 25, 25], ['floss', 1, 10]]) {
        assert.deepEqual(S.checkinAward(cfg, cfg.quests.find(q => q.id === id), { value }).total,
            { xp: 0, coins: amount, screenMinutes: 0 });
    }
    assert.equal(cfg.quests.filter(q => q.legacy).length, 8);
    assert.deepEqual(S.packAward(cfg, { items: [{ checked: true }] }), { xp: 0, coins: 0, screenMinutes: 0 });
});
test('configuration rejects bad rates and monetary reward prices', () => {
    assert.equal(E.validateConfig(cfg), null);
    const invalid = structuredClone(cfg);
    invalid.quests.find(q => q.id === 'reading').xpPerMinute = -2;
    assert.ok(E.validateConfig(invalid));
    invalid.quests.find(q => q.id === 'reading').xpPerMinute = 1;
    invalid.rewards[0].cost = { coins: 10 };
    assert.ok(E.validateConfig(invalid));
});
