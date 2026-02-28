const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

// ─── Helper: compute streak ─────────────────────────────────────────
async function computeStreak(userId) {
    const logs = await prisma.dailyLog.findMany({
        where: { userId },
        orderBy: { date: 'desc' },
        select: { date: true },
        take: 365
    });
    if (logs.length === 0) return 0;

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < logs.length; i++) {
        const expected = new Date(today);
        expected.setDate(expected.getDate() - i);
        const logDate = new Date(logs[i].date);
        logDate.setHours(0, 0, 0, 0);

        if (logDate.getTime() === expected.getTime()) {
            streak++;
        } else {
            break;
        }
    }
    return streak;
}

// ─── Helper: aggregate day data ─────────────────────────────────────
function aggregateDay(log) {
    const meals = log.meals || [];
    const workouts = log.workouts || [];
    const calories = meals.reduce((s, m) => s + (m.calories || 0), 0);
    const protein = meals.reduce((s, m) => s + (m.proteinG || 0), 0);
    const carbs = meals.reduce((s, m) => s + (m.carbsG || 0), 0);
    const fat = meals.reduce((s, m) => s + (m.fatG || 0), 0);
    const fibre = meals.reduce((s, m) => s + (m.fibreG || 0), 0);
    const activeCalories = workouts.reduce((s, w) => s + (w.activeCalories || 0), 0);
    const workoutMins = workouts.reduce((s, w) => s + (w.durationMins || 0), 0);
    const volumeLoad = workouts.reduce((s, w) => s + (w.volumeLoad || 0), 0);

    return {
        date: log.date,
        weight: log.weightKg,
        calories, protein, carbs, fat, fibre,
        activeCalories,
        netCalories: calories - activeCalories,
        workoutMins,
        workoutCount: workouts.length,
        volumeLoad,
        hydrationMl: log.hydrationMl || 0,
        stressLevel: log.stressLevel,
        energyLevel: log.energyLevel
    };
}

// ─── Helper: compute macro ratio ────────────────────────────────────
function macroRatio(protein, carbs, fat) {
    const total = (protein * 4) + (carbs * 4) + (fat * 9);
    if (total === 0) return { proteinPct: 0, carbsPct: 0, fatPct: 0 };
    return {
        proteinPct: Math.round((protein * 4 / total) * 100),
        carbsPct: Math.round((carbs * 4 / total) * 100),
        fatPct: Math.round((fat * 9 / total) * 100)
    };
}

// ─── GET /dashboard/today ───────────────────────────────────────────
router.get('/today', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const log = await prisma.dailyLog.findUnique({
            where: { userId_date: { userId: req.userId, date: today } },
            include: {
                meals: { include: { components: true } },
                workouts: true,
                supplements: true,
                sleep: true,
                activityRings: true
            }
        });

        const meals = log?.meals || [];
        const workouts = log?.workouts || [];
        const totalCalories = meals.reduce((s, m) => s + (m.calories || 0), 0);
        const totalProtein = meals.reduce((s, m) => s + (m.proteinG || 0), 0);
        const totalCarbs = meals.reduce((s, m) => s + (m.carbsG || 0), 0);
        const totalFat = meals.reduce((s, m) => s + (m.fatG || 0), 0);
        const totalFibre = meals.reduce((s, m) => s + (m.fibreG || 0), 0);
        const totalActiveCalories = workouts.reduce((s, w) => s + (w.activeCalories || 0), 0);
        const totalWorkoutMins = workouts.reduce((s, w) => s + (w.durationMins || 0), 0);
        const totalVolumeLoad = workouts.reduce((s, w) => s + (w.volumeLoad || 0), 0);

        const goals = await prisma.goal.findMany({ where: { userId: req.userId } });
        const weightTrend = await prisma.bodyMetric.findMany({
            where: { userId: req.userId },
            orderBy: { date: 'desc' },
            take: 7,
            select: { date: true, weightKg: true }
        });

        const streak = await computeStreak(req.userId);

        // Recent PRs
        const recentPRs = await prisma.personalRecord.findMany({
            where: { userId: req.userId },
            orderBy: { date: 'desc' },
            take: 3
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
            macroRatio: macroRatio(totalProtein, totalCarbs, totalFat),
            exercise: {
                activeCalories: totalActiveCalories,
                totalMins: totalWorkoutMins,
                workoutCount: workouts.length,
                volumeLoad: totalVolumeLoad
            },
            netCalories: totalCalories - totalActiveCalories,
            supplements: log?.supplements || [],
            goals,
            weightTrend: weightTrend.reverse(),
            streak,
            recentPRs,
            // Wellness
            hydrationMl: log?.hydrationMl || 0,
            stressLevel: log?.stressLevel,
            energyLevel: log?.energyLevel,
            sorenessNotes: log?.sorenessNotes,
            // Sleep
            sleep: log?.sleep || null,
            // Activity Rings
            activityRings: log?.activityRings || null
        });
    } catch (err) {
        console.error('Dashboard today error:', err);
        res.status(500).json({ error: 'Failed to fetch dashboard' });
    }
});

