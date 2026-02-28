const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET /dashboard/today
router.get('/today', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const log = await prisma.dailyLog.findUnique({
            where: {
                userId_date: { userId: req.userId, date: today }
            },
            include: {
                meals: { include: { components: true } },
                workouts: true,
                supplements: true
            }
        });

        // Aggregate macros
        const meals = log?.meals || [];
        const totalCalories = meals.reduce((sum, m) => sum + (m.calories || 0), 0);
        const totalProtein = meals.reduce((sum, m) => sum + (m.proteinG || 0), 0);
        const totalCarbs = meals.reduce((sum, m) => sum + (m.carbsG || 0), 0);
        const totalFat = meals.reduce((sum, m) => sum + (m.fatG || 0), 0);
        const totalFibre = meals.reduce((sum, m) => sum + (m.fibreG || 0), 0);

        // Workout totals
        const workouts = log?.workouts || [];
        const totalActiveCalories = workouts.reduce((sum, w) => sum + (w.activeCalories || 0), 0);
        const totalWorkoutMins = workouts.reduce((sum, w) => sum + (w.durationMins || 0), 0);

        // Get goals for context
        const goals = await prisma.goal.findMany({
            where: { userId: req.userId }
        });

        // Recent weight trend (last 7 entries)
        const weightTrend = await prisma.bodyMetric.findMany({
            where: { userId: req.userId },
            orderBy: { date: 'desc' },
            take: 7,
            select: { date: true, weightKg: true }
        });

        res.json({
            date: today,
            log,
            macros: {
                calories: totalCalories,
                protein: totalProtein,
                carbs: totalCarbs,
                fat: totalFat,
                fibre: totalFibre
            },
            exercise: {
                activeCalories: totalActiveCalories,
                totalMins: totalWorkoutMins,
                workoutCount: workouts.length
            },
            netCalories: totalCalories - totalActiveCalories,
            supplements: log?.supplements || [],
            goals,
            weightTrend: weightTrend.reverse()
        });
    } catch (err) {
        console.error('Dashboard today error:', err);
        res.status(500).json({ error: 'Failed to fetch dashboard' });
    }
});

// GET /dashboard/weekly
router.get('/weekly', async (req, res) => {
    try {
        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);

        const logs = await prisma.dailyLog.findMany({
            where: {
                userId: req.userId,
                date: { gte: startDate, lte: endDate }
            },
            include: {
                meals: true,
                workouts: true,
                supplements: true
            },
            orderBy: { date: 'asc' }
        });

        const days = logs.map(log => {
            const calories = log.meals.reduce((sum, m) => sum + (m.calories || 0), 0);
            const protein = log.meals.reduce((sum, m) => sum + (m.proteinG || 0), 0);
            const carbs = log.meals.reduce((sum, m) => sum + (m.carbsG || 0), 0);
            const fat = log.meals.reduce((sum, m) => sum + (m.fatG || 0), 0);
            const fibre = log.meals.reduce((sum, m) => sum + (m.fibreG || 0), 0);
            const activeCalories = log.workouts.reduce((sum, w) => sum + (w.activeCalories || 0), 0);
            const workoutMins = log.workouts.reduce((sum, w) => sum + (w.durationMins || 0), 0);

            return {
                date: log.date,
                weight: log.weightKg,
                calories, protein, carbs, fat, fibre,
                activeCalories,
                netCalories: calories - activeCalories,
                workoutMins,
                workoutCount: log.workouts.length
            };
        });

        const n = days.length || 1;
        const sum = (key) => days.reduce((s, d) => s + (d[key] || 0), 0);

        const weightData = await prisma.bodyMetric.findMany({
            where: { userId: req.userId, date: { gte: startDate, lte: endDate } },
            orderBy: { date: 'asc' },
            select: { date: true, weightKg: true }
        });

        res.json({
            startDate, endDate, days, weightData,
            daysLogged: days.length,
            averages: {
                calories: Math.round(sum('calories') / n),
                protein: Math.round(sum('protein') / n),
                carbs: Math.round(sum('carbs') / n),
                fat: Math.round(sum('fat') / n),
                fibre: Math.round(sum('fibre') / n),
                activeCalories: Math.round(sum('activeCalories') / n),
                netCalories: Math.round(sum('netCalories') / n)
            },
            totals: {
                workoutMins: sum('workoutMins'),
                workoutCount: sum('workoutCount'),
                activeCalories: Math.round(sum('activeCalories'))
            }
        });
    } catch (err) {
        console.error('Dashboard weekly error:', err);
        res.status(500).json({ error: 'Failed to fetch weekly dashboard' });
    }
});

