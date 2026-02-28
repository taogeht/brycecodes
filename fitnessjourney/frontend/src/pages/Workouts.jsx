import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import api from '../api/client';

const TYPES = ['walk', 'strength', 'cardio', 'run', 'cycling', 'swim', 'yoga'];
const ICONS = { walk: '🚶', strength: '🏋️', cardio: '🏃', run: '🏃', cycling: '🚴', swim: '🏊', yoga: '🧘' };

export default function Workouts() {
    const [workouts, setWorkouts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const initForm = { date: format(new Date(), 'yyyy-MM-dd'), type: 'walk', startTime: '', endTime: '', durationMins: '', activeCalories: '', totalCalories: '', avgHeartRate: '', maxHeartRate: '', distanceKm: '', effortLevel: 3, notes: '' };
    const [form, setForm] = useState(initForm);

    useEffect(() => { load(); }, []);
    const load = async () => {
        try { const r = await api.get(`/logs/${format(new Date(), 'yyyy-MM-dd')}`); setWorkouts(r.data?.workouts || []); } catch (e) { } finally { setLoading(false); }
    };
    const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
    const inp = (label, key, type = 'text', extra = {}) => (
        <div><label className="block text-sm text-surface-200 mb-1">{label}</label>
            <input type={type} value={form[key]} onChange={e => f(key, e.target.value)} className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none" {...extra} /></div>
    );

    const handleSubmit = async (e) => {
        e.preventDefault(); setSaving(true);
        try {
            const lr = await api.post('/logs', { date: form.date });
            await api.post('/workouts', { dailyLogId: lr.data.id, type: form.type, startTime: form.startTime || null, endTime: form.endTime || null, durationMins: form.durationMins || null, activeCalories: form.activeCalories || null, totalCalories: form.totalCalories || null, avgHeartRate: form.avgHeartRate || null, maxHeartRate: form.maxHeartRate || null, distanceKm: form.distanceKm || null, effortLevel: form.effortLevel, notes: form.notes });
            await load(); setShowForm(false); setForm(initForm);
        } catch (e) { console.error(e); } finally { setSaving(false); }
    };

    const del = async (id) => { await api.delete(`/workouts/${id}`); setWorkouts(w => w.filter(x => x.id !== id)); };

    if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent" /></div>;

    return (
        <div className="space-y-6 max-w-3xl">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Workouts</h1>
                <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium transition-all">{showForm ? 'Cancel' : '+ Log Workout'}</button>
            </div>
            {showForm && (
                <form onSubmit={handleSubmit} className="bg-surface-900 border border-surface-800 rounded-2xl p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        {inp('Date', 'date', 'date')}
                        <div><label className="block text-sm text-surface-200 mb-1">Type</label>
                            <select value={form.type} onChange={e => f('type', e.target.value)} className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none">
                                {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                            </select></div>
                        {inp('Start Time', 'startTime', 'time')}
                        {inp('End Time', 'endTime', 'time')}
                        {inp('Duration (min)', 'durationMins', 'number')}
                        {inp('Active Calories', 'activeCalories', 'number')}
                        {inp('Distance (km)', 'distanceKm', 'number', { step: '0.1' })}
                        {inp('Avg Heart Rate', 'avgHeartRate', 'number')}
                        {inp('Max Heart Rate', 'maxHeartRate', 'number')}
                        <div><label className="block text-sm text-surface-200 mb-1">Effort</label>
                            <div className="flex gap-2 mt-1">{[1, 2, 3, 4, 5].map(l => (
                                <button key={l} type="button" onClick={() => f('effortLevel', l)} className={`w-10 h-10 rounded-xl font-bold transition-all ${form.effortLevel >= l ? 'bg-primary-600 text-white' : 'bg-surface-800 text-surface-200 border border-surface-700'}`}>{l}</button>
                            ))}</div></div>
                    </div>
                    <div><label className="block text-sm text-surface-200 mb-1">Notes</label>
                        <textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={3} placeholder="Paste Apple Watch stats..." className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none" /></div>
                    <button type="submit" disabled={saving} className="px-8 py-3 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold hover:from-primary-500 hover:to-primary-400 transition-all shadow-lg shadow-primary-600/30 disabled:opacity-50">{saving ? 'Saving...' : 'Save Workout'}</button>
                </form>
            )}
            <div className="space-y-3">
                {workouts.length === 0 ? (
                    <div className="bg-surface-900 border border-surface-800 rounded-2xl p-8 text-center text-surface-200"><p className="text-4xl mb-3">🏃</p><p>No workouts logged today.</p></div>
                ) : workouts.map(w => (
                    <div key={w.id} className="bg-surface-900 border border-surface-800 rounded-2xl p-5 hover:border-surface-700 transition-all">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3"><span className="text-2xl">{ICONS[w.type] || '🏃'}</span><div><p className="font-semibold capitalize">{w.type}</p>{w.startTime && <p className="text-sm text-surface-200">{w.startTime} - {w.endTime}</p>}</div></div>
                            <button onClick={() => del(w.id)} className="text-red-400/60 hover:text-red-400 text-sm">Delete</button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {w.durationMins && <div className="p-2 rounded-lg bg-surface-800/50 text-center"><p className="text-xs text-surface-200">Duration</p><p className="font-bold">{w.durationMins}m</p></div>}
                            {w.activeCalories && <div className="p-2 rounded-lg bg-surface-800/50 text-center"><p className="text-xs text-surface-200">Active Cal</p><p className="font-bold">{w.activeCalories}</p></div>}
                            {w.distanceKm && <div className="p-2 rounded-lg bg-surface-800/50 text-center"><p className="text-xs text-surface-200">Distance</p><p className="font-bold">{w.distanceKm}km</p></div>}
                            {w.avgHeartRate && <div className="p-2 rounded-lg bg-surface-800/50 text-center"><p className="text-xs text-surface-200">Avg HR</p><p className="font-bold">{w.avgHeartRate}bpm</p></div>}
                        </div>
                        {w.notes && <p className="mt-3 text-sm text-surface-200 bg-surface-800/30 p-3 rounded-lg">{w.notes}</p>}
                    </div>
                ))}
            </div>
        </div>
    );
}
