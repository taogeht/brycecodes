const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET /sleep — list sleep logs (default last 30 days)
router.get('/', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 30;
        const logs = await prisma.sleepLog.findMany({
            where: { dailyLog: { userId: req.userId } },
            orderBy: { date: 'desc' },
            take: limit,
            include: { dailyLog: { select: { notes: true } } }
        });
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /sleep/trends — aggregated sleep trends for charts
router.get('/trends', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const since = new Date();
        since.setDate(since.getDate() - days);

        const logs = await prisma.sleepLog.findMany({
            where: { dailyLog: { userId: req.userId }, date: { gte: since } },
            orderBy: { date: 'asc' },
            select: {
                date: true, totalMins: true, deepMins: true, remMins: true,
                coreMins: true, awakeMins: true, deepSleepPct: true, remPct: true,
                bedTime: true, wakeTime: true
            }
        });

        // Calculate averages
        const count = logs.length;
        const avg = (arr, key) => count ? Math.round(arr.reduce((s, l) => s + (l[key] || 0), 0) / count) : 0;

        res.json({
            logs,
            averages: {
                totalMins: avg(logs, 'totalMins'),
                deepMins: avg(logs, 'deepMins'),
                remMins: avg(logs, 'remMins'),
                coreMins: avg(logs, 'coreMins'),
                deepPct: count ? Math.round(logs.reduce((s, l) => s + (l.deepSleepPct || 0), 0) / count) : 0
            },
            magnesiumStartDate: '2026-02-23' // reference line for charts
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /sleep/:date — single day's sleep
router.get('/:date', async (req, res) => {
    try {
        const date = new Date(req.params.date);
        const log = await prisma.sleepLog.findFirst({
            where: { dailyLog: { userId: req.userId }, date },
            include: { dailyLog: { select: { notes: true, supplements: true } } }
        });
        if (!log) return res.status(404).json({ error: 'No sleep data for this date' });
        res.json(log);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