// GET /dashboard/monthly
router.get('/monthly', async (req, res) => {
    try {
        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 29);
        startDate.setHours(0, 0, 0, 0);

        const logs = await prisma.dailyLog.findMany({
            where: {
                userId: req.userId,
                date: { gte: startDate, lte: endDate }
            },
            include: {
                meals: true,
                workouts: true
            },
            orderBy: { date: 'asc' }
        });

        const weightData = await prisma.bodyMetric.findMany({
            where: {
                userId: req.userId,
                date: { gte: startDate, lte: endDate }
            },
            orderBy: { date: 'asc' },
            select: { date: true, weightKg: true }
        });

        const days = logs.map(log => {
            const calories = log.meals.reduce((sum, m) => sum + (m.calories || 0), 0);
            const protein = log.meals.reduce((sum, m) => sum + (m.proteinG || 0), 0);
            const carbs = log.meals.reduce((sum, m) => sum + (m.carbsG || 0), 0);
            const fat = log.meals.reduce((sum, m) => sum + (m.fatG || 0), 0);
            const fibre = log.meals.reduce((sum, m) => sum + (m.fibreG || 0), 0);
            const activeCalories = log.workouts.reduce((sum, w) => sum + (w.activeCalories || 0), 0);
            const workoutMins = log.workouts.reduce((sum, w) => sum + (w.durationMins || 0), 0);
            return {
                date: log.date,
                calories, protein, carbs, fat, fibre,
                activeCalories, netCalories: calories - activeCalories,
                workoutMins, workoutCount: log.workouts.length
            };
        });

        const n = days.length || 1;
        const sum = (key) => days.reduce((s, d) => s + (d[key] || 0), 0);

        res.json({
            startDate, endDate, days, weightData,
            daysLogged: days.length,
            averages: {
                calories: Math.round(sum('calories') / n),
                protein: Math.round(sum('protein') / n),
                carbs: Math.round(sum('carbs') / n),
                fat: Math.round(sum('fat') / n),
                fibre: Math.round(sum('fibre') / n),
                activeCalories: Math.round(sum('activeCalories') / n),
                netCalories: Math.round(sum('netCalories') / n)
            },
            totals: {
                workoutMins: sum('workoutMins'),
                workoutCount: sum('workoutCount'),
                activeCalories: Math.round(sum('activeCalories'))
            }
        });
    } catch (err) {
        console.error('Dashboard monthly error:', err);
        res.status(500).json({ error: 'Failed to fetch monthly dashboard' });
    }
});

// GET /dashboard/total — all-time stats
router.get('/total', async (req, res) => {
    try {
        const logs = await prisma.dailyLog.findMany({
            where: { userId: req.userId },
            include: { meals: true, workouts: true },
            orderBy: { date: 'asc' }
        });

        const weightData = await prisma.bodyMetric.findMany({
            where: { userId: req.userId },
            orderBy: { date: 'asc' },
            select: { date: true, weightKg: true }
        });

        const goals = await prisma.goal.findMany({ where: { userId: req.userId } });

        const days = logs.map(log => {
            const calories = log.meals.reduce((sum, m) => sum + (m.calories || 0), 0);
            const protein = log.meals.reduce((sum, m) => sum + (m.proteinG || 0), 0);
            const carbs = log.meals.reduce((sum, m) => sum + (m.carbsG || 0), 0);
            const fat = log.meals.reduce((sum, m) => sum + (m.fatG || 0), 0);
            const fibre = log.meals.reduce((sum, m) => sum + (m.fibreG || 0), 0);
            const activeCalories = log.workouts.reduce((sum, w) => sum + (w.activeCalories || 0), 0);
            const workoutMins = log.workouts.reduce((sum, w) => sum + (w.durationMins || 0), 0);
            return {
                date: log.date,
                calories, protein, carbs, fat, fibre,
                activeCalories, netCalories: calories - activeCalories,
                workoutMins, workoutCount: log.workouts.length
            };
        });

        const n = days.length || 1;
        const sum = (key) => days.reduce((s, d) => s + (d[key] || 0), 0);

        const firstDate = logs.length > 0 ? logs[0].date : null;
        const lastDate = logs.length > 0 ? logs[logs.length - 1].date : null;

        res.json({
            firstDate, lastDate, days, weightData, goals,
            daysLogged: days.length,
            averages: {
                calories: Math.round(sum('calories') / n),
                protein: Math.round(sum('protein') / n),
                carbs: Math.round(sum('carbs') / n),
                fat: Math.round(sum('fat') / n),
                fibre: Math.round(sum('fibre') / n),
                activeCalories: Math.round(sum('activeCalories') / n),
                netCalories: Math.round(sum('netCalories') / n)
            },
            totals: {
                workoutMins: sum('workoutMins'),
                workoutCount: sum('workoutCount'),
                activeCalories: Math.round(sum('activeCalories'))
            }
        });
    } catch (err) {
        console.error('Dashboard total error:', err);
        res.status(500).json({ error: 'Failed to fetch total dashboard' });
    }
});

module.exports = router;
