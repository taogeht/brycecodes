'use strict';
// Postgres persistence for Loadout. Mirrors the spec's file layout as
// tables (config / days / ledger / requests) so the rules still hold:
//  - balances are derived (SUM over ledger), never stored
//  - the ledger is insert-only; corrections are new `adjust` rows
//  - day records are read-modify-written under SELECT … FOR UPDATE so the
//    parent and Edward can't clobber each other's edits to the same day
const crypto = require('crypto');
const tz = require('./tz');
const defaultConfig = require('./default-config');

const SCHEMA_SQL = `
    CREATE SCHEMA IF NOT EXISTS loadout;
    CREATE TABLE IF NOT EXISTS loadout.config (
        id TEXT PRIMARY KEY DEFAULT 'singleton',
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS loadout.days (
        date DATE PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS loadout.ledger (
        id BIGSERIAL PRIMARY KEY,
        at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        kind TEXT NOT NULL CHECK (kind IN ('earn', 'spend', 'adjust')),
        xp INTEGER NOT NULL DEFAULT 0,
        coins INTEGER NOT NULL DEFAULT 0,
        screen_minutes INTEGER NOT NULL DEFAULT 0,
        source JSONB NOT NULL DEFAULT '{}'::jsonb,
        note TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS loadout_ledger_at_idx ON loadout.ledger (at);
    CREATE TABLE IF NOT EXISTS loadout.requests (
        id BIGSERIAL PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('redeem', 'suggest')),
        reward_id TEXT,
        name TEXT NOT NULL,
        cost JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT NOT NULL DEFAULT 'open',
        requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ,
        note TEXT NOT NULL DEFAULT ''
    );
    -- Verbatim copy of the old chores.state blob at import time, plus the
    -- figures the migration derived from it. This is the audit trail for the
    -- opening balance; scripts/migrate-chores-to-loadout.js writes it.
    -- 'cancelled' was added in phase 3; re-assert the constraint so an
    -- earlier-bootstrapped table picks it up.
    ALTER TABLE loadout.requests DROP CONSTRAINT IF EXISTS requests_status_check;
    ALTER TABLE loadout.requests ADD CONSTRAINT requests_status_check
        CHECK (status IN ('open', 'approved', 'denied', 'cancelled'));
    CREATE TABLE IF NOT EXISTS loadout.legacy (
        id TEXT PRIMARY KEY DEFAULT 'chores',
        imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        source JSONB NOT NULL,
        summary JSONB NOT NULL
    );
`;

