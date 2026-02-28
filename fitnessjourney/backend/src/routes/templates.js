const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET /templates — list meal templates
router.get('/', async (req, res) => {
    try {
        const templates = await prisma.mealTemplate.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(templates);
    } catch (err) {
        console.error('Get templates error:', err);
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
});

// POST /templates — save a meal as template
router.post('/', async (req, res) => {
    try {
        const { name, mealType, calories, proteinG, carbsG, fatG, fibreG, components } = req.body;
        if (!name || !mealType) {
            return res.status(400).json({ error: 'name and mealType are required' });
        }

        const template = await prisma.mealTemplate.create({
            data: {
                userId: req.userId,
                name,
                mealType,
                calories: calories ? parseFloat(calories) : null,
                proteinG: proteinG ? parseFloat(proteinG) : null,
                carbsG: carbsG ? parseFloat(carbsG) : null,
                fatG: fatG ? parseFloat(fatG) : null,
                fibreG: fibreG ? parseFloat(fibreG) : null,
                components: components || null
            }
        });

        res.status(201).json(template);
    } catch (err) {
        console.error('Create template error:', err);
        res.status(500).json({ error: 'Failed to create template' });
    }
});

// DELETE /templates/:id
router.delete('/:id', async (req, res) => {
    try {
        await prisma.mealTemplate.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (err) {
        console.error('Delete template error:', err);
        res.status(500).json({ error: 'Failed to delete template' });
    }
});

module.exports = router;
