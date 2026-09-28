#!/usr/bin/env node
'use strict';
// Compatibility entrypoint. Normal server startup runs the same V2 upgrade.
// --dry-run only reads the old source; --input is supported for offline review.
const fs = require('fs');
const { Pool } = require('pg');
const makeStore = require('../loadout/lib/store');
const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const input = args.includes('--input') ? args[args.indexOf('--input') + 1] : null;
(async () => {
    if (input && !dry) throw new Error('--input is for --dry-run only; the live upgrade reads the database source.');
    if (!input && !process.env.DATABASE_URL) throw new Error('Set DATABASE_URL or use --input file.json --dry-run.');
    const pool = input ? null : new Pool({ connectionString: process.env.DATABASE_URL });
    try {
        if (dry) {
            const source = input ? JSON.parse(fs.readFileSync(input, 'utf8'))
                : (await pool.query("SELECT data FROM chores.state WHERE id='singleton'")).rows[0]?.data;
            if (!source) throw new Error('No old chores source found.');
            const weeks = source.weeks || [];
            const earned = weeks.reduce((n,w) => n + (Number(w.earned) || 0), 0);
            const savings = weeks.reduce((n,w) => n + (w.saved != null ? Number(w.saved) : Math.floor((Number(w.earned) || 0)/2)), 0);
            console.log(JSON.stringify({ dryRun: true, weeks: weeks.length, chores: source.chores,
                oldChoreEarned: earned, oldChoreSavings: savings, oldChoreCashPaid: earned-savings,
                oldChoreUnpaid: 0, note: 'Source review only. Startup also reconciles existing Loadout balances and retains its XP.' }, null, 2));
        } else {
            const store = makeStore(pool);
            await store.bootstrap();
            const e = await store.earnings();
            console.log(JSON.stringify({ economyVersion: 2, lifetimeEarned: e.lifetimeEarned,
                cashPaid: e.cashPaid, savingsPaid: e.savingsPaid, unpaid: e.unpaid }, null, 2));
        }
    } finally { if (pool) await pool.end(); }
})().catch(err => { console.error(err.message); process.exitCode = 1; });
