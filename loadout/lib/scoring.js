'use strict';
// The scoring rules from the spec (§5). Pure functions over config + day
// records — no I/O — so the rules the app "must not get subtly wrong" are
// unit-testable in isolation. See loadout/test/scoring.test.js.

const { weekday, addDays } = require('./tz');

const ZERO = Object.freeze({ xp: 0, coins: 0, screenMinutes: 0 });

function award(xp, coins, screenMinutes) {
    return { xp: xp | 0, coins: coins | 0, screenMinutes: screenMinutes | 0 };
}

function addAwards(a, b) {
    return award(a.xp + b.xp, a.coins + b.coins, a.screenMinutes + b.screenMinutes);
}

function questById(config, id) {
    return (config.quests || []).find(q => q.id === id) || null;
}

function powerUpById(config, id) {
    return (config.powerUps || []).find(p => p.id === id) || null;
}

// Quests that are on the board for a given date key. A quest with no
// activeDays is treated as every day.
function questsActiveOn(config, dateKey) {
    const wd = weekday(dateKey);
    return (config.quests || []).filter(q =>
        q.enabled !== false && (!Array.isArray(q.activeDays) || q.activeDays.length === 0 || q.activeDays.includes(wd)));
}

// Rule 3: pack check pays for the logging, not the score. At least one item
// ticked → full award. Verification never touches this.
function packAward(config, packCheck) {
    const quest = questById(config, 'pack-check');
    if (!quest) return null;
    const ticked = (packCheck && packCheck.items || []).filter(i => i.checked).length;
    if (ticked === 0) return null;
    return award(quest.xp, quest.coins, quest.screenMinutes);
}

// Rules 1 + 2. Returns { targetMet, base, powerUps, total }.
//  - base pays only when the target is met (externalXp / duration / simple / count).
//  - power-ups pay additively and independently of the outcome.
function checkinAward(config, quest, { value = null, powerUps = [] } = {}) {
    let targetMet;
    let base = ZERO;
    switch (quest.kind) {
        case 'externalXp':
        case 'duration':
            targetMet = Number(value) >= Number(quest.target || 0) && Number(value) > 0;
            if (targetMet) base = award(quest.xp, quest.coins, quest.screenMinutes);
            break;
        case 'count': {
            // Legacy quantity chores (e.g. pushups at 1 coin each): pays per unit,
            // no target. Any positive value counts as done.
            const n = Math.max(0, Number(value) || 0);
            targetMet = n > 0;
            const per = quest.perUnit || ZERO;
            base = award((per.xp || 0) * n, (per.coins || 0) * n, (per.screenMinutes || 0) * n);
            break;
        }
        case 'simple':
        default:
            targetMet = true;
            base = award(quest.xp, quest.coins, quest.screenMinutes);
    }
    const allowed = new Set(quest.powerUps || []);
    let pu = ZERO;
    const applied = [];
    for (const id of new Set(powerUps || [])) {
        if (!allowed.has(id)) continue;
        const p = powerUpById(config, id);
        if (!p) continue;
        applied.push(id);
        pu = addAwards(pu, award(p.xp, p.coins, p.screenMinutes));
    }
    return { targetMet, base, powerUps: pu, applied, total: addAwards(base, pu) };
}

// Rule 5: levels come from lifetime XP, never the current balance.
function levelFor(config, lifetimeXp) {
    const per = Math.max(1, Number(config.levels && config.levels.xpPerLevel) || 400);
    const xp = Math.max(0, lifetimeXp | 0);
    const level = Math.floor(xp / per) + 1;
    return { level, into: xp % per, perLevel: per, next: (level) * per };
}

// Quests that must be logged for a day to count toward the streak.
//  - only enabled, daily-cadence quests with requiredForStreak !== false
//  - pack check only counts as required once a list exists for that day;
//    the parent forgetting to write the list shouldn't break Edward's streak.
function requiredForStreak(config, day, dateKey) {
    return questsActiveOn(config, dateKey).filter(q => {
        if (q.requiredForStreak === false) return false;
        if ((q.cadence || 'daily') !== 'daily') return false;
        if (q.kind === 'packCheck') {
            const items = day && day.packCheck && day.packCheck.items || [];
            return items.length > 0;
        }
        return true;
    });
}

function questLogged(day, quest) {
    if (quest.kind === 'packCheck') {
        return !!(day && day.packCheck && day.packCheck.submittedAt);
    }
    return (day && day.checkins || []).some(c => c.questId === quest.id && c.targetMet !== false);
}

// null = exempt (nothing required), true/false = complete/incomplete.
function dayComplete(config, day, dateKey) {
    const required = requiredForStreak(config, day, dateKey);
    if (required.length === 0) return null;
    return required.every(q => questLogged(day, q));
}

// Consecutive complete days walking back from today. Today counts if
// already complete but doesn't break the streak while still in progress.
// Exempt days (nothing required) are skipped. `daysByKey` is a map of
// dateKey → day record; missing keys are treated as empty days.
function streak(config, daysByKey, todayKey, maxLookback = 400) {
    let n = 0;
    let key = todayKey;
    let first = true;
    for (let i = 0; i < maxLookback; i++, key = addDays(key, -1)) {
        const c = dayComplete(config, daysByKey[key], key);
        if (c === null) { first = false; continue; }
        if (c) { n++; first = false; continue; }
        if (first) { first = false; continue; } // today, still in progress
        break;
    }
    return n;
}

module.exports = {
    ZERO, award, addAwards, questById, powerUpById, questsActiveOn,
    packAward, checkinAward, levelFor, requiredForStreak, questLogged, dayComplete, streak,
};
