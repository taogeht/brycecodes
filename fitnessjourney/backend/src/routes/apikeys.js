const express = require('express');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET /apikeys — get current user's API key
router.get('/', async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.userId },
            select: { apiKey: true }
        });
        res.json({ apiKey: user?.apiKey || null });
    } catch (err) {
        console.error('Get API key error:', err);
        res.status(500).json({ error: 'Failed to get API key' });
    }
});

// POST /apikeys/regenerate — generate a new API key
router.post('/regenerate', async (req, res) => {
    try {
        const apiKey = crypto.randomBytes(32).toString('hex');
        await prisma.user.update({
            where: { id: req.userId },
            data: { apiKey }
        });
        res.json({ apiKey });
    } catch (err) {
        console.error('Regenerate API key error:', err);
        res.status(500).json({ error: 'Failed to regenerate API key' });
    }
});

module.exports = router;
