const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const STRAVA_API = 'https://www.strava.com/api/v3';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';

/**
 * Exchange an authorization code for Strava tokens.
 */
async function exchangeCode(code) {
    const res = await fetch(STRAVA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: process.env.STRAVA_CLIENT_ID,
            client_secret: process.env.STRAVA_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code'
        })
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Strava token exchange failed: ${err}`);
    }
    return res.json();
}

/**
 * Refresh an expired Strava access token and persist the new one.
 */
async function refreshAccessToken(stravaToken) {
    const res = await fetch(STRAVA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: process.env.STRAVA_CLIENT_ID,
            client_secret: process.env.STRAVA_CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: stravaToken.refreshToken
        })
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Strava token refresh failed: ${err}`);
    }
    const data = await res.json();
    const updated = await prisma.stravaToken.update({
        where: { id: stravaToken.id },
        data: {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: data.expires_at
        }
    });
    return updated;
}

/**
 * Get a valid access token for a user, refreshing if expired.
 */
async function getValidToken(userId) {
    let token = await prisma.stravaToken.findUnique({ where: { userId } });
    if (!token) throw new Error('No Strava connection found');

    const now = Math.floor(Date.now() / 1000);
    if (token.expiresAt < now + 60) {
        token = await refreshAccessToken(token);
    }
    return token;
}

/**
 * Make an authenticated GET request to the Strava API.
 */
async function stravaGet(accessToken, path, params = {}) {
    const url = new URL(`${STRAVA_API}${path}`);
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });
    const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Strava API error (${res.status}): ${err}`);
    }
    return res.json();
}

/**
 * Fetch activities from Strava for a given time range.
 */
async function fetchActivities(accessToken, { after, before, page = 1, perPage = 50 }) {
    return stravaGet(accessToken, '/athlete/activities', {
        after,
        before,
        page,
        per_page: perPage
    });
}

/**
 * Map a Strava activity type to our app's workout type.
 */
function mapActivityType(stravaType) {
    const mapping = {
        Run: 'run',
        Trail: 'run',
        TrailRun: 'run',
        VirtualRun: 'run',
        Walk: 'walk',
        Hike: 'hike',
        Ride: 'cycling',
        VirtualRide: 'cycling',
        MountainBikeRide: 'cycling',
        GravelRide: 'cycling',
        EBikeRide: 'cycling',
        Swim: 'swim',
        WeightTraining: 'strength',
        Crossfit: 'strength',
        Workout: 'workout',
        Yoga: 'yoga',
        Rowing: 'rowing',
        Elliptical: 'cardio',
        StairStepper: 'cardio',
        HIIT: 'hiit',
        RockClimbing: 'climbing',
        Soccer: 'sport',
        Tennis: 'sport',
        Pickleball: 'sport',
        Golf: 'sport',
        IceSkate: 'sport',
        Snowboard: 'sport',
        AlpineSki: 'sport',
        NordicSki: 'sport',
    };
    return mapping[stravaType] || 'other';
}

/**
 * Convert a Strava activity into our Workout data shape.
 */
function activityToWorkout(activity) {
    const durationMins = Math.round(activity.moving_time / 60);
    const distanceKm = activity.distance ? +(activity.distance / 1000).toFixed(2) : null;
    const avgPace = (activity.distance && activity.moving_time && ['Run', 'Walk', 'Hike', 'TrailRun'].includes(activity.type))
        ? formatPace(activity.moving_time, activity.distance)
        : null;

    return {
        type: mapActivityType(activity.type),
        startTime: new Date(activity.start_date_local).toTimeString().slice(0, 5),
        durationMins,
        activeCalories: activity.calories || null,
        avgHeartRate: activity.average_heartrate ? Math.round(activity.average_heartrate) : null,
        maxHeartRate: activity.max_heartrate ? Math.round(activity.max_heartrate) : null,
        distanceKm,
        avgPace,
        effortLevel: activity.suffer_score ? Math.min(5, Math.max(1, Math.round(activity.suffer_score / 50))) : null,
        notes: `Strava: ${activity.name}`,
    };
}

function formatPace(movingTimeSecs, distanceMeters) {
    if (!distanceMeters) return null;
    const paceSecsPerKm = movingTimeSecs / (distanceMeters / 1000);
    const mins = Math.floor(paceSecsPerKm / 60);
    const secs = Math.round(paceSecsPerKm % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}/km`;
}

module.exports = {
    exchangeCode,
    refreshAccessToken,
    getValidToken,
    stravaGet,
    fetchActivities,
    mapActivityType,
    activityToWorkout
};
