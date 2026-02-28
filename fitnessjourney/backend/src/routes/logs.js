const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// All routes require auth
router.use(authenticate);

// GET /logs/:date — get daily log for a specific date
router.get('/:date', async (req, res) => {
    try {
        const date = new Date(req.params.date);
        if (isNaN(date)) {
            return res.status(400).json({ error: 'Invalid date format' });
        }

        let log = await prisma.dailyLog.findUnique({
            where: {
                userId_date: { userId: req.userId, date }
            },
            include: {
                meals: { include: { components: true }, orderBy: { createdAt: 'asc' } },
                workouts: { orderBy: { createdAt: 'asc' } },
                supplements: { orderBy: { createdAt: 'asc' } }
            }
        });

        if (!log) {
            return res.json({ date: req.params.date, meals: [], workouts: [], supplements: [] });
        }

        res.json(log);
    } catch (err) {
        console.error('Get log error:', err);
        res.status(500).json({ error: 'Failed to fetch log' });
    }
});

// POST /logs — create daily log
router.post('/', async (req, res) => {
    try {
        const { date, weightKg, wakeTime, sleepTime, notes } = req.body;
        if (!date) {
            return res.status(400).json({ error: 'Date is required' });
        }

        const log = await prisma.dailyLog.upsert({
            where: {
                userId_date: { userId: req.userId, date: new Date(date) }
            },
            update: { weightKg, wakeTime, sleepTime, notes },
            create: {
                userId: req.userId,
                date: new Date(date),
                weightKg,
                wakeTime,
                sleepTime,
                notes
            },
            include: {
                meals: { include: { components: true } },
                workouts: true,
                supplements: true
            }
        });

        res.json(log);
    } catch (err) {
        console.error('Create log error:', err);
        res.status(500).json({ error: 'Failed to create log' });
    }
});

// PUT /logs/:id — update daily log
router.put('/:id', async (req, res) => {
    try {
        const { weightKg, wakeTime, sleepTime, notes } = req.body;

        const log = await prisma.dailyLog.update({
            where: { id: req.params.id },
            data: { weightKg, wakeTime, sleepTime, notes },
            include: {
                meals: { include: { components: true } },
                workouts: true,
                supplements: true
            }
        });

        res.json(log);
    } catch (err) {
        console.error('Update log error:', err);
        res.status(500).json({ error: 'Failed to update log' });
    }
});

module.exports = router;
