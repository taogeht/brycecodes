const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET /records — list all personal records
router.get('/', async (req, res) => {
    try {
        const records = await prisma.personalRecord.findMany({
            where: { userId: req.userId },
            orderBy: { date: 'desc' }
        });
        res.json(records);
    } catch (err) {
        console.error('Records list error:', err);
        res.status(500).json({ error: 'Failed to fetch records' });
    }
});

// GET /records/recent — latest 5 PRs for dashboard
router.get('/recent', async (req, res) => {
    try {
        const records = await prisma.personalRecord.findMany({
            where: { userId: req.userId },
            orderBy: { date: 'desc' },
            take: 5
        });
        res.json(records);
    } catch (err) {
        console.error('Recent records error:', err);
        res.status(500).json({ error: 'Failed to fetch recent records' });
    }
});

// POST /records — log a new personal record (auto-detect PR)
router.post('/', async (req, res) => {
    try {
        const { exerciseName, metricType, value, date, notes } = req.body;
        if (!exerciseName || !metricType || value == null) {
            return res.status(400).json({ error: 'exerciseName, metricType, and value are required' });
        }

        // Find current best for this exercise + metric
        const currentBest = await prisma.personalRecord.findFirst({
            where: {
                userId: req.userId,
                exerciseName,
                metricType
            },
            orderBy: { value: 'desc' },
            select: { value: true }
        });

        const record = await prisma.personalRecord.create({
            data: {
                userId: req.userId,
                exerciseName,
                metricType,
                value: parseFloat(value),
                previousBest: currentBest?.value || null,
                date: new Date(date || new Date()),
                notes
            }
        });

        res.status(201).json({
            ...record,
            isNewPR: !currentBest || value > currentBest.value
        });
    } catch (err) {
        console.error('Create record error:', err);
        res.status(500).json({ error: 'Failed to create record' });
    }
});

// DELETE /records/:id
router.delete('/:id', async (req, res) => {
    try {
        await prisma.personalRecord.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (err) {
        console.error('Delete record error:', err);
        res.status(500).json({ error: 'Failed to delete record' });
    }
});

module.exports = router;
