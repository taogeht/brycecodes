import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format, parseISO, addDays, subDays } from 'date-fns';
import api from '../api/client';

export default function DailyLog() {
    const { date } = useParams();
    const navigate = useNavigate();
    const [log, setLog] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({ weightKg: '', wakeTime: '', sleepTime: '', notes: '' });
    const [supplementForm, setSupplementForm] = useState({ name: '', doseMg: '', takenAt: '' });

    useEffect(() => {
        setLoading(true);
        api.get(`/logs/${date}`)
            .then(res => {
                setLog(res.data);
                setForm({
                    weightKg: res.data.weightKg || '',
                    wakeTime: res.data.wakeTime || '',
                    sleepTime: res.data.sleepTime || '',
                    notes: res.data.notes || ''
                });
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [date]);

    const saveLog = async () => {
        try {
            const res = await api.post('/logs', { date, ...form, weightKg: form.weightKg ? parseFloat(form.weightKg) : null });
            setLog(res.data);
            setEditing(false);
        } catch (err) {
            console.error('Save error:', err);
        }
    };

    const addSupplement = async () => {
        if (!supplementForm.name) return;
        try {
            // Ensure daily log exists
            let logId = log?.id;
            if (!logId) {
                const logRes = await api.post('/logs', { date });
                logId = logRes.data.id;
            }
            await api.post('/supplements', { dailyLogId: logId, ...supplementForm, doseMg: supplementForm.doseMg ? parseFloat(supplementForm.doseMg) : null });
            // Refresh
            const res = await api.get(`/logs/${date}`);
            setLog(res.data);
            setSupplementForm({ name: '', doseMg: '', takenAt: '' });
        } catch (err) {
            console.error('Add supplement error:', err);
        }
    };

    const prevDay = () => navigate(`/log/${format(subDays(parseISO(date), 1), 'yyyy-MM-dd')}`);
    const nextDay = () => navigate(`/log/${format(addDays(parseISO(date), 1), 'yyyy-MM-dd')}`);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent" />
            </div>
        );
    }

    const meals = log?.meals || [];
    const workouts = log?.workouts || [];
    const supplements = log?.supplements || [];

    return (
        <div className="space-y-6">
            {/* Date Navigation */}
            <div className="flex items-center justify-between">
                <button onClick={prevDay} className="p-2 rounded-xl bg-surface-900 border border-surface-800 hover:bg-surface-800 transition-all">
                    ← Prev
                </button>
                <div className="text-center">
                    <h1 className="text-2xl font-bold">{format(parseISO(date), 'EEEE')}</h1>
                    <p className="text-surface-200">{format(parseISO(date), 'MMMM d, yyyy')}</p>
                </div>
                <button onClick={nextDay} className="p-2 rounded-xl bg-surface-900 border border-surface-800 hover:bg-surface-800 transition-all">
                    Next →
                </button>
            </div>

            {/* Morning Stats */}
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Morning Stats</h2>
                    <button onClick={() => setEditing(!editing)} className="text-sm text-primary-400 hover:text-primary-300 transition-colors">
                        {editing ? 'Cancel' : 'Edit'}
                    </button>
                </div>

                {editing ? (
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-surface-200 mb-1">Weight (kg)</label>
                            <input
                                type="number" step="0.1"
                                value={form.weightKg}
                                onChange={e => setForm(f => ({ ...f, weightKg: e.target.value }))}
                                className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-surface-200 mb-1">Wake Time</label>
                            <input
                                type="time"
                                value={form.wakeTime}
                                onChange={e => setForm(f => ({ ...f, wakeTime: e.target.value }))}
                                className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-surface-200 mb-1">Sleep Time</label>
                            <input
                                type="time"
                                value={form.sleepTime}
                                onChange={e => setForm(f => ({ ...f, sleepTime: e.target.value }))}
                                className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-surface-200 mb-1">Notes</label>
                            <input
                                type="text"
                                value={form.notes}
                                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            />
                        </div>
                        <div className="col-span-2">
                            <button onClick={saveLog} className="px-6 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium transition-all">
                                Save
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-3 rounded-xl bg-surface-800/50">
                            <p className="text-sm text-surface-200">Weight</p>
                            <p className="text-xl font-bold">{log?.weightKg ? `${log.weightKg} kg` : '—'}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-surface-800/50">
                            <p className="text-sm text-surface-200">Wake Time</p>
                            <p className="text-xl font-bold">{log?.wakeTime || '—'}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-surface-800/50">
                            <p className="text-sm text-surface-200">Sleep Time</p>
                            <p className="text-xl font-bold">{log?.sleepTime || '—'}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-surface-800/50">
                            <p className="text-sm text-surface-200">Notes</p>
                            <p className="text-sm">{log?.notes || '—'}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Meals */}
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Meals ({meals.length})</h2>
                    <a href="/meals/add" className="text-sm text-primary-400 hover:text-primary-300">+ Add Meal</a>
                </div>
                {meals.length === 0 ? (
                    <p className="text-surface-200 text-sm">No meals logged yet.</p>
                ) : (
                    <div className="space-y-3">
                        {meals.map(meal => (
                            <div key={meal.id} className="flex items-center gap-4 p-4 rounded-xl bg-surface-800/50 hover:bg-surface-800 transition-all">
                                {meal.photoUrl && (
                                    <img src={meal.photoUrl} alt={meal.name} className="w-16 h-16 rounded-xl object-cover" />
                                )}
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-calories/20 text-calories">{meal.mealType}</span>
                                        <span className="font-medium">{meal.name}</span>
                                    </div>
                                    <div className="flex gap-4 mt-1 text-sm text-surface-200">
                                        {meal.calories && <span>{meal.calories} kcal</span>}
                                        {meal.proteinG && <span>{meal.proteinG}g protein</span>}
                                        {meal.carbsG && <span>{meal.carbsG}g carbs</span>}
                                        {meal.fatG && <span>{meal.fatG}g fat</span>}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Workouts */}
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Workouts ({workouts.length})</h2>
                    <a href="/workouts" className="text-sm text-primary-400 hover:text-primary-300">+ Add Workout</a>
                </div>
                {workouts.length === 0 ? (
                    <p className="text-surface-200 text-sm">No workouts logged yet.</p>
                ) : (
                    <div className="space-y-3">
                        {workouts.map(w => (
                            <div key={w.id} className="p-4 rounded-xl bg-surface-800/50">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">{w.type === 'walk' ? '🚶' : w.type === 'strength' ? '🏋️' : '🏃'}</span>
                                        <span className="font-medium capitalize">{w.type}</span>
                                    </div>
                                    <span className="text-surface-200 text-sm">{w.durationMins ? `${w.durationMins} min` : ''}</span>
                                </div>
                                <div className="flex gap-4 mt-2 text-sm text-surface-200">
                                    {w.activeCalories && <span>🔥 {w.activeCalories} active cal</span>}
                                    {w.distanceKm && <span>📏 {w.distanceKm} km</span>}
                                    {w.avgHeartRate && <span>❤️ {w.avgHeartRate} avg bpm</span>}
                                    {w.effortLevel && <span>💪 Effort: {w.effortLevel}/5</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Supplements */}
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4">Supplements</h2>
                <div className="flex flex-wrap gap-2 mb-4">
                    {supplements.map(s => (
                        <span key={s.id} className="px-3 py-1.5 rounded-xl bg-accent-500/10 border border-accent-500/20 text-accent-400 text-sm">
                            ✅ {s.name} {s.doseMg ? `${s.doseMg}mg` : ''} {s.takenAt ? `@ ${s.takenAt}` : ''}
                        </span>
                    ))}
                </div>
                {/* Quick add supplement */}
                <div className="flex gap-2 items-end">
                    <div className="flex-1">
                        <input
                            placeholder="Supplement name"
                            value={supplementForm.name}
                            onChange={e => setSupplementForm(f => ({ ...f, name: e.target.value }))}
                            className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                        />
                    </div>
                    <input
                        placeholder="Dose (mg)"
                        type="number"
                        value={supplementForm.doseMg}
                        onChange={e => setSupplementForm(f => ({ ...f, doseMg: e.target.value }))}
                        className="w-24 px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    />
                    <input
                        type="time"
                        value={supplementForm.takenAt}
                        onChange={e => setSupplementForm(f => ({ ...f, takenAt: e.target.value }))}
                        className="px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    />
                    <button onClick={addSupplement} className="px-4 py-2 rounded-xl bg-accent-600 hover:bg-accent-500 text-white text-sm font-medium transition-all">
                        Add
                    </button>
                </div>
            </div>
        </div>
    );
}