function newId(prefix) {
    return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

function blankDay(date) {
    return { date, packCheck: null, checkins: [] };
}

function blankPack(now, by) {
    return { writtenAt: now, writtenBy: by, items: [], submittedAt: null, awarded: null, ledgerId: null, verification: null };
}

function ledgerRow(r) {
    return {
        id: `txn_${r.id}`, at: tz.nowISO(new Date(r.at)), kind: r.kind,
        xp: r.xp, coins: r.coins, screenMinutes: r.screen_minutes, source: r.source, note: r.note,
    };
}

function requestRow(r) {
    return {
        id: `req_${r.id}`, kind: r.kind, rewardId: r.reward_id, name: r.name, cost: r.cost, status: r.status,
        requestedAt: tz.nowISO(new Date(r.requested_at)),
        resolvedAt: r.resolved_at ? tz.nowISO(new Date(r.resolved_at)) : null, note: r.note,
    };
}

module.exports = function makeStore(pool) {
    async function bootstrap() {
        await pool.query(SCHEMA_SQL);
        await pool.query(
            `INSERT INTO loadout.config (id, data) VALUES ('singleton', $1) ON CONFLICT (id) DO NOTHING`,
            [JSON.stringify(defaultConfig())]
        );
    }

    async function getConfig(client = pool) {
        const { rows } = await client.query(`SELECT data FROM loadout.config WHERE id = 'singleton'`);
        return rows.length ? rows[0].data : defaultConfig();
    }

    async function saveConfig(data) {
        await pool.query(
            `INSERT INTO loadout.config (id, data, updated_at) VALUES ('singleton', $1, NOW())
             ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
            [JSON.stringify(data)]
        );
        return data;
    }

    async function getDay(date, client = pool) {
        const { rows } = await client.query(`SELECT data FROM loadout.days WHERE date = $1`, [date]);
        return rows.length ? rows[0].data : blankDay(date);
    }

    // Run `fn(day, client)` inside a transaction holding a row lock on the
    // day. `fn` mutates `day` in place and may use `client` for ledger
    // writes so the award and the day record commit together. Whatever it
    // returns is passed back alongside the saved day.
    async function withDay(date, fn) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { rows } = await client.query(`SELECT data FROM loadout.days WHERE date = $1 FOR UPDATE`, [date]);
            const day = rows.length ? rows[0].data : blankDay(date);
            const result = await fn(day, client);
            await client.query(
                `INSERT INTO loadout.days (date, data, updated_at) VALUES ($1, $2, NOW())
                 ON CONFLICT (date) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
                [date, JSON.stringify(day)]
            );
            await client.query('COMMIT');
            return { day, result };
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            throw err;
        } finally {
            client.release();
        }
    }

    // Map of dateKey → day for from..to inclusive (only days that exist).
    async function daysBetween(from, to) {
        const { rows } = await pool.query(
            `SELECT to_char(date, 'YYYY-MM-DD') AS key, data FROM loadout.days WHERE date BETWEEN $1 AND $2 ORDER BY date`,
            [from, to]
        );
        const out = {};
        for (const r of rows) out[r.key] = r.data;
        return out;
    }

    async function appendLedger(entry, client = pool) {
        const { rows } = await client.query(
            `INSERT INTO loadout.ledger (at, kind, xp, coins, screen_minutes, source, note)
             VALUES (COALESCE($1, NOW()), $2, $3, $4, $5, $6, $7) RETURNING *`,
            [entry.at || null, entry.kind, entry.xp | 0, entry.coins | 0, entry.screenMinutes | 0,
             JSON.stringify(entry.source || {}), entry.note || '']
        );
        return ledgerRow(rows[0]);
    }

    // Derived, never stored. lifetimeXp only counts XP earned (rule: XP
    // never decreases — a negative adjust affects the balance display but
    // not level progress).
    async function balances(client = pool) {
        const { rows } = await client.query(`
            SELECT COALESCE(SUM(xp), 0)::int AS xp,
                   COALESCE(SUM(coins), 0)::int AS coins,
                   COALESCE(SUM(screen_minutes), 0)::int AS screen_minutes,
                   COALESCE(SUM(CASE WHEN xp > 0 THEN xp ELSE 0 END), 0)::int AS lifetime_xp
            FROM loadout.ledger`);
        const r = rows[0];
        return { xp: r.xp, coins: r.coins, screenMinutes: r.screen_minutes, lifetimeXp: r.lifetime_xp };
    }

    async function ledger({ limit = 100 } = {}) {
        const { rows } = await pool.query(`SELECT * FROM loadout.ledger ORDER BY id DESC LIMIT $1`, [limit]);
        return rows.map(ledgerRow);
    }

    async function requests({ status, limit = 200 } = {}) {
        const { rows } = status
            ? await pool.query(`SELECT * FROM loadout.requests WHERE status = $1 ORDER BY id DESC LIMIT $2`, [status, limit])
            : await pool.query(`SELECT * FROM loadout.requests ORDER BY id DESC LIMIT $1`, [limit]);
        return rows.map(requestRow);
    }

    async function createRequest({ kind, rewardId = null, name, cost = {}, note = '' }) {
        const { rows } = await pool.query(
            `INSERT INTO loadout.requests (kind, reward_id, name, cost, note) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [kind, rewardId, name, JSON.stringify(cost), note]);
        return requestRow(rows[0]);
    }

    // Lock one request row and resolve it inside fn(row, client). fn returns
    // { status, note?, extra? } to write, or { refuse } to leave it untouched.
    async function resolveRequest(id, fn) {
        const num = Number(String(id).replace(/^req_/, ''));
        if (!Number.isInteger(num)) return { missing: true };
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { rows } = await client.query(`SELECT * FROM loadout.requests WHERE id = $1 FOR UPDATE`, [num]);
            if (!rows.length) { await client.query('ROLLBACK'); return { missing: true }; }
            const req = requestRow(rows[0]);
            const out = await fn(req, client);
            if (out && out.status) {
                const { rows: upd } = await client.query(
                    `UPDATE loadout.requests SET status = $2, resolved_at = NOW(), note = $3 WHERE id = $1 RETURNING *`,
                    [num, out.status, out.note || req.note]);
                out.request = requestRow(upd[0]);
            } else if (out) {
                out.request = req;
            }
            await client.query('COMMIT');
            return out || { request: req };
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            throw err;
        } finally {
            client.release();
        }
    }

    return {
        bootstrap, getConfig, saveConfig, getDay, withDay, daysBetween,
        appendLedger, balances, ledger, requests, createRequest, resolveRequest,
        newId, blankDay, blankPack, ledgerRow, requestRow, pool,
    };
};
