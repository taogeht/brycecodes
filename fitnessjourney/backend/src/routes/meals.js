const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { mealUpload } = require('../middleware/upload');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

// POST /meals — create a meal
router.post('/', async (req, res) => {
    try {
        const { dailyLogId, mealType, name, calories, proteinG, carbsG, fatG, fibreG, notes, components } = req.body;

        if (!dailyLogId || !mealType || !name) {
            return res.status(400).json({ error: 'dailyLogId, mealType, and name are required' });
        }

        const meal = await prisma.meal.create({
            data: {
                dailyLogId,
                mealType,
                name,
                calories: calories ? parseFloat(calories) : null,
                proteinG: proteinG ? parseFloat(proteinG) : null,
                carbsG: carbsG ? parseFloat(carbsG) : null,
                fatG: fatG ? parseFloat(fatG) : null,
                fibreG: fibreG ? parseFloat(fibreG) : null,
                notes,
                components: components ? {
                    create: components.map(c => ({
                        name: c.name,
                        weightG: c.weightG ? parseFloat(c.weightG) : null,
                        calories: c.calories ? parseFloat(c.calories) : null,
                        proteinG: c.proteinG ? parseFloat(c.proteinG) : null,
                        carbsG: c.carbsG ? parseFloat(c.carbsG) : null,
                        fatG: c.fatG ? parseFloat(c.fatG) : null
                    }))
                } : undefined
            },
            include: { components: true }
        });

        res.status(201).json(meal);
    } catch (err) {
        console.error('Create meal error:', err);
        res.status(500).json({ error: 'Failed to create meal' });
    }
});

// PUT /meals/:id — update a meal
router.put('/:id', async (req, res) => {
    try {
        const { mealType, name, calories, proteinG, carbsG, fatG, fibreG, notes, components } = req.body;

        // If components are provided, delete existing and recreate
        if (components) {
            await prisma.mealComponent.deleteMany({ where: { mealId: req.params.id } });
        }

        const meal = await prisma.meal.update({
            where: { id: req.params.id },
            data: {
                mealType,
                name,
                calories: calories ? parseFloat(calories) : null,
                proteinG: proteinG ? parseFloat(proteinG) : null,
                carbsG: carbsG ? parseFloat(carbsG) : null,
                fatG: fatG ? parseFloat(fatG) : null,
                fibreG: fibreG ? parseFloat(fibreG) : null,
                notes,
                components: components ? {
                    create: components.map(c => ({
                        name: c.name,
                        weightG: c.weightG ? parseFloat(c.weightG) : null,
                        calories: c.calories ? parseFloat(c.calories) : null,
                        proteinG: c.proteinG ? parseFloat(c.proteinG) : null,
                        carbsG: c.carbsG ? parseFloat(c.carbsG) : null,
                        fatG: c.fatG ? parseFloat(c.fatG) : null
                    }))
                } : undefined
            },
            include: { components: true }
        });

        res.json(meal);
    } catch (err) {
        console.error('Update meal error:', err);
        res.status(500).json({ error: 'Failed to update meal' });
    }
});

// DELETE /meals/:id
router.delete('/:id', async (req, res) => {
    try {
        await prisma.meal.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (err) {
        console.error('Delete meal error:', err);
        res.status(500).json({ error: 'Failed to delete meal' });
    }
});

// POST /meals/:id/photo — upload meal photo
router.post('/:id/photo', mealUpload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No photo uploaded' });
        }

        const photoUrl = `/uploads/meals/${req.file.filename}`;
        const meal = await prisma.meal.update({
            where: { id: req.params.id },
            data: { photoUrl }
        });

        res.json(meal);
    } catch (err) {
        console.error('Upload photo error:', err);
        res.status(500).json({ error: 'Failed to upload photo' });
    }
});

module.exports = router;
