'use strict';
const tz = require('./tz');
const CHORES = [
    ['wipe-the-table', 'Wipe the table', 5, 'daily'],
    ['take-out-garbage', 'Take out garbage', 10, 'daily'],
    ['put-clothes-away', 'Put clothes away', 10, 'daily'],
    ['take-out-recycling', 'Take out recycling', 20, '4x'],
    ['pushups', 'Pushups', 1, 'daily', true],
    ['clean-bathroom', 'Clean bathroom', 100, 'weekly'],
    ['dust-tidy-living-room', 'Dust / tidy living room', 100, 'weekly'],
    ['floss', 'Floss', 10, 'daily'],
].map(([id, name, nt, type, quantity = false]) => ({ id, name, nt, type, quantity }));

function choreQuest(c) {
    return {
        id: String(c.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        name: c.name, kind: c.quantity ? 'count' : 'simple',
        xp: 0, coins: c.quantity ? 0 : Number(c.nt), screenMinutes: 0,
        ...(c.quantity ? { perUnit: { xp: 0, coins: Number(c.nt), screenMinutes: 0 }, unitLabel: c.name.toLowerCase() } : {}),
        cadence: c.type === 'daily' ? 'daily' : 'weekly',
        timesPerWeek: c.type === '3x' ? 3 : ['4x', 'recycling'].includes(c.type) ? Number(c.slots) || 4 : 1,
        activeDays: [], enabled: true, requiredForStreak: false, requiresParentConfirm: false,
        powerUps: [], legacy: { id: c.id, type: c.type, nt: Number(c.nt) },
    };
}
function upgradeConfig(original, chores = CHORES) {
    const cfg = structuredClone(original);
    cfg.economyVersion = 2;
    cfg.bank = { share: 0.5 };
    cfg.coinValue = { currency: 'TWD', perCoin: 1 };
    cfg.quests = cfg.quests.map(q => {
        if (q.kind === 'packCheck') return { ...q, xp: 0, coins: 0, screenMinutes: 0, powerUps: [] };
        if (q.kind === 'duration' || q.kind === 'externalXp') return {
            ...q, kind: 'duration', xpPerMinute: 1, unitLabel: 'minutes',
            name: q.id === 'power-moves' ? 'Sports / outdoors' : q.name,
            xp: 0, coins: 0, screenMinutes: 0, powerUps: [],
        };
        return { ...q, xp: 0, screenMinutes: 0, powerUps: [],
            ...(q.perUnit ? { perUnit: { ...q.perUnit, xp: 0, screenMinutes: 0 } } : {}) };
    });
    for (const c of chores) {
        const q = choreQuest(c);
        if (!cfg.quests.some(x => x.legacy?.id === c.id || x.id === q.id)) cfg.quests.push(q);
    }
    cfg.powerUps = [];
    cfg.rewards = cfg.rewards.map(r => ({ ...r,
        cost: { xp: r.cost?.xp ?? ((r.cost?.coins || 0) + (r.cost?.screenMinutes || 0)) },
        ...(r.id === 'pocket-money' ? { enabled: false, note: 'Chore money is paid weekly from Earnings.' } : {}),
    }));
    return cfg;
}
function validateConfig(cfg) {
    if (cfg.economyVersion !== 2) return 'Reload this page before saving the new earning rules.';
    for (const q of cfg.quests) {
        if (!['packCheck', 'duration', 'simple', 'count'].includes(q.kind)) return 'Use minutes for activities, or simple/count for chores.';
        const n = v => Number.isSafeInteger(v) && v >= 0 && v <= 100000;
        if (q.kind === 'duration' && (!n(q.xpPerMinute) || q.xpPerMinute < 1 || q.xpPerMinute > 100)) return 'Activity XP per minute must be a whole number from 1 to 100.';
        if (q.kind === 'simple' && !n(q.coins)) return 'Chore pay must be a non-negative whole NT amount.';
        if (q.kind === 'count' && !n(q.perUnit?.coins)) return 'Per-unit pay must be a non-negative whole NT amount.';
    }
    for (const r of cfg.rewards) {
        if (!Number.isSafeInteger(r.cost?.xp) || r.cost.xp <= 0 || r.cost.xp > 100000 || r.cost.coins || r.cost.screenMinutes) return 'Rewards need a positive whole XP cost (maximum 100,000).';
    }
    return null;
}

// Called once in a transaction. The original blob and all ledger rows survive.
// Historical money is considered paid, as requested by the parent.
async function migrate(client, config) {
    if (config.economyVersion === 2) return;
    const imported = await client.query("SELECT source, summary FROM loadout.legacy WHERE id = 'chores'");
    let source = imported.rows[0]?.source;
    if (!source) {
        const exists = await client.query("SELECT to_regclass('chores.state') AS name");
        if (exists.rows[0].name) source = (await client.query("SELECT data FROM chores.state WHERE id = 'singleton'")).rows[0]?.data;
    }
    const weeks = (source?.weeks || []).map((w, i) => ({
        week: source.anchorMonday ? tz.addDays(source.anchorMonday, i * 7) : null,
        earned: Number(w.earned) || 0,
        savings: w.saved != null ? Number(w.saved) : Math.floor((Number(w.earned) || 0) / 2),
    })).map(w => ({ ...w, cash: w.earned - w.savings, status: 'paid', historical: true }));
    const earned = weeks.reduce((a, w) => a + w.earned, 0);
    const saved = weeks.reduce((a, w) => a + w.savings, 0);
    const old = (await client.query(`SELECT COALESCE(SUM(coins),0)::int AS coins,
        COALESCE(SUM(bank),0)::int AS bank,
        COALESCE(SUM(coins + bank) FILTER (WHERE kind IN ('earn','adjust') AND source->>'type' NOT IN ('legacy-import')),0)::int AS earned
        FROM loadout.ledger`)).rows[0];
    const days = await client.query('SELECT date,data FROM loadout.days');
    const requests = await client.query("SELECT * FROM loadout.requests WHERE status='open'");
    await client.query(`INSERT INTO loadout.legacy(id,source,summary) VALUES('economy-v1',$1,$2)`,
        [JSON.stringify({ config, days: days.rows, requests: requests.rows }), JSON.stringify({ oldBalances: old, migratedAt: tz.nowISO() })]);
    const cfg = upgradeConfig(config, source?.chores || CHORES);
    const oldSavings = old.bank - (imported.rows.length ? Number(imported.rows[0].summary.openingBank) || 0 : 0);
    cfg.earningsOpening = { earned: earned + old.earned, cash: earned - saved + old.earned - oldSavings,
        savings: saved + oldSavings,
        weeks, previousLoadoutEarned: old.earned, migratedAt: tz.nowISO() };
    const bankDelta = imported.rows.length ? 0 : saved;
    await client.query(`INSERT INTO loadout.ledger(kind,coins,bank,source,note) VALUES ('adjust',$1,$2,$3,$4)`,
        [-old.coins, bankDelta, JSON.stringify({ type: 'economy-opening' }), 'Historical earnings settled: cash paid and savings recorded.']);
    if (source && !imported.rows.length) await client.query(`INSERT INTO loadout.legacy(id,source,summary) VALUES ('chores',$1,$2)`,
        [JSON.stringify(source), JSON.stringify({ lifetimeEarnedNT: earned, openingBank: saved, openingCoins: 0, allPaid: true })]);
    for (const row of days.rows) {
        for (const c of row.data.checkins || []) {
            c.settledBeforeEconomy = true;
            c.status = 'adjusted';
            c.note = 'Historical check-in, settled before the new earning rules.';
        }
        await client.query('UPDATE loadout.days SET data=$2 WHERE date=$1', [row.date, JSON.stringify(row.data)]);
    }
    await client.query(`UPDATE loadout.requests SET status='cancelled',resolved_at=NOW(),note='Earning rules changed: please request again using XP.' WHERE status='open'`);
    await client.query(`UPDATE loadout.config SET data=$1,updated_at=NOW() WHERE id='singleton'`, [JSON.stringify(cfg)]);
}
module.exports = { CHORES, choreQuest, upgradeConfig, validateConfig, migrate };
