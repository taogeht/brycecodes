'use strict';
const { CHORES, choreQuest } = require('./economy');
const { POWER_UPS, ASSIGNMENTS } = require('./side-quests');
const ALL = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAYS = ALL.slice(0, 5);

module.exports = function defaultConfig() {
    return {
        economyVersion: 2,
        child: { name: 'Edward', timezone: 'Asia/Taipei' },
        levels: { curve: 'linear', xpPerLevel: 400 },
        coinValue: { currency: 'TWD', perCoin: 1 },
        bank: { share: 0.5 },
        pack: { mode: 'paper', recurringItems: [] },
        quests: [
            { id: 'pack-check', name: 'Pack check', kind: 'packCheck', xp: 0, coins: 0,
                screenMinutes: 0, activeDays: WEEKDAYS, requiresParentConfirm: false, enabled: true },
            ...[
                ['math-academy', 'Math Academy', 30], ['reading', 'Reading', 20],
                ['piano', 'Piano', 20], ['power-moves', 'Sports / outdoors', 30],
            ].map(([id, name, target]) => ({ id, name, target, kind: 'duration', unitLabel: 'minutes',
                xpPerMinute: 1, xp: 0, coins: 0, screenMinutes: 0, powerUps: ASSIGNMENTS[id] || [],
                activeDays: id === 'piano' ? WEEKDAYS : ALL,
                requiresParentConfirm: id === 'piano', enabled: true })),
            ...CHORES.map(choreQuest),
        ],
        powerUps: POWER_UPS.map(p => ({ ...p, coins: 0, screenMinutes: 0 })),
        rewards: [
            { id: 'game-pass-30', name: '30 min game pass', cost: { xp: 30 }, enabled: true },
            { id: 'friday-dinner', name: 'Pick Friday dinner', cost: { xp: 35 }, enabled: true },
            { id: 'basketball', name: 'New basketball', cost: { xp: 500 }, enabled: true, savingsGoal: true },
            { id: 'm5stack', name: 'M5Stack parts fund', cost: { xp: 800 }, enabled: true, savingsGoal: true },
        ],
    };
};