// ─── GET /dashboard/weekly ──────────────────────────────────────────
router.get('/weekly', async (req, res) => {
    try {
        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);

        // Previous week for comparison
        const prevEnd = new Date(startDate);
        prevEnd.setDate(prevEnd.getDate() - 1);
        prevEnd.setHours(23, 59, 59, 999);
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - 6);
        prevStart.setHours(0, 0, 0, 0);

        const [logs, prevLogs] = await Promise.all([
            prisma.dailyLog.findMany({
                where: { userId: req.userId, date: { gte: startDate, lte: endDate } },
                include: { meals: true, workouts: true, supplements: true, sleep: true, activityRings: true },
                orderBy: { date: 'asc' }
            }),
            prisma.dailyLog.findMany({
                where: { userId: req.userId, date: { gte: prevStart, lte: prevEnd } },
                include: { meals: true, workouts: true },
                orderBy: { date: 'asc' }
            })
        ]);

        const days = logs.map(aggregateDay);
        const prevDays = prevLogs.map(aggregateDay);
        const n = days.length || 1;
        const pn = prevDays.length || 1;
        const sum = (arr, key) => arr.reduce((s, d) => s + (d[key] || 0), 0);

        const averages = {
            calories: Math.round(sum(days, 'calories') / n),
            protein: Math.round(sum(days, 'protein') / n),
            carbs: Math.round(sum(days, 'carbs') / n),
            fat: Math.round(sum(days, 'fat') / n),
            fibre: Math.round(sum(days, 'fibre') / n),
            activeCalories: Math.round(sum(days, 'activeCalories') / n),
            netCalories: Math.round(sum(days, 'netCalories') / n),
            hydrationMl: Math.round(sum(days, 'hydrationMl') / n)
        };
        averages.macroRatio = macroRatio(averages.protein, averages.carbs, averages.fat);

        const prevAverages = {
            calories: Math.round(sum(prevDays, 'calories') / pn),
            protein: Math.round(sum(prevDays, 'protein') / pn),
            activeCalories: Math.round(sum(prevDays, 'activeCalories') / pn)
        };

        // Comparison: % change from previous period
        const compare = (curr, prev) => prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null;
        const comparison = {
            calories: compare(averages.calories, prevAverages.calories),
            protein: compare(averages.protein, prevAverages.protein),
            activeCalories: compare(averages.activeCalories, prevAverages.activeCalories)
        };

        // Sleep averages
        const sleepLogs = logs.filter(l => l.sleep).map(l => l.sleep);
        const sleepAvg = sleepLogs.length > 0 ? {
            totalMins: Math.round(sleepLogs.reduce((s, sl) => s + sl.totalMins, 0) / sleepLogs.length),
            deepPct: Math.round(sleepLogs.reduce((s, sl) => s + (sl.deepSleepPct || 0), 0) / sleepLogs.length),
            quality: Math.round(sleepLogs.reduce((s, sl) => s + (sl.qualityScore || 0), 0) / sleepLogs.length * 10) / 10
        } : null;

        // Activity averages
        const activityLogs = logs.filter(l => l.activityRings).map(l => l.activityRings);
        const activityAvg = activityLogs.length > 0 ? {
            steps: Math.round(activityLogs.reduce((s, a) => s + (a.stepCount || 0), 0) / activityLogs.length),
            moveCal: Math.round(activityLogs.reduce((s, a) => s + (a.moveCal || 0), 0) / activityLogs.length),
            exerciseMins: Math.round(activityLogs.reduce((s, a) => s + (a.exerciseMins || 0), 0) / activityLogs.length)
        } : null;

        const weightData = await prisma.bodyMetric.findMany({
            where: { userId: req.userId, date: { gte: startDate, lte: endDate } },
            orderBy: { date: 'asc' },
            select: { date: true, weightKg: true }
        });

        res.json({
            startDate, endDate, days, weightData,
            daysLogged: days.length,
            averages, comparison, sleepAvg, activityAvg,
            totals: {
                workoutMins: sum(days, 'workoutMins'),
                workoutCount: sum(days, 'workoutCount'),
                activeCalories: Math.round(sum(days, 'activeCalories')),
                volumeLoad: Math.round(sum(days, 'volumeLoad'))
            }
        });
    } catch (err) {
        console.error('Dashboard weekly error:', err);
        res.status(500).json({ error: 'Failed to fetch weekly dashboard' });
    }
});

