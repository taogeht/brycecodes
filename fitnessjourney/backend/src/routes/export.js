const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET /export/csv — export all data as CSV
router.get('/csv', async (req, res) => {
    try {
        const logs = await prisma.dailyLog.findMany({
            where: { userId: req.userId },
            include: {
                meals: { include: { components: true } },
                workouts: true,
                supplements: true
            },
            orderBy: { date: 'asc' }
        });

        // Build CSV header
        const lines = ['Date,Weight (kg),Wake Time,Sleep Time,Meal,Meal Type,Calories,Protein (g),Carbs (g),Fat (g),Fibre (g),Workout Type,Duration (min),Active Calories,Distance (km),Supplement,Dose (mg)'];

        for (const log of logs) {
            const dateStr = log.date.toISOString().split('T')[0];
            const base = `${dateStr},${log.weightKg || ''},${log.wakeTime || ''},${log.sleepTime || ''}`;

            if (log.meals.length === 0 && log.workouts.length === 0 && log.supplements.length === 0) {
                lines.push(`${base},,,,,,,,,,,,`);
                continue;
            }

            for (const meal of log.meals) {
                lines.push(`${base},${csvEscape(meal.name)},${meal.mealType},${meal.calories || ''},${meal.proteinG || ''},${meal.carbsG || ''},${meal.fatG || ''},${meal.fibreG || ''},,,,,,`);
            }

            for (const workout of log.workouts) {
                lines.push(`${base},,,,,,,,${workout.type},${workout.durationMins || ''},${workout.activeCalories || ''},${workout.distanceKm || ''},,`);
            }

            for (const supp of log.supplements) {
                lines.push(`${base},,,,,,,,,,,,${csvEscape(supp.name)},${supp.doseMg || ''}`);
            }
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=fitness-data.csv');
        res.send(lines.join('\n'));
    } catch (err) {
        console.error('Export error:', err);
        res.status(500).json({ error: 'Failed to export data' });
    }
});

function csvEscape(str) {
    if (!str) return '';
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

module.exports = router;
