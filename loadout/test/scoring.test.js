'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const defaultConfig = require('../lib/default-config');
const S = require('../lib/scoring');

const cfg = defaultConfig();
const q = id => S.questById(cfg, id);

test('rule 1: quest pays only when target met', () => {
    const r = S.checkinAward(cfg, q('math-academy'), { value: 29 });
    assert.equal(r.targetMet, false);
    assert.deepEqual(r.total, { xp: 0, coins: 0, screenMinutes: 0 });
    const ok = S.checkinAward(cfg, q('math-academy'), { value: 30 });
    assert.equal(ok.targetMet, true);
    assert.deepEqual(ok.total, { xp: 8, coins: 2, screenMinutes: 10 });
});

test('rule 2: power-ups pay even below target, and only the quest\'s own power-ups', () => {
    const r = S.checkinAward(cfg, q('math-academy'), { value: 5, powerUps: ['started-promptly', 'stayed-with-hard'] });
    assert.equal(r.targetMet, false);
    assert.deepEqual(r.total, { xp: 6, coins: 2, screenMinutes: 0 });
    // reading only allows started-promptly; stayed-with-hard is ignored
    const rd = S.checkinAward(cfg, q('reading'), { value: 20, powerUps: ['started-promptly', 'stayed-with-hard', 'bogus'] });
    assert.deepEqual(rd.applied, ['started-promptly']);
    assert.deepEqual(rd.total, { xp: 11, coins: 3, screenMinutes: 10 });
    // duplicates don't double-pay
    const dup = S.checkinAward(cfg, q('reading'), { value: 0, powerUps: ['started-promptly', 'started-promptly'] });
    assert.deepEqual(dup.total, { xp: 3, coins: 1, screenMinutes: 0 });
});

test('count quests pay per unit with no target', () => {
    const push = { id: 'pushups', kind: 'count', perUnit: { coins: 1 } };
    assert.deepEqual(S.checkinAward(cfg, push, { value: 25 }).total, { xp: 0, coins: 25, screenMinutes: 0 });
    assert.equal(S.checkinAward(cfg, push, { value: 0 }).targetMet, false);
});

test('rule 3: pack check pays for logging, whatever the score', () => {
    const items = n => Array.from({ length: 5 }, (_, i) => ({ id: 'i' + i, checked: i < n }));
    assert.equal(S.packAward(cfg, { items: items(0) }), null);
    assert.deepEqual(S.packAward(cfg, { items: items(3) }), { xp: 10, coins: 2, screenMinutes: 0 });
    assert.deepEqual(S.packAward(cfg, { items: items(5) }), { xp: 10, coins: 2, screenMinutes: 0 });
});

test('rule 5: level from lifetime xp, linear 400/level', () => {
    assert.deepEqual(S.levelFor(cfg, 0), { level: 1, into: 0, perLevel: 400, next: 400 });
    assert.deepEqual(S.levelFor(cfg, 399), { level: 1, into: 399, perLevel: 400, next: 400 });
    assert.deepEqual(S.levelFor(cfg, 400), { level: 2, into: 0, perLevel: 400, next: 800 });
    assert.deepEqual(S.levelFor(cfg, 1000), { level: 3, into: 200, perLevel: 400, next: 1200 });
});

test('questsActiveOn honours activeDays', () => {
    const sat = S.questsActiveOn(cfg, '2026-09-19').map(x => x.id);
    assert.ok(!sat.includes('pack-check') && !sat.includes('piano'));
    assert.ok(sat.includes('reading'));
    const mon = S.questsActiveOn(cfg, '2026-09-21').map(x => x.id);
    assert.ok(mon.includes('pack-check') && mon.includes('piano'));
});

test('streak: pack-only config, weekends exempt, missing list exempt, today in progress does not break', () => {
    // Only pack-check is required → weekends have nothing required → exempt.
    const packOnly = { ...cfg, quests: cfg.quests.filter(x => x.id === 'pack-check') };
    const submitted = { packCheck: { items: [{ id: 'a', checked: true }], submittedAt: 'x' } };
    const listed = { packCheck: { items: [{ id: 'a', checked: false }], submittedAt: null } };
    const days = {
        '2026-09-14': submitted, // mon
        '2026-09-15': submitted, // tue
        '2026-09-16': {},        // wed — no list written → exempt
        '2026-09-17': submitted, // thu
        '2026-09-18': submitted, // fri
        // sat/sun exempt
        '2026-09-21': listed,    // mon (today) — list written, not yet submitted
    };
    assert.equal(S.streak(packOnly, days, '2026-09-21'), 4);
    // Once today is submitted it counts.
    days['2026-09-21'] = submitted;
    assert.equal(S.streak(packOnly, days, '2026-09-21'), 5);
    // A listed-but-never-submitted day in the past breaks it.
    days['2026-09-17'] = listed;
    assert.equal(S.streak(packOnly, days, '2026-09-21'), 2);
});

test('streak: quests with requiredForStreak=false and weekly cadence are ignored', () => {
    const c = { ...cfg, quests: [
        ...cfg.quests.filter(x => x.id === 'pack-check'),
        { id: 'floss', kind: 'simple', activeDays: [], requiredForStreak: false },
        { id: 'bathroom', kind: 'simple', activeDays: [], cadence: 'weekly' },
    ] };
    const submitted = { packCheck: { items: [{ id: 'a', checked: true }], submittedAt: 'x' } };
    assert.equal(S.streak(c, { '2026-09-18': submitted }, '2026-09-18'), 1);
});
