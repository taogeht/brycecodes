const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

// POST /import/daily — import a full day's data from JSON
router.post('/daily', async (req, res) => {
    try {
        const data = req.body;
        if (!data.date) return res.status(400).json({ error: 'date is required' });

        const date = new Date(data.date);
        const existing = await prisma.dailyLog.findUnique({
            where: { userId_date: { userId: req.userId, date } }
        });
        if (existing) {
            return res.status(409).json({
                error: 'Log for this date already exists. Use merge to add, or overwrite to replace.',
                date: data.date, id: existing.id
            });
        }

        const result = await ingestDailyLog(prisma, req.userId, data);
        res.json({ success: true, date: data.date, ...result });
    } catch (err) {
        console.error('Import error:', err);
        // Log failed import
        try {
            await prisma.importLog.create({
                data: { date: new Date(req.body.date || new Date()), status: 'error', errorMessage: err.message, rawJson: req.body }
            });
        } catch (_) { }
        res.status(500).json({ error: err.message });
    }
});

// POST /import/daily/overwrite — re-import (replaces existing)
router.post('/daily/overwrite', async (req, res) => {
    try {
        const data = req.body;
        if (!data.date) return res.status(400).json({ error: 'date is required' });

        const date = new Date(data.date);
        const existing = await prisma.dailyLog.findUnique({
            where: { userId_date: { userId: req.userId, date } }
        });
        if (existing) {
            await prisma.dailyLog.delete({ where: { id: existing.id } });
        }

        const result = await ingestDailyLog(prisma, req.userId, data);
        res.json({ success: true, overwritten: !!existing, date: data.date, ...result });
    } catch (err) {
        console.error('Import overwrite error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /import/daily/merge — add to existing day (incremental import)
router.post('/daily/merge', async (req, res) => {
    try {
        const data = req.body;
        if (!data.date) return res.status(400).json({ error: 'date is required' });

        const date = new Date(data.date);
        const userId = req.userId;

        // Find or create daily log
        let log = await prisma.dailyLog.findUnique({
            where: { userId_date: { userId, date } }
        });

        const isNew = !log;
        if (!log) {
            const meta = data.meta || {};
            log = await prisma.dailyLog.create({
                data: {
                    userId, date,
                    weightKg: meta.weight_kg ? parseFloat(meta.weight_kg) : null,
                    wakeTime: meta.wake_time || null,
                    sleepTime: meta.sleep_time || null,
                    notes: meta.notes || null
                }
            });
        } else if (data.meta) {
            // Update meta fields if provided
            const meta = data.meta;
            const updates = {};
            if (meta.weight_kg !== undefined) updates.weightKg = parseFloat(meta.weight_kg);
            if (meta.wake_time !== undefined) updates.wakeTime = meta.wake_time;
            if (meta.sleep_time !== undefined) updates.sleepTime = meta.sleep_time;
            if (meta.notes !== undefined) updates.notes = meta.notes;
            if (Object.keys(updates).length > 0) {
                await prisma.dailyLog.update({ where: { id: log.id }, data: updates });
            }
        }

        // Append workouts
        let workoutsCreated = 0;
        for (const w of (data.workouts || [])) {
            await prisma.workout.create({
                data: {
                    dailyLogId: log.id,
                    type: w.type || 'other',
                    startTime: w.start_time || null,
                    endTime: w.end_time || null,
                    durationMins: w.duration_mins ? parseInt(w.duration_mins) : null,
                    activeCalories: w.active_calories ? parseFloat(w.active_calories) : null,
                    totalCalories: w.total_calories ? parseFloat(w.total_calories) : null,
                    avgHeartRate: w.avg_heart_rate ? parseInt(w.avg_heart_rate) : null,
                    maxHeartRate: w.max_heart_rate ? parseInt(w.max_heart_rate) : null,
                    distanceKm: w.distance_km ? parseFloat(w.distance_km) : null,
                    avgPace: w.avg_pace || null,
                    effortLevel: w.effort_level ? parseInt(w.effort_level) : null,
                    notes: w.notes || null
                }
            });
            workoutsCreated++;
        }

        // Append meals
        let mealsCreated = 0;
        for (const meal of (data.nutrition?.meals || [])) {
            await prisma.meal.create({
                data: {
                    dailyLogId: log.id,
                    mealType: meal.meal_type || 'snack',
                    name: meal.name || 'Unnamed meal',
                    calories: meal.calories ? parseFloat(meal.calories) : null,
                    proteinG: meal.protein_g ? parseFloat(meal.protein_g) : null,
                    carbsG: meal.carbs_g ? parseFloat(meal.carbs_g) : null,
                    fatG: meal.fat_g ? parseFloat(meal.fat_g) : null,
                    fibreG: meal.fibre_g ? parseFloat(meal.fibre_g) : null,
                    notes: meal.notes || null,
                    components: meal.components ? {
                        create: meal.components.map(c => ({
                            name: c.name,
                            weightG: c.weight_g ? parseFloat(c.weight_g) : null,
                            calories: c.calories ? parseFloat(c.calories) : null,
                            proteinG: c.protein_g ? parseFloat(c.protein_g) : null,
                            carbsG: c.carbs_g ? parseFloat(c.carbs_g) : null,
                            fatG: c.fat_g ? parseFloat(c.fat_g) : null,
                            fibreG: c.fibre_g ? parseFloat(c.fibre_g) : null
                        }))
                    } : undefined
                }
            });
            mealsCreated++;
        }

        // Append supplements
        let supplementsCreated = 0;
        for (const s of (data.supplements || [])) {
            await prisma.supplement.create({
                data: {
                    dailyLogId: log.id,
                    name: s.name, doseMg: s.dose_mg ? parseFloat(s.dose_mg) : null,
                    takenAt: s.taken_at || null, notes: s.notes || null
                }
            });
            supplementsCreated++;
        }

        // Upsert sleep (replace if exists)
        let sleepLogged = false;
        if (data.sleep && data.sleep.total_mins) {
            const s = data.sleep;
            const deepPct = s.total_mins ? Math.round((s.deep_mins / s.total_mins) * 100) : null;
            const remPct = s.total_mins ? Math.round((s.rem_mins / s.total_mins) * 100) : null;
            const existing = await prisma.sleepLog.findUnique({ where: { dailyLogId: log.id } });
            if (existing) await prisma.sleepLog.delete({ where: { id: existing.id } });
            await prisma.sleepLog.create({
                data: {
                    dailyLogId: log.id, date,
                    bedTime: s.bed_time || null, wakeTime: s.wake_time || null,
                    totalMins: parseInt(s.total_mins),
                    awakeMins: s.awake_mins != null ? parseInt(s.awake_mins) : null,
                    remMins: s.rem_mins != null ? parseInt(s.rem_mins) : null,
                    coreMins: s.core_mins != null ? parseInt(s.core_mins) : null,
                    deepMins: s.deep_mins != null ? parseInt(s.deep_mins) : null,
                    deepSleepPct: deepPct, remPct: remPct
                }
            });
            sleepLogged = true;
        }

        // Upsert activity rings (replace if exists)
        let activityLogged = false;
        if (data.activity_rings) {
            const a = data.activity_rings;
            const existing = await prisma.activityRings.findUnique({ where: { dailyLogId: log.id } });
            if (existing) await prisma.activityRings.delete({ where: { id: existing.id } });
            await prisma.activityRings.create({
                data: {
                    dailyLogId: log.id,
                    moveCal: a.move_cal != null ? parseInt(a.move_cal) : null,
                    moveGoal: a.move_goal != null ? parseInt(a.move_goal) : null,
                    exerciseMins: a.exercise_mins != null ? parseInt(a.exercise_mins) : null,
                    exerciseGoal: a.exercise_goal != null ? parseInt(a.exercise_goal) : null,
                    standHrs: a.stand_hrs != null ? parseInt(a.stand_hrs) : null,
                    standGoal: a.stand_goal != null ? parseInt(a.stand_goal) : null,
                    stepCount: data.steps?.count != null ? parseInt(data.steps.count) : null,
                    stepDistanceKm: data.steps?.distance_km != null ? parseFloat(data.steps.distance_km) : null
                }
            });
            activityLogged = true;
        }

        // Weight as body metric
        if (data.meta?.weight_kg) {
            await prisma.bodyMetric.create({
                data: { userId, date, weightKg: parseFloat(data.meta.weight_kg), notes: 'Auto-logged from daily import (merge)' }
            });
        }

        // Import log (not linked to dailyLogId if one already exists to avoid unique constraint)
        await prisma.importLog.create({
            data: {
                dailyLogId: isNew ? log.id : null,
                date,
                mealsCount: mealsCreated,
                workoutsCount: workoutsCreated,
                status: 'success',
                rawJson: data
            }
        });

        res.json({
            success: true, merged: !isNew, date: data.date,
            logId: log.id, mealsCreated, workoutsCreated, supplementsCreated,
            sleepLogged, activityLogged,
            weightLogged: !!data.meta?.weight_kg
        });
    } catch (err) {
        console.error('Import merge error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /import/history — past imports
router.get('/history', async (req, res) => {
    try {
        const logs = await prisma.importLog.findMany({
            orderBy: { importedAt: 'desc' },
            take: 30,
            select: {
                id: true, date: true, importedAt: true,
                mealsCount: true, workoutsCount: true, status: true, errorMessage: true
            }
        });
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /import/schema — return expected JSON format
router.get('/schema', (req, res) => {
    res.json({
        description: 'Daily log JSON format for import',
        example: {
            date: '2026-02-24',
            meta: { weight_kg: 82.5, wake_time: '06:30', sleep_time: '22:30', notes: '' },
            sleep: { bed_time: '22:00', wake_time: '06:30', total_mins: 480, awake_mins: 15, rem_mins: 100, core_mins: 280, deep_mins: 85 },
            workouts: [{ type: 'indoor_walk', start_time: '05:30', end_time: '06:30', duration_mins: 60, active_calories: 350, total_calories: 450, distance_km: 5.5, avg_heart_rate: 95, max_heart_rate: 120, avg_pace: '10:54', effort_level: 2 }],
            nutrition: {
                meals: [{ meal_type: 'lunch', name: 'Chicken Rice', calories: 650, protein_g: 45, carbs_g: 70, fat_g: 18, fibre_g: 5, components: [{ name: 'Chicken', weight_g: 200, calories: 330, protein_g: 40, carbs_g: 0, fat_g: 7 }] }],
                totals: { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 65, fibre_g: 25 }
            },
            supplements: [{ name: 'Creatine', dose_mg: 10000, taken_at: '06:30' }],
            activity_rings: { move_cal: 800, move_goal: 720, exercise_mins: 60, exercise_goal: 45, stand_hrs: 12, stand_goal: 12 },
            steps: { count: 12000, distance_km: 8.5 }
        }
    });
});

// Ingest a full daily log from JSON
async function ingestDailyLog(prisma, userId, data) {
    const date = new Date(data.date);
    const meta = data.meta || {};
    const nutrition = data.nutrition || {};
    const meals = nutrition.meals || [];
    const workouts = data.workouts || [];
    const supplements = data.supplements || [];

    // 1. Create daily log
    const log = await prisma.dailyLog.create({
        data: {
            userId, date,
            weightKg: meta.weight_kg ? parseFloat(meta.weight_kg) : null,
            wakeTime: meta.wake_time || null,
            sleepTime: meta.sleep_time || null,
            notes: meta.notes || null
        }
    });

    // 2. Sleep
    if (data.sleep && data.sleep.total_mins) {
        const s = data.sleep;
        const deepPct = s.total_mins ? Math.round((s.deep_mins / s.total_mins) * 100) : null;
        const remPct = s.total_mins ? Math.round((s.rem_mins / s.total_mins) * 100) : null;
        await prisma.sleepLog.create({
            data: {
                dailyLogId: log.id, date,
                bedTime: s.bed_time || null,
                wakeTime: s.wake_time || null,
                totalMins: parseInt(s.total_mins),
                awakeMins: s.awake_mins != null ? parseInt(s.awake_mins) : null,
                remMins: s.rem_mins != null ? parseInt(s.rem_mins) : null,
                coreMins: s.core_mins != null ? parseInt(s.core_mins) : null,
                deepMins: s.deep_mins != null ? parseInt(s.deep_mins) : null,
                deepSleepPct: deepPct,
                remPct: remPct
            }
        });
    }

    // 3. Workouts
    let workoutsCreated = 0;
    for (const w of workouts) {
        await prisma.workout.create({
            data: {
                dailyLogId: log.id,
                type: w.type || 'other',
                startTime: w.start_time || null,
                endTime: w.end_time || null,
                durationMins: w.duration_mins ? parseInt(w.duration_mins) : null,
                activeCalories: w.active_calories ? parseFloat(w.active_calories) : null,
                totalCalories: w.total_calories ? parseFloat(w.total_calories) : null,
                avgHeartRate: w.avg_heart_rate ? parseInt(w.avg_heart_rate) : null,
                maxHeartRate: w.max_heart_rate ? parseInt(w.max_heart_rate) : null,
                distanceKm: w.distance_km ? parseFloat(w.distance_km) : null,
                avgPace: w.avg_pace || null,
                effortLevel: w.effort_level ? parseInt(w.effort_level) : null,
                notes: w.notes || null
            }
        });
        workoutsCreated++;
    }

    // 4. Meals with components
    let mealsCreated = 0;
    for (const meal of meals) {
        await prisma.meal.create({
            data: {
                dailyLogId: log.id,
                mealType: meal.meal_type || 'snack',
                name: meal.name || 'Unnamed meal',
                calories: meal.calories ? parseFloat(meal.calories) : null,
                proteinG: meal.protein_g ? parseFloat(meal.protein_g) : null,
                carbsG: meal.carbs_g ? parseFloat(meal.carbs_g) : null,
                fatG: meal.fat_g ? parseFloat(meal.fat_g) : null,
                fibreG: meal.fibre_g ? parseFloat(meal.fibre_g) : null,
                notes: meal.notes || null,
                components: meal.components ? {
                    create: meal.components.map(c => ({
                        name: c.name,
                        weightG: c.weight_g ? parseFloat(c.weight_g) : null,
                        calories: c.calories ? parseFloat(c.calories) : null,
                        proteinG: c.protein_g ? parseFloat(c.protein_g) : null,
                        carbsG: c.carbs_g ? parseFloat(c.carbs_g) : null,
                        fatG: c.fat_g ? parseFloat(c.fat_g) : null,
                        fibreG: c.fibre_g ? parseFloat(c.fibre_g) : null
                    }))
                } : undefined
            }
        });
        mealsCreated++;
    }

    // 5. Supplements
    let supplementsCreated = 0;
    for (const s of supplements) {
        await prisma.supplement.create({
            data: {
                dailyLogId: log.id,
                name: s.name, doseMg: s.dose_mg ? parseFloat(s.dose_mg) : null,
                takenAt: s.taken_at || null, notes: s.notes || null
            }
        });
        supplementsCreated++;
    }

    // 6. Activity rings + steps
    if (data.activity_rings) {
        const a = data.activity_rings;
        await prisma.activityRings.create({
            data: {
                dailyLogId: log.id,
                moveCal: a.move_cal != null ? parseInt(a.move_cal) : null,
                moveGoal: a.move_goal != null ? parseInt(a.move_goal) : null,
                exerciseMins: a.exercise_mins != null ? parseInt(a.exercise_mins) : null,
                exerciseGoal: a.exercise_goal != null ? parseInt(a.exercise_goal) : null,
                standHrs: a.stand_hrs != null ? parseInt(a.stand_hrs) : null,
                standGoal: a.stand_goal != null ? parseInt(a.stand_goal) : null,
                stepCount: data.steps?.count != null ? parseInt(data.steps.count) : null,
                stepDistanceKm: data.steps?.distance_km != null ? parseFloat(data.steps.distance_km) : null
            }
        });
    }

    // 7. Weight as body metric
    if (meta.weight_kg) {
        await prisma.bodyMetric.create({
            data: { userId, date, weightKg: parseFloat(meta.weight_kg), notes: 'Auto-logged from daily import' }
        });
    }

    // 8. Import log
    await prisma.importLog.create({
        data: {
            dailyLogId: log.id, date,
            mealsCount: mealsCreated,
            workoutsCount: workoutsCreated,
            status: 'success',
            rawJson: data
        }
    });

    return {
        logId: log.id, mealsCreated, workoutsCreated, supplementsCreated,
        sleepLogged: !!(data.sleep?.total_mins),
        activityLogged: !!data.activity_rings,
        weightLogged: !!meta.weight_kg
    };
}

module.exports = router;
