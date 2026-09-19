'use strict';
// Day-boundary helpers. Every "what day is it" decision in Loadout goes
// through here so the answer is always Asia/Taipei local time, never the
// server's clock or UTC date arithmetic.

const DEFAULT_TZ = 'Asia/Taipei';
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const fmtCache = new Map();
function partsFormatter(tz) {
    if (!fmtCache.has(tz)) {
        fmtCache.set(tz, new Intl.DateTimeFormat('en-US', {
            timeZone: tz, hourCycle: 'h23',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        }));
    }
    return fmtCache.get(tz);
}

// { year, month, day, hour, minute, second } as numbers, in tz.
function localParts(date = new Date(), tz = DEFAULT_TZ) {
    const out = {};
    for (const p of partsFormatter(tz).formatToParts(date)) {
        if (p.type !== 'literal') out[p.type] = Number(p.value);
    }
    return out;
}

const pad = n => String(n).padStart(2, '0');

// 'YYYY-MM-DD' for the instant `date`, in tz.
function dateKey(date = new Date(), tz = DEFAULT_TZ) {
    const p = localParts(date, tz);
    return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

// Offset of tz from UTC at `date`, in minutes (Taipei is +480 year-round).
function offsetMinutes(date = new Date(), tz = DEFAULT_TZ) {
    const p = localParts(date, tz);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return Math.round((asUtc - date.getTime()) / 60000);
}

// ISO 8601 with the local offset, second precision: 2026-09-19T15:41:00+08:00
function nowISO(date = new Date(), tz = DEFAULT_TZ) {
    const p = localParts(date, tz);
    const off = offsetMinutes(date, tz);
    const sign = off < 0 ? '-' : '+';
    const abs = Math.abs(off);
    return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}` +
        `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function isDateKey(s) {
    if (typeof s !== 'string' || !DATE_KEY_RE.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// 'mon' … 'sun' for a date key. Pure calendar arithmetic — a date key has
// no timezone, so this is safe to do in UTC.
function weekday(key) {
    const [y, m, d] = key.split('-').map(Number);
    return DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function addDays(key, n) {
    const [y, m, d] = key.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

// Monday of the week containing `key`.
function mondayOf(key) {
    const idx = (DAY_NAMES.indexOf(weekday(key)) + 6) % 7; // mon=0 … sun=6
    return addDays(key, -idx);
}

module.exports = { DEFAULT_TZ, DAY_NAMES, dateKey, nowISO, isDateKey, weekday, addDays, mondayOf, offsetMinutes };
