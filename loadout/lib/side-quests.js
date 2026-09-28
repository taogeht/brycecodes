'use strict';

const POWER_UPS = [
    { id: 'started-promptly', label: 'I started without a battle', sub: 'Sat down and got going.', xp: 3 },
    { id: 'stayed-with-hard', label: 'I stayed with something hard', sub: 'Kept going past the annoying part.', xp: 3 },
    { id: 'wrote-it-down', label: 'I wrote the tricky part down', sub: 'Made my thinking visible.', xp: 2 },
    { id: 'asked-for-help', label: 'I asked for help when stuck', sub: 'Rather than sitting there stuck.', xp: 2 },
];
const ASSIGNMENTS = {
    'math-academy': POWER_UPS.map(p => p.id),
    reading: ['started-promptly'],
    piano: ['started-promptly', 'stayed-with-hard'],
};

// Restore once from the pre-economy archive. Later parent edits survive restarts.
function restore(config, archived) {
    if (config.economyVersion !== 2 || config.sideQuestsVersion === 1) return config;
    const cfg = structuredClone(config);
    const definitions = archived?.powerUps?.length ? archived.powerUps : POWER_UPS;
    cfg.powerUps = [...(cfg.powerUps || [])];
    for (const p of definitions) {
        if (!cfg.powerUps.some(x => x.id === p.id)) cfg.powerUps.push({ ...p, coins: 0, screenMinutes: 0 });
    }
    const known = new Set(cfg.powerUps.map(p => p.id));
    for (const q of cfg.quests) {
        const old = archived?.quests?.find(x => x.id === q.id);
        const ids = old ? old.powerUps || [] : ASSIGNMENTS[q.id] || [];
        q.powerUps = [...new Set([...(q.powerUps || []), ...ids.filter(id => known.has(id))])];
    }
    cfg.sideQuestsVersion = 1;
    return cfg;
}

module.exports = { POWER_UPS, ASSIGNMENTS, restore };