// ─── GET /dashboard/monthly ─────────────────────────────────────────
router.get('/monthly', async (req, res) => {
    try {
        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 29);
        startDate.setHours(0, 0, 0, 0);

        // Previous month for comparison
        const prevEnd = new Date(startDate);
        prevEnd.setDate(prevEnd.getDate() - 1);
        prevEnd.setHours(23, 59, 59, 999);
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - 29);
        prevStart.setHours(0, 0, 0, 0);

        const [logs, prevLogs] = await Promise.all([
            prisma.dailyLog.findMany({
                where: { userId: req.userId, date: { gte: startDate, lte: endDate } },
                include: { meals: true, workouts: true, sleep: true, activityRings: true },
                orderBy: { date: 'asc' }
            }),
            prisma.dailyLog.findMany({
                where: { userId: req.userId, date: { gte: prevStart, lte: prevEnd } },
                include: { meals: true, workouts: true },
                orderBy: { date: 'asc' }
            })
        ]);

        const days = logs.map(aggregateDay);
        const prevDays = prevLogs.map(aggregateDay);
        const n = days.length || 1;
        const pn = prevDays.length || 1;
        const sum = (arr, key) => arr.reduce((s, d) => s + (d[key] || 0), 0);

        const averages = {
            calories: Math.round(sum(days, 'calories') / n),
            protein: Math.round(sum(days, 'protein') / n),
            carbs: Math.round(sum(days, 'carbs') / n),
            fat: Math.round(sum(days, 'fat') / n),
            fibre: Math.round(sum(days, 'fibre') / n),
            activeCalories: Math.round(sum(days, 'activeCalories') / n),
            netCalories: Math.round(sum(days, 'netCalories') / n),
            hydrationMl: Math.round(sum(days, 'hydrationMl') / n)
        };
        averages.macroRatio = macroRatio(averages.protein, averages.carbs, averages.fat);

        const prevAverages = {
            calories: Math.round(sum(prevDays, 'calories') / pn),
            protein: Math.round(sum(prevDays, 'protein') / pn),
            activeCalories: Math.round(sum(prevDays, 'activeCalories') / pn)
        };
        const compare = (curr, prev) => prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null;
        const comparison = {
            calories: compare(averages.calories, prevAverages.calories),
            protein: compare(averages.protein, prevAverages.protein),
            activeCalories: compare(averages.activeCalories, prevAverages.activeCalories)
        };

        // Sleep averages
        const sleepLogs = logs.filter(l => l.sleep).map(l => l.sleep);
        const sleepAvg = sleepLogs.length > 0 ? {
            totalMins: Math.round(sleepLogs.reduce((s, sl) => s + sl.totalMins, 0) / sleepLogs.length),
            deepPct: Math.round(sleepLogs.reduce((s, sl) => s + (sl.deepSleepPct || 0), 0) / sleepLogs.length),
            quality: Math.round(sleepLogs.reduce((s, sl) => s + (sl.qualityScore || 0), 0) / sleepLogs.length * 10) / 10
        } : null;

        const weightData = await prisma.bodyMetric.findMany({
            where: { userId: req.userId, date: { gte: startDate, lte: endDate } },
            orderBy: { date: 'asc' },
            select: { date: true, weightKg: true, bodyFatPct: true, muscleMassKg: true }
        });

        res.json({
            startDate, endDate, days, weightData,
            daysLogged: days.length,
            totalWorkouts: sum(days, 'workoutCount'),
            averages, comparison, sleepAvg,
            totals: {
                workoutMins: sum(days, 'workoutMins'),
                workoutCount: sum(days, 'workoutCount'),
                activeCalories: Math.round(sum(days, 'activeCalories')),
                volumeLoad: Math.round(sum(days, 'volumeLoad'))
            }
        });
    } catch (err) {
        console.error('Dashboard monthly error:', err);
        res.status(500).json({ error: 'Failed to fetch monthly dashboard' });
    }
});

// ─── GET /dashboard/total ───────────────────────────────────────────
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
            select: { date: true, weightKg: true, bodyFatPct: true, muscleMassKg: true }
        });

        const goals = await prisma.goal.findMany({ where: { userId: req.userId } });
        const streak = await computeStreak(req.userId);

        const days = logs.map(aggregateDay);
        const n = days.length || 1;
        const sum = (arr, key) => arr.reduce((s, d) => s + (d[key] || 0), 0);

        const firstDate = logs.length > 0 ? logs[0].date : null;
        const lastDate = logs.length > 0 ? logs[logs.length - 1].date : null;

        res.json({
            firstDate, lastDate, days, weightData, goals, streak,
            daysLogged: days.length,
            averages: {
                calories: Math.round(sum(days, 'calories') / n),
                protein: Math.round(sum(days, 'protein') / n),
                carbs: Math.round(sum(days, 'carbs') / n),
                fat: Math.round(sum(days, 'fat') / n),
                fibre: Math.round(sum(days, 'fibre') / n),
                activeCalories: Math.round(sum(days, 'activeCalories') / n),
                netCalories: Math.round(sum(days, 'netCalories') / n)
            },
            totals: {
                workoutMins: sum(days, 'workoutMins'),
                workoutCount: sum(days, 'workoutCount'),
                activeCalories: Math.round(sum(days, 'activeCalories')),
                volumeLoad: Math.round(sum(days, 'volumeLoad'))
            }
        });
    } catch (err) {
        console.error('Dashboard total error:', err);
        res.status(500).json({ error: 'Failed to fetch total dashboard' });
    }
});

module.exports = router;
