const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const {
    exchangeCode,
    getValidToken,
    fetchActivities,
    activityToWorkout
} = require('../utils/strava-client');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET /strava/status — check if user has Strava connected
router.get('/status', async (req, res) => {
    try {
        const token = await prisma.stravaToken.findUnique({
            where: { userId: req.userId },
            select: { athleteId: true, scope: true, lastSyncAt: true, createdAt: true }
        });
        res.json({ connected: !!token, ...(token || {}) });
    } catch (err) {
        console.error('Strava status error:', err);
        res.status(500).json({ error: 'Failed to check Strava status' });
    }
});

// GET /strava/auth-url — generate the Strava OAuth authorization URL
router.get('/auth-url', (req, res) => {
    const clientId = process.env.STRAVA_CLIENT_ID;
    if (!clientId) return res.status(500).json({ error: 'Strava client ID not configured' });

    const redirectUri = process.env.STRAVA_REDIRECT_URI || `${req.protocol}://${req.get('host')}/fitnessjourney/settings`;
    const scope = 'activity:read_all,profile:read_all';
    const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&approval_prompt=auto`;
    res.json({ url });
});

// GET /strava/callback — handle OAuth callback from Strava
router.get('/callback', async (req, res) => {
    try {
        const { code, error: stravaError } = req.query;
        if (stravaError) return res.status(400).json({ error: `Strava authorization denied: ${stravaError}` });
        if (!code) return res.status(400).json({ error: 'Missing authorization code' });

        const data = await exchangeCode(code);

        await prisma.stravaToken.upsert({
            where: { userId: req.userId },
            update: {
                athleteId: data.athlete.id,
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                expiresAt: data.expires_at,
                scope: 'activity:read_all,profile:read_all'
            },
            create: {
                userId: req.userId,
                athleteId: data.athlete.id,
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                expiresAt: data.expires_at,
                scope: 'activity:read_all,profile:read_all'
            }
        });

        res.json({ success: true, athleteId: data.athlete.id });
    } catch (err) {
        console.error('Strava callback error:', err);
        res.status(500).json({ error: 'Failed to connect Strava' });
    }
});

// POST /strava/disconnect — remove Strava connection
router.post('/disconnect', async (req, res) => {
    try {
        await prisma.stravaToken.deleteMany({ where: { userId: req.userId } });
        res.json({ success: true });
    } catch (err) {
        console.error('Strava disconnect error:', err);
        res.status(500).json({ error: 'Failed to disconnect Strava' });
    }
});

// POST /strava/sync — pull recent activities from Strava and create workouts
router.post('/sync', async (req, res) => {
    try {
        const { days = 7 } = req.body;
        const token = await getValidToken(req.userId);

        const after = Math.floor(Date.now() / 1000) - (days * 86400);
        let allActivities = [];
        let page = 1;

        // Paginate through all activities in the date range
        while (true) {
            const batch = await fetchActivities(token.accessToken, { after, page, perPage: 50 });
            if (!batch.length) break;
            allActivities = allActivities.concat(batch);
            if (batch.length < 50) break;
            page++;
        }

        let created = 0;
        let skipped = 0;

        for (const activity of allActivities) {
            const activityDate = new Date(activity.start_date_local);
            const dateStr = activityDate.toISOString().split('T')[0];

            // Get or create the daily log for this date
            let dailyLog = await prisma.dailyLog.findFirst({
                where: { userId: req.userId, date: new Date(dateStr) }
            });

            if (!dailyLog) {
                dailyLog = await prisma.dailyLog.create({
                    data: { userId: req.userId, date: new Date(dateStr) }
                });
            }

            // Check if we already imported this activity (by matching strava name + time)
            const startTime = activityDate.toTimeString().slice(0, 5);
            const existing = await prisma.workout.findFirst({
                where: {
                    dailyLogId: dailyLog.id,
                    startTime,
                    notes: { startsWith: 'Strava:' }
                }
            });

            if (existing) {
                skipped++;
                continue;
            }

            const workoutData = activityToWorkout(activity);
            await prisma.workout.create({
                data: { dailyLogId: dailyLog.id, ...workoutData }
            });
            created++;
        }

        // Update last sync timestamp
        await prisma.stravaToken.update({
            where: { userId: req.userId },
            data: { lastSyncAt: new Date() }
        });

        res.json({
            success: true,
            summary: {
                activitiesFound: allActivities.length,
                workoutsCreated: created,
                duplicatesSkipped: skipped,
                syncedDays: days
            }
        });
    } catch (err) {
        console.error('Strava sync error:', err);
        res.status(500).json({ error: err.message || 'Failed to sync Strava activities' });
    }
});

module.exports = router;
