'use strict';
// Parent HQ gate: a single PIN (env HQ_PIN) exchanged for an HttpOnly
// cookie. No user system. With HQ_PIN unset the gate is open — fine for
// local dev, logged loudly so it isn't missed in prod.
const crypto = require('crypto');

const COOKIE = 'loadout_hq';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const MAX_FAILS = 5;
const LOCK_MS = 60 * 1000;

function parseCookies(req) {
    const out = {};
    const raw = req.headers.cookie;
    if (!raw) return out;
    for (const part of raw.split(';')) {
        const i = part.indexOf('=');
        if (i < 0) continue;
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
}

function safeEqual(a, b) {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

module.exports = function makeAuth({ pin = process.env.HQ_PIN, secret = process.env.HQ_SECRET } = {}) {
    const enabled = !!pin;
    if (!enabled) console.warn('[loadout] HQ_PIN is not set — parent HQ is open to anyone.');
    const token = enabled
        ? crypto.createHmac('sha256', secret || pin).update('hq-session-v1').digest('hex')
        : null;
    const fails = new Map(); // ip → { n, until }

    function isHq(req) {
        if (!enabled) return true;
        const c = parseCookies(req)[COOKIE];
        return !!c && safeEqual(c, token);
    }

    function requireHq(req, res, next) {
        if (isHq(req)) return next();
        res.status(401).json({ error: 'hq-auth', message: 'Parent PIN required.' });
    }

    function isSecure(req) {
        return req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
    }

    function login(req, res) {
        if (!enabled) return res.json({ hq: true, open: true });
        const ip = req.ip || 'unknown';
        const f = fails.get(ip);
        if (f && f.until > Date.now()) {
            return res.status(429).json({ error: 'locked', message: 'Too many tries. Wait a minute.' });
        }
        const given = String(req.body && req.body.pin || '');
        if (!safeEqual(given, pin)) {
            const n = (f && f.until <= Date.now() ? 0 : (f ? f.n : 0)) + 1;
            fails.set(ip, { n, until: n >= MAX_FAILS ? Date.now() + LOCK_MS : 0 });
            return res.status(401).json({ error: 'bad-pin', message: 'Wrong PIN.' });
        }
        fails.delete(ip);
        res.setHeader('Set-Cookie',
            `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${isSecure(req) ? '; Secure' : ''}`);
        res.json({ hq: true, open: false });
    }

    function logout(req, res) {
        res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
        res.json({ hq: false });
    }

    function session(req, res) {
        res.json({ hq: isHq(req), open: !enabled });
    }

    return { enabled, isHq, requireHq, login, logout, session };
};
