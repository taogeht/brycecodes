#!/usr/bin/env node
'use strict';
// One-shot import of the old Mission Control chore tracker into Loadout.
//
//   DATABASE_URL=… node scripts/migrate-chores-to-loadout.js --dry-run
//   DATABASE_URL=… node scripts/migrate-chores-to-loadout.js
//   node scripts/migrate-chores-to-loadout.js --input chores-export.json --dry-run
//
// What it does (spec §9 phase 0):
//   1. reads the chores.state singleton (or --input <file> from GET /api/chores)
//   2. maps each chore to a Loadout quest, appended to loadout.config
//        daily/3x/4x/weekly → cadence + timesPerWeek; quantity → kind 'count'
//        NT per chore → coins (1 coin = 1 TWD); xp 0; requiredForStreak false
//   3. writes the opening balance as ONE ledger `adjust` entry:
//        sum of every week's `saved` half (spend half is treated as paid out)
//   4. stores the original blob verbatim in loadout.legacy as the audit trail
//
// Idempotent: refuses to run if loadout.legacy already has the 'chores' row.
// Never touches chores.state — drop that schema by hand once you're happy.

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const makeStore = require('../loadout/lib/store');
const tz = require('../loadout/lib/tz');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const inputIdx = args.indexOf('--input');
const INPUT = inputIdx >= 0 ? args[inputIdx + 1] : null;

function slug(name, taken) {
    let base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chore';
    let s = base, n = 2;
    while (taken.has(s)) s = `${base}-${n++}`;
    taken.add(s);
    return s;
}

function mapChore(chore, taken) {
    const nt = Number(chore.nt) || 0;
    const timesPerWeek = chore.type === '3x' ? 3
        : (chore.type === '4x' || chore.type === 'recycling') ? (Number(chore.slots) || 4)
        : chore.type === 'weekly' ? 1 : undefined;
    const q = {
        id: slug(chore.name, taken),
        name: chore.name,
        kind: chore.quantity ? 'count' : 'simple',
        xp: 0, coins: chore.quantity ? 0 : nt, screenMinutes: 0,
        activeDays: [],                                   // every day
        cadence: chore.type === 'daily' ? 'daily' : 'weekly',
        powerUps: [],
        requiresParentConfirm: false,
        requiredForStreak: false,                         // chores don't gate the streak
        enabled: true,
        legacy: { id: chore.id, type: chore.type, nt },
    };
    if (timesPerWeek) q.timesPerWeek = timesPerWeek;
    if (chore.quantity) {
        q.perUnit = { xp: 0, coins: nt, screenMinutes: 0 };
        q.unitLabel = chore.name.toLowerCase();
    }
    return q;
}

function plan(state) {
    const weeks = Array.isArray(state.weeks) ? state.weeks : [];
    const chores = Array.isArray(state.chores) ? state.chores : [];
    const earned = weeks.reduce((a, w) => a + (Number(w.earned) || 0), 0);
    const saved = weeks.reduce((a, w) => a + (w.saved != null ? Number(w.saved) : Math.floor((Number(w.earned) || 0) / 2)), 0);
    const taken = new Set();
    return {
        quests: chores.map(c => mapChore(c, taken)),
        summary: {
            weeks: weeks.length,
            weeksWithChecks: weeks.filter(w => Object.keys(w.checks || {}).length).length,
            anchorMonday: state.anchorMonday || null,
            chores: chores.length,
            lifetimeEarnedNT: earned,
            openingCoins: saved,
            rule: 'opening coins = sum of weekly saved halves; spend halves assumed already paid out; 1 coin = 1 TWD',
        },
    };
}

async function main() {
    let state;
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const store = makeStore(pool);

    if (INPUT) {
        state = JSON.parse(fs.readFileSync(path.resolve(INPUT), 'utf8'));
        console.log(`source: ${INPUT}`);
    } else {
        if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (or pass --input <file>)');
        const { rows } = await pool.query(`SELECT data FROM chores.state WHERE id = 'singleton'`);
        if (!rows.length) throw new Error('chores.state has no singleton row — nothing to import');
        state = rows[0].data;
        console.log('source: chores.state (singleton)');
    }

    const p = plan(state);
    console.log('\nsummary:', JSON.stringify(p.summary, null, 2));
    console.log('\nquests to add:');
    for (const q of p.quests) {
        const pay = q.kind === 'count' ? `${q.perUnit.coins} coin/${q.unitLabel}` : `${q.coins} coins`;
        console.log(`  ${q.id.padEnd(24)} ${q.kind.padEnd(7)} ${q.cadence}${q.timesPerWeek ? ' x' + q.timesPerWeek : ''}  ${pay}`);
    }
    console.log(`\nopening balance: +${p.summary.openingCoins} coins (adjust entry)`);

    if (DRY || !process.env.DATABASE_URL) {
        console.log('\n--dry-run: nothing written.');
        await pool.end();
        return;
    }

    await store.bootstrap();
    const existing = await pool.query(`SELECT imported_at FROM loadout.legacy WHERE id = 'chores'`);
    if (existing.rows.length) {
        throw new Error(`already imported at ${existing.rows[0].imported_at} — refusing to run twice`);
    }

    const before = await store.balances();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const cfg = await store.getConfig(client);
        const have = new Set(cfg.quests.map(q => q.id));
        const added = p.quests.filter(q => !have.has(q.id));
        cfg.quests.push(...added);
        cfg.coinValue = cfg.coinValue || { currency: 'TWD', perCoin: 1 };
        await client.query(
            `UPDATE loadout.config SET data = $1, updated_at = NOW() WHERE id = 'singleton'`, [JSON.stringify(cfg)]);
        const txn = await store.appendLedger({
            kind: 'adjust', xp: 0, coins: p.summary.openingCoins, screenMinutes: 0,
            source: { type: 'legacy-import', from: 'chores.state' },
            note: `Opening balance from Mission Control: ${p.summary.weeks} weeks, ${p.summary.lifetimeEarnedNT} NT earned, saved half carried over`,
        }, client);
        await client.query(
            `INSERT INTO loadout.legacy (id, source, summary) VALUES ('chores', $1, $2)`,
            [JSON.stringify(state), JSON.stringify({ ...p.summary, ledgerId: txn.id, questIds: added.map(q => q.id), importedAt: tz.nowISO() })]);
        await client.query('COMMIT');
        console.log(`\nwrote ${added.length} quests, ledger ${txn.id}, legacy blob`);
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }

    // Verify against the source before declaring victory.
    const after = await store.balances();
    const delta = after.coins - before.coins;
    if (delta !== p.summary.openingCoins) {
        throw new Error(`VERIFY FAILED: coin balance moved by ${delta}, expected ${p.summary.openingCoins}`);
    }
    const cfg = await store.getConfig();
    const missing = p.quests.filter(q => !cfg.quests.some(c => c.id === q.id));
    if (missing.length) throw new Error(`VERIFY FAILED: quests missing after write: ${missing.map(q => q.id)}`);
    console.log(`verified: coins ${before.coins} → ${after.coins}, ${cfg.quests.length} quests in config`);
    await pool.end();
}

main().catch(err => { console.error('\nmigration failed:', err.message); process.exit(1); });
