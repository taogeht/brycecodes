const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET /goals
router.get('/', async (req, res) => {
    try {
        const goals = await prisma.goal.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(goals);
    } catch (err) {
        console.error('Get goals error:', err);
        res.status(500).json({ error: 'Failed to fetch goals' });
    }
});

// POST /goals
router.post('/', async (req, res) => {
    try {
        const { goalType, targetValue, startDate, targetDate } = req.body;
        if (!goalType || !targetValue) {
            return res.status(400).json({ error: 'goalType and targetValue are required' });
        }

        const goal = await prisma.goal.create({
            data: {
                userId: req.userId,
                goalType,
                targetValue: parseFloat(targetValue),
                startDate: new Date(startDate || new Date()),
                targetDate: new Date(targetDate)
            }
        });

        res.status(201).json(goal);
    } catch (err) {
        console.error('Create goal error:', err);
        res.status(500).json({ error: 'Failed to create goal' });
    }
});

// PUT /goals/:id
router.put('/:id', async (req, res) => {
    try {
        const { goalType, targetValue, startDate, targetDate } = req.body;

        const goal = await prisma.goal.update({
            where: { id: req.params.id },
            data: {
                goalType,
                targetValue: targetValue ? parseFloat(targetValue) : undefined,
                startDate: startDate ? new Date(startDate) : undefined,
                targetDate: targetDate ? new Date(targetDate) : undefined
            }
        });

        res.json(goal);
    } catch (err) {
        console.error('Update goal error:', err);
        res.status(500).json({ error: 'Failed to update goal' });
    }
});

module.exports = router;
