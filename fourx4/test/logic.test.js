'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib/logic');

const ctx = { todayKey: '2026-09-30', settingsMaxHr: 176 };
const session = (over = {}) => ({ date: '2026-09-25', level: [9, 9, 9, 8.5], peak: [167, 170, 172, 174], rec: [119, 124, 127, null], restingHr: 61, rpe: 7, ...over });

test('epley: single is just the weight', () => {
    assert.equal(L.epley(100, 1), 100);
    assert.equal(L.epley(90, 5), 105);
});

test('zone class flips at 85% and 95%', () => {
    assert.equal(L.zoneClass(84.9), 'low');
    assert.equal(L.zoneClass(85), 'ok');
    assert.equal(L.zoneClass(95), 'ok');
    assert.equal(L.zoneClass(95.1), 'high');
    assert.equal(L.zoneClass(null), null);
});

test('session stats: means skip nulls, drop needs both values, zone uses the snapshot max HR', () => {
    const v = L.validateSession(session(), ctx).value;
    const st = L.sessionStats(v);
    assert.equal(st.avgLevel, 8.9);   // 8.875
    assert.equal(st.avgPeak, 170.8);  // 170.75
    assert.equal(st.drop, 46.3);      // (48 + 46 + 45) / 3; round 4 has no recovery
    assert.equal(st.zonePct, 97);     // 170.75 / 176
    assert.equal(st.zoneClass, 'high');
    assert.deepEqual(st.roundZones, [95, 97, 98, 99]);
});

test('changing max HR later does not rewrite an old session\'s zone %', () => {
    const old = L.validateSession(session(), ctx).value;            // snapshot 176
    const before = L.sessionStats(old).zonePct;
    const later = L.validateSession(session(), { ...ctx, settingsMaxHr: 190 }).value; // settings moved on
    assert.equal(L.sessionStats(old).zonePct, before);
    assert.notEqual(L.sessionStats(later).zonePct, before);
});

test('session max HR: an entered max wins and is flagged as a settings update', () => {
    const v = L.validateSession(session({ maxHr: 181 }), ctx).value;
    assert.equal(v.maxHrAtTime, 181);
    assert.equal(v.newMaxHr, 181);
    assert.equal(L.validateSession(session(), ctx).value.newMaxHr, null);
});

test('session validation', () => {
    assert.ok(L.validateSession(session({ peak: [167, 170, 172, 300] }), ctx).error);
    assert.ok(L.validateSession(session({ level: [0, 9, 9, 9] }), ctx).error);
    assert.ok(L.validateSession(session({ rpe: 11 }), ctx).error);
    assert.ok(L.validateSession(session({ date: '2026-02-31' }), ctx).error);
    assert.match(L.validateSession({ date: '2026-09-25' }, ctx).error, /at least one/);
    // empty strings from the form become null; a watch-only session is allowed
    const v = L.validateSession({ level: ['', '', '', ''], peak: ['', '', '', ''], rec: ['', '', '', ''], watch: { avgHR: 150 } }, ctx);
    assert.equal(v.value.date, '2026-09-30');
    assert.equal(v.value.watch.avgHR, 150);
    assert.ok(L.validateSession({ watch: { avgHR: 999 } }, ctx).error);
    assert.ok(L.validateSession({ watch: { avgHR: 150, zones: [1, 2, 3] } }, ctx).error);
    // a screenshot alone is enough to save
    assert.ok(L.validateSession({}, { ...ctx, hasScreenshot: true }).value);
});

test('lift and cardio validation', () => {
    assert.deepEqual(L.validateLift({ exercise: ' Back squat ', kg: '95', reps: '5' }, '2026-09-30').value,
        { date: '2026-09-30', exercise: 'Back squat', kg: 95, reps: 5, sets: 1 });
    assert.ok(L.validateLift({ exercise: '', kg: 95, reps: 5 }, '2026-09-30').error);
    assert.ok(L.validateLift({ exercise: 'x', kg: 95, reps: 0 }, '2026-09-30').error);
    assert.equal(L.validateCardio({ vo2: '39.5' }, '2026-09-30').value.vo2, 39.5);
    assert.ok(L.validateCardio({ vo2: 5 }, '2026-09-30').error);
});

test('week index and phases start at week 1 on the first session and advance weekly', () => {
    assert.equal(L.weekIndex('2026-09-08', '2026-09-08'), 1);
    assert.equal(L.weekIndex('2026-09-08', '2026-09-14'), 1);
    assert.equal(L.weekIndex('2026-09-08', '2026-09-15'), 2);
    assert.equal(L.weekIndex('2026-09-08', '2026-11-30'), 12);
    const idx = w => L.phaseFor(w).index;
    assert.deepEqual([1, 2, 3, 5, 6, 11, 12, 30].map(idx), [0, 0, 1, 1, 2, 2, 3, 3]);
});

const withStats = (s) => ({ ...s, stats: L.sessionStats(s) });
test('progress: this week (Mon–Sun), tiles change since first, empty log', () => {
    assert.equal(L.progress([], [], '2026-09-30').week, null);
    const a = withStats({ ...L.validateSession(session({ date: '2026-09-08', level: [8, 8, 7.5, 7], rec: [128, 133, 136, null], restingHr: 64 }), ctx).value });
    const b = withStats({ ...L.validateSession(session({ date: '2026-09-29' }), ctx).value });
    const p = L.progress([a, b], [{ vo2: 38.4 }, { vo2: 39.5 }], '2026-09-30'); // Wed; week is Mon 09-28..Sun 10-04
    assert.equal(p.week, 4);
    assert.equal(p.thisWeek, 1);
    assert.equal(p.tiles.level.change, 1.3);   // 8.9 - 7.6 (7.625 → 7.6)
    assert.equal(p.tiles.restingHr.change, -3);
    assert.equal(p.cardio.pctChange, 2.9);
});

test('screenshot reading: validates, nulls out implausible values, derives hi-zone minutes', () => {
    const ok = L.parseReading('Here you go: {"date":"2026-09-25","durationMin":31,"avgHR":152,"maxHR":174,"activeKcal":310,"zoneMinutes":[1,2.5,6,9.5,5],"cardioFitness":null}');
    assert.equal(ok.value.hiZoneMin, 14.5);
    assert.equal(ok.value.cardioFitness, null);
    const junk = L.parseReading('{"date":"tomorrow","avgHR":900,"maxHR":"lots","zoneMinutes":[1,2,3]}').value;
    assert.deepEqual([junk.date, junk.avgHR, junk.maxHR, junk.zoneMinutes, junk.hiZoneMin], [null, null, null, null, null]);
    assert.ok(L.parseReading('no json at all').error);
    assert.ok(L.parseReading('').error);
});
