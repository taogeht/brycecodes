const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { photoUpload } = require('../middleware/upload');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET /metrics — list body metrics with optional date range
router.get('/', async (req, res) => {
    try {
        const { from, to, limit } = req.query;
        const where = { userId: req.userId };

        if (from || to) {
            where.date = {};
            if (from) where.date.gte = new Date(from);
            if (to) where.date.lte = new Date(to);
        }

        const metrics = await prisma.bodyMetric.findMany({
            where,
            orderBy: { date: 'desc' },
            take: limit ? parseInt(limit) : 100
        });

        res.json(metrics);
    } catch (err) {
        console.error('Get metrics error:', err);
        res.status(500).json({ error: 'Failed to fetch metrics' });
    }
});

// POST /metrics — create body metric
router.post('/', async (req, res) => {
    try {
        const { date, weightKg, notes } = req.body;
        if (!date) {
            return res.status(400).json({ error: 'Date is required' });
        }

        const metric = await prisma.bodyMetric.create({
            data: {
                userId: req.userId,
                date: new Date(date),
                weightKg: weightKg ? parseFloat(weightKg) : null,
                notes
            }
        });

        res.status(201).json(metric);
    } catch (err) {
        console.error('Create metric error:', err);
        res.status(500).json({ error: 'Failed to create metric' });
    }
});

// POST /metrics/photo — upload physique check-in photo
router.post('/photo', photoUpload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No photo uploaded' });
        }

        const { date, weightKg, notes } = req.body;
        const photoUrl = `/uploads/photos/${req.file.filename}`;

        const metric = await prisma.bodyMetric.create({
            data: {
                userId: req.userId,
                date: new Date(date || new Date()),
                weightKg: weightKg ? parseFloat(weightKg) : null,
                photoUrl,
                notes
            }
        });

        res.status(201).json(metric);
    } catch (err) {
        console.error('Upload photo error:', err);
        res.status(500).json({ error: 'Failed to upload photo' });
    }
});

module.exports = router;
