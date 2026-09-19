'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const tz = require('../lib/tz');

test('dateKey uses Taipei, not UTC', () => {
    // 2026-09-19T22:30Z is already 2026-09-20 06:30 in Taipei
    assert.equal(tz.dateKey(new Date('2026-09-19T22:30:00Z')), '2026-09-20');
    assert.equal(tz.dateKey(new Date('2026-09-19T15:59:00Z')), '2026-09-19');
});

test('nowISO carries the +08:00 offset and local wall time', () => {
    assert.equal(tz.nowISO(new Date('2026-09-19T07:41:00Z')), '2026-09-19T15:41:00+08:00');
    assert.equal(tz.nowISO(new Date('2026-09-19T16:00:00Z')), '2026-09-20T00:00:00+08:00');
});

test('weekday / addDays / mondayOf are pure calendar arithmetic', () => {
    assert.equal(tz.weekday('2026-09-19'), 'sat');
    assert.equal(tz.weekday('2026-09-21'), 'mon');
    assert.equal(tz.addDays('2026-09-30', 1), '2026-10-01');
    assert.equal(tz.addDays('2026-01-01', -1), '2025-12-31');
    assert.equal(tz.mondayOf('2026-09-19'), '2026-09-14');
    assert.equal(tz.mondayOf('2026-09-20'), '2026-09-14'); // sunday belongs to the week before
    assert.equal(tz.mondayOf('2026-09-21'), '2026-09-21');
});

test('isDateKey rejects malformed and impossible dates', () => {
    assert.equal(tz.isDateKey('2026-09-19'), true);
    assert.equal(tz.isDateKey('2026-02-30'), false);
    assert.equal(tz.isDateKey('2026-9-1'), false);
    assert.equal(tz.isDateKey('../etc'), false);
});
