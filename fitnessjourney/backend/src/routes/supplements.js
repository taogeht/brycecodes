const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

// POST /supplements
router.post('/', async (req, res) => {
    try {
        const { dailyLogId, name, doseMg, takenAt, notes } = req.body;
        if (!dailyLogId || !name) {
            return res.status(400).json({ error: 'dailyLogId and name are required' });
        }

        const supplement = await prisma.supplement.create({
            data: {
                dailyLogId,
                name,
                doseMg: doseMg ? parseFloat(doseMg) : null,
                takenAt,
                notes
            }
        });

        res.status(201).json(supplement);
    } catch (err) {
        console.error('Create supplement error:', err);
        res.status(500).json({ error: 'Failed to create supplement' });
    }
});

// PUT /supplements/:id
router.put('/:id', async (req, res) => {
    try {
        const { name, doseMg, takenAt, notes } = req.body;

        const supplement = await prisma.supplement.update({
            where: { id: req.params.id },
            data: {
                name,
                doseMg: doseMg ? parseFloat(doseMg) : null,
                takenAt,
                notes
            }
        });

        res.json(supplement);
    } catch (err) {
        console.error('Update supplement error:', err);
        res.status(500).json({ error: 'Failed to update supplement' });
    }
});

module.exports = router;
