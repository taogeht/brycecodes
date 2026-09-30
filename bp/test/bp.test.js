'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../lib/bp');

test('category bands: first match wins, top down', () => {
    assert.equal(B.category(119, 79), 'normal');
    assert.equal(B.category(120, 79), 'elevated');
    assert.equal(B.category(129, 79), 'elevated');
    assert.equal(B.category(129, 80), 'stage1');
    assert.equal(B.category(130, 70), 'stage1');
    assert.equal(B.category(139, 89), 'stage1');
    assert.equal(B.category(140, 70), 'stage2');
    assert.equal(B.category(120, 90), 'stage2');
    assert.equal(B.category(180, 70), 'crisis');
    assert.equal(B.category(130, 120), 'crisis');
});

test('validate: defaults date, rejects bad ranges and dia >= sys', () => {
    assert.deepEqual(B.validate({ sys: 121, dia: 74, pulse: 59 }, '2026-09-30').value,
        { date: '2026-09-30', sys: 121, dia: 74, pulse: 59 });
    assert.equal(B.validate({ sys: '130', dia: '80', pulse: '' }, '2026-09-30').value.pulse, null);
    assert.match(B.validate({ sys: 80, dia: 80 }, '2026-09-30').error, /lower than systolic/);
    assert.ok(B.validate({ sys: 261, dia: 80 }, '2026-09-30').error);
    assert.ok(B.validate({ sys: 120, dia: 29 }, '2026-09-30').error);
    assert.ok(B.validate({ sys: 120.5, dia: 80 }, '2026-09-30').error);
    assert.ok(B.validate({ sys: 120, dia: 80, pulse: 20 }, '2026-09-30').error);
    assert.ok(B.validate({ date: '2026-13-40', sys: 120, dia: 80 }, '2026-09-30').error);
    assert.ok(B.validate(null, '2026-09-30').error);
});

const seed = [
    { date: '2026-09-28', sys: 137, dia: 79, pulse: null },
    { date: '2026-09-29', sys: 129, dia: 69, pulse: null },
    { date: '2026-09-30', sys: 121, dia: 74, pulse: 59 },
];

test('averages end at the latest reading and round to whole numbers', () => {
    const a = B.average(seed, 7);
    assert.deepEqual([a.sys, a.dia, a.n], [129, 74, 3]);
    assert.equal(a.category, 'elevated');
    // window is [end-6d, end]: a reading 7 days before the latest is excluded
    const r = [{ date: '2026-09-23', sys: 200, dia: 100 }, { date: '2026-09-30', sys: 120, dia: 70 }];
    assert.equal(B.average(r, 7).n, 1);
    assert.equal(B.average([], 7), null);
});

test('summary: empty log, latest, and alerts', () => {
    assert.deepEqual(B.summarize([]).alerts, []);
    const s = B.summarize(seed);
    assert.equal(s.latest.category, 'elevated'); // 121/74: systolic >= 120
    assert.deepEqual(s.alerts, []);

    const crisis = [...seed, { date: '2026-10-01', sys: 185, dia: 100, pulse: null }];
    assert.equal(B.summarize(crisis).alerts[0].level, 'high');

    const high = [26, 27, 28, 29, 30].map(d => ({ date: `2026-09-${d}`, sys: 135, dia: 85, pulse: null }));
    const note = B.summarize(high).alerts;
    assert.equal(note.length, 1);
    assert.equal(note[0].level, 'note');
    // 4 readings is not enough for the doctor note
    assert.deepEqual(B.summarize(high.slice(1)).alerts, []);
});
