'use strict';
// Pure blood-pressure rules (AHA/ACC 2017 home bands). No I/O — unit-tested.
const DAY = 86400000;

const LABELS = { crisis: 'Very high', stage2: 'Stage 2', stage1: 'Stage 1', elevated: 'Elevated', normal: 'Normal' };

function category(sys, dia) {
    if (sys >= 180 || dia >= 120) return 'crisis';
    if (sys >= 140 || dia >= 90) return 'stage2';
    if (sys >= 130 || dia >= 80) return 'stage1';
    if (sys >= 120) return 'elevated';
    return 'normal';
}

const isDateKey = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
const time = key => Date.parse(key + 'T00:00:00Z');
const whole = v => typeof v === 'number' && Number.isInteger(v);

// Returns { error } or { value: { date, sys, dia, pulse } } from loosely-typed input.
function validate(input, todayKey) {
    const b = input || {};
    const date = b.date == null || b.date === '' ? todayKey : b.date;
    const sys = Number(b.sys), dia = Number(b.dia);
    const pulse = b.pulse == null || b.pulse === '' ? null : Number(b.pulse);
    if (!isDateKey(date)) return { error: 'date must be YYYY-MM-DD' };
    if (!whole(sys) || sys < 60 || sys > 260) return { error: 'Systolic must be a whole number from 60 to 260.' };
    if (!whole(dia) || dia < 30 || dia > 160) return { error: 'Diastolic must be a whole number from 30 to 160.' };
    if (dia >= sys) return { error: 'Diastolic should be lower than systolic. Check the order.' };
    if (pulse !== null && (!whole(pulse) || pulse < 30 || pulse > 220)) return { error: 'Pulse must be a whole number from 30 to 220.' };
    return { value: { date, sys, dia, pulse } };
}

// Average window ends at the latest reading's date, not today.
function average(readings, days) {
    if (!readings.length) return null;
    const end = time(readings[readings.length - 1].date);
    const w = readings.filter(r => end - time(r.date) < days * DAY);
    if (!w.length) return null;
    const sys = Math.round(w.reduce((a, r) => a + r.sys, 0) / w.length);
    const dia = Math.round(w.reduce((a, r) => a + r.dia, 0) / w.length);
    return { sys, dia, n: w.length, category: category(sys, dia) };
}

// `readings` must be sorted oldest → newest.
function summarize(readings) {
    if (!readings.length) return { latest: null, avg7: null, avg30: null, alerts: [] };
    const latest = readings[readings.length - 1];
    const end = time(latest.date);
    const avg7 = average(readings, 7), avg30 = average(readings, 30);
    const alerts = [];
    if (readings.some(r => end - time(r.date) < 7 * DAY && (r.sys >= 180 || r.dia >= 120))) {
        alerts.push({ level: 'high', text: 'A reading this week was 180/120 or higher. If that happens again, or comes with symptoms, get medical care promptly.' });
    }
    if (avg7.n >= 5 && (avg7.sys >= 130 || avg7.dia >= 80)) {
        alerts.push({ level: 'note', text: `Your 7-day average is ${avg7.sys}/${avg7.dia}, in the stage 1 range or above. If averages stay there over a few weeks, it's worth bringing this log to a doctor.` });
    }
    return { latest: { ...latest, category: category(latest.sys, latest.dia) }, avg7, avg30, alerts };
}

module.exports = { category, LABELS, validate, average, summarize, isDateKey };
