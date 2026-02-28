const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

// POST /workouts
router.post('/', async (req, res) => {
    try {
        const {
            dailyLogId, type, startTime, endTime, durationMins,
            activeCalories, totalCalories, avgHeartRate, maxHeartRate,
            distanceKm, effortLevel, notes
        } = req.body;

        if (!dailyLogId || !type) {
            return res.status(400).json({ error: 'dailyLogId and type are required' });
        }

        const workout = await prisma.workout.create({
            data: {
                dailyLogId,
                type,
                startTime,
                endTime,
                durationMins: durationMins ? parseInt(durationMins) : null,
                activeCalories: activeCalories ? parseFloat(activeCalories) : null,
                totalCalories: totalCalories ? parseFloat(totalCalories) : null,
                avgHeartRate: avgHeartRate ? parseInt(avgHeartRate) : null,
                maxHeartRate: maxHeartRate ? parseInt(maxHeartRate) : null,
                distanceKm: distanceKm ? parseFloat(distanceKm) : null,
                effortLevel: effortLevel ? parseInt(effortLevel) : null,
                notes
            }
        });

        res.status(201).json(workout);
    } catch (err) {
        console.error('Create workout error:', err);
        res.status(500).json({ error: 'Failed to create workout' });
    }
});

// PUT /workouts/:id
router.put('/:id', async (req, res) => {
    try {
        const {
            type, startTime, endTime, durationMins,
            activeCalories, totalCalories, avgHeartRate, maxHeartRate,
            distanceKm, effortLevel, notes
        } = req.body;

        const workout = await prisma.workout.update({
            where: { id: req.params.id },
            data: {
                type,
                startTime,
                endTime,
                durationMins: durationMins ? parseInt(durationMins) : null,
                activeCalories: activeCalories ? parseFloat(activeCalories) : null,
                totalCalories: totalCalories ? parseFloat(totalCalories) : null,
                avgHeartRate: avgHeartRate ? parseInt(avgHeartRate) : null,
                maxHeartRate: maxHeartRate ? parseInt(maxHeartRate) : null,
                distanceKm: distanceKm ? parseFloat(distanceKm) : null,
                effortLevel: effortLevel ? parseInt(effortLevel) : null,
                notes
            }
        });

        res.json(workout);
    } catch (err) {
        console.error('Update workout error:', err);
        res.status(500).json({ error: 'Failed to update workout' });
    }
});

// DELETE /workouts/:id
router.delete('/:id', async (req, res) => {
    try {
        await prisma.workout.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (err) {
        console.error('Delete workout error:', err);
        res.status(500).json({ error: 'Failed to delete workout' });
    }
});

module.exports = router;
