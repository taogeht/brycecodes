'use strict';
// Seed config (spec §4). Inserted into loadout.config on first start when no
// row exists; after that the HQ screens own it. Legacy chores are appended by
// scripts/migrate-chores-to-loadout.js, not here.

const ALL = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];

module.exports = function defaultConfig() {
    return {
        child: { name: 'Edward', timezone: 'Asia/Taipei' },
        levels: { curve: 'linear', xpPerLevel: 400 },
        // 1 coin = 1 TWD. Set once; changing it retroactively moves the savings
        // goals under him.
        coinValue: { currency: 'TWD', perCoin: 1 },
        // Pack check runs on paper at school: parent prints the slip from
        // /hq/list, Edward ticks at his locker, transcribes into /pack at home.
        pack: {
            mode: 'paper',
            recurringItems: [],
        },
        quests: [
            {
                id: 'pack-check', name: 'Pack check', kind: 'packCheck',
                xp: 10, coins: 2, screenMinutes: 0,
                activeDays: WEEKDAYS, requiresParentConfirm: false, enabled: true,
            },
            {
                id: 'math-academy', name: 'Math Academy', kind: 'externalXp',
                target: 30, unitLabel: 'Math Academy XP',
                xp: 8, coins: 2, screenMinutes: 10,
                powerUps: ['started-promptly', 'stayed-with-hard', 'wrote-it-down', 'asked-for-help'],
                activeDays: ALL, requiresParentConfirm: false, enabled: true,
            },
            {
                id: 'reading', name: 'Reading', kind: 'duration',
                target: 20, unitLabel: 'minutes',
                xp: 8, coins: 2, screenMinutes: 10,
                powerUps: ['started-promptly'],
                activeDays: ALL, requiresParentConfirm: false, enabled: true,
            },
            {
                id: 'piano', name: 'Piano', kind: 'duration',
                target: 20, unitLabel: 'minutes',
                xp: 8, coins: 2, screenMinutes: 10,
                powerUps: ['started-promptly', 'stayed-with-hard'],
                activeDays: WEEKDAYS, requiresParentConfirm: true, enabled: true,
            },
            {
                id: 'power-moves', name: 'Power moves', kind: 'duration',
                target: 30, unitLabel: 'minutes outside',
                xp: 8, coins: 2, screenMinutes: 10,
                powerUps: [],
                activeDays: ALL, requiresParentConfirm: false, enabled: true,
            },
        ],
        powerUps: [
            { id: 'started-promptly', label: 'I started without a battle', sub: 'Sat down and got going.', xp: 3, coins: 1 },
            { id: 'stayed-with-hard', label: 'I stayed with something hard', sub: 'Kept going past the annoying part.', xp: 3, coins: 1 },
            { id: 'wrote-it-down', label: 'I wrote the tricky part down', sub: 'Made my thinking visible.', xp: 2, coins: 0 },
            { id: 'asked-for-help', label: 'I asked for help when stuck', sub: 'Rather than sitting there stuck.', xp: 2, coins: 0 },
        ],
        rewards: [
            { id: 'game-pass-30', name: '30 min game pass', cost: { screenMinutes: 30 }, enabled: true },
            { id: 'friday-dinner', name: 'Pick Friday dinner', cost: { coins: 35 }, enabled: true },
            { id: 'pocket-money', name: 'Pocket money', cost: { coins: 20 }, enabled: true, note: '20 coins = 20 TWD' },
            { id: 'basketball', name: 'New basketball', cost: { coins: 500 }, enabled: true, savingsGoal: true },
            { id: 'm5stack', name: 'M5Stack parts fund', cost: { coins: 800 }, enabled: true, savingsGoal: true },
        ],
    };
};
