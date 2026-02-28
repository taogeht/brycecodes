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
    const [form, setForm] = useState({ weightKg: '', wakeTime: '', sleepTime: '', notes: '', hydrationMl: 0, stressLevel: 0, energyLevel: 0, sorenessNotes: '' });
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
                    notes: res.data.notes || '',
                    hydrationMl: res.data.hydrationMl || 0,
                    stressLevel: res.data.stressLevel || 0,
                    energyLevel: res.data.energyLevel || 0,
                    sorenessNotes: res.data.sorenessNotes || ''
                });
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [date]);

    const saveLog = async () => {
        try {
            const res = await api.post('/logs', {
                date, ...form,
                weightKg: form.weightKg ? parseFloat(form.weightKg) : null,
                hydrationMl: parseInt(form.hydrationMl) || 0,
                stressLevel: parseInt(form.stressLevel) || null,
                energyLevel: parseInt(form.energyLevel) || null
            });
            setLog(res.data);
            setEditing(false);
        } catch (err) { console.error('Save error:', err); }
    };

    const addWater = async (ml) => {
        const newMl = (form.hydrationMl || 0) + ml;
        setForm(f => ({ ...f, hydrationMl: newMl }));
        try {
            const res = await api.post('/logs', {
                date,
                hydrationMl: newMl,
                weightKg: form.weightKg ? parseFloat(form.weightKg) : null,
                wakeTime: form.wakeTime || null,
                sleepTime: form.sleepTime || null,
                notes: form.notes || null,
                stressLevel: parseInt(form.stressLevel) || null,
                energyLevel: parseInt(form.energyLevel) || null,
                sorenessNotes: form.sorenessNotes || null
            });
            setLog(res.data);
        } catch (err) { console.error('Hydration error:', err); }
    };

    const addSupplement = async () => {
        if (!supplementForm.name) return;
        try {
            let logId = log?.id;
            if (!logId) {
                const logRes = await api.post('/logs', { date });
                logId = logRes.data.id;
            }
            await api.post('/supplements', { dailyLogId: logId, ...supplementForm, doseMg: supplementForm.doseMg ? parseFloat(supplementForm.doseMg) : null });
            const res = await api.get(`/logs/${date}`);
            setLog(res.data);
            setSupplementForm({ name: '', doseMg: '', takenAt: '' });
        } catch (err) { console.error('Add supplement error:', err); }
    };

    const prevDay = () => navigate(`/log/${format(subDays(parseISO(date), 1), 'yyyy-MM-dd')}`);
    const nextDay = () => navigate(`/log/${format(addDays(parseISO(date), 1), 'yyyy-MM-dd')}`);

    if (loading) {
        return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent" /></div>;
    }

    const meals = log?.meals || [];
    const workouts = log?.workouts || [];
    const supplements = log?.supplements || [];
    const hydrationGoal = 2500;
    const hydrationPct = Math.min((form.hydrationMl / hydrationGoal) * 100, 100);

    return (
        <div className="space-y-6">
            {/* Date Navigation */}
            <div className="flex items-center justify-between">
                <button onClick={prevDay} className="p-2 rounded-xl bg-surface-900 border border-surface-800 hover:bg-surface-800 transition-all">← Prev</button>
                <div className="text-center">
                    <h1 className="text-2xl font-bold">{format(parseISO(date), 'EEEE')}</h1>
                    <p className="text-surface-200">{format(parseISO(date), 'MMMM d, yyyy')}</p>
                </div>
                <button onClick={nextDay} className="p-2 rounded-xl bg-surface-900 border border-surface-800 hover:bg-surface-800 transition-all">Next →</button>
            </div>

            {/* Morning Stats */}
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Morning Stats</h2>
                    <button onClick={() => setEditing(!editing)} className="text-sm text-primary-400 hover:text-primary-300 transition-colors">{editing ? 'Cancel' : 'Edit'}</button>
                </div>
                {editing ? (
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-surface-200 mb-1">Weight (kg)</label>
                            <input type="number" step="0.1" value={form.weightKg} onChange={e => setForm(f => ({ ...f, weightKg: e.target.value }))}
                                className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm text-surface-200 mb-1">Wake Time</label>
                            <input type="time" value={form.wakeTime} onChange={e => setForm(f => ({ ...f, wakeTime: e.target.value }))}
                                className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm text-surface-200 mb-1">Sleep Time</label>
                            <input type="time" value={form.sleepTime} onChange={e => setForm(f => ({ ...f, sleepTime: e.target.value }))}
                                className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm text-surface-200 mb-1">Notes</label>
                            <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                        </div>
                        <div className="col-span-2">
                            <button onClick={saveLog} className="px-6 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium transition-all">Save</button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-3 rounded-xl bg-surface-800/50"><p className="text-sm text-surface-200">Weight</p><p className="text-xl font-bold">{log?.weightKg ? `${log.weightKg} kg` : '—'}</p></div>
                        <div className="p-3 rounded-xl bg-surface-800/50"><p className="text-sm text-surface-200">Wake</p><p className="text-xl font-bold">{log?.wakeTime || '—'}</p></div>
                        <div className="p-3 rounded-xl bg-surface-800/50"><p className="text-sm text-surface-200">Sleep</p><p className="text-xl font-bold">{log?.sleepTime || '—'}</p></div>
                        <div className="p-3 rounded-xl bg-surface-800/50"><p className="text-sm text-surface-200">Notes</p><p className="text-sm">{log?.notes || '—'}</p></div>
                    </div>
                )}
            </div>

            {/* Hydration + Wellness */}
            <div className="grid md:grid-cols-2 gap-6">
                {/* Hydration Tracker */}
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4">💧 Hydration</h2>
                    <div className="flex items-center gap-6 mb-4">
                        <div className="relative w-16 h-24 bg-surface-800 rounded-2xl overflow-hidden border-2 border-surface-700">
                            <div className="absolute bottom-0 w-full bg-blue-500/60 transition-all duration-500" style={{ height: `${hydrationPct}%` }} />
                            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">{Math.round(hydrationPct)}%</div>
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{form.hydrationMl >= 1000 ? `${(form.hydrationMl / 1000).toFixed(1)}L` : `${form.hydrationMl}ml`}</p>
                            <p className="text-sm text-surface-200">of {hydrationGoal / 1000}L goal</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {[250, 500, 750].map(ml => (
                            <button key={ml} onClick={() => addWater(ml)} className="flex-1 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium hover:bg-blue-500/20 transition-all">
                                +{ml}ml
                            </button>
                        ))}
                    </div>
                </div>

                {/* Wellness */}
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4">🌡️ Wellness Check</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm text-surface-200 mb-2">⚡ Energy Level</label>
                            <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map(n => (
                                    <button key={n} onClick={() => {
                                        setForm(f => ({ ...f, energyLevel: n }));
                                        api.post('/logs', { date, energyLevel: n, hydrationMl: form.hydrationMl, weightKg: form.weightKg ? parseFloat(form.weightKg) : null, wakeTime: form.wakeTime || null, sleepTime: form.sleepTime || null, notes: form.notes || null, stressLevel: parseInt(form.stressLevel) || null, sorenessNotes: form.sorenessNotes || null }).catch(console.error);
                                    }}
                                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${form.energyLevel >= n ? 'bg-amber-500/30 text-amber-400 border border-amber-500/40' : 'bg-surface-800 border border-surface-700 text-surface-200'}`}>
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm text-surface-200 mb-2">😰 Stress Level</label>
                            <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map(n => (
                                    <button key={n} onClick={() => {
                                        setForm(f => ({ ...f, stressLevel: n }));
                                        api.post('/logs', { date, stressLevel: n, hydrationMl: form.hydrationMl, weightKg: form.weightKg ? parseFloat(form.weightKg) : null, wakeTime: form.wakeTime || null, sleepTime: form.sleepTime || null, notes: form.notes || null, energyLevel: parseInt(form.energyLevel) || null, sorenessNotes: form.sorenessNotes || null }).catch(console.error);
                                    }}
                                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${form.stressLevel >= n ? 'bg-red-500/30 text-red-400 border border-red-500/40' : 'bg-surface-800 border border-surface-700 text-surface-200'}`}>
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm text-surface-200 mb-1">💪 Soreness Notes</label>
                            <input type="text" value={form.sorenessNotes} placeholder="e.g. legs sore from squats"
                                onChange={e => setForm(f => ({ ...f, sorenessNotes: e.target.value }))}
                                onBlur={() => { if (form.sorenessNotes) api.post('/logs', { date, sorenessNotes: form.sorenessNotes, hydrationMl: form.hydrationMl, weightKg: form.weightKg ? parseFloat(form.weightKg) : null, wakeTime: form.wakeTime || null, sleepTime: form.sleepTime || null, notes: form.notes || null, stressLevel: parseInt(form.stressLevel) || null, energyLevel: parseInt(form.energyLevel) || null }).catch(console.error); }}
                                className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                        </div>
                    </div>
                </div>
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
                                {meal.photoUrl && <img src={meal.photoUrl} alt={meal.name} className="w-16 h-16 rounded-xl object-cover" />}
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
                                    {w.volumeLoad && <span>📊 {w.volumeLoad.toLocaleString()}kg volume</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Sleep Data (if exists) */}
            {log?.sleep && (
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4">😴 Sleep</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-3 rounded-xl bg-surface-800/50">
                            <p className="text-sm text-surface-200">Total</p>
                            <p className="text-xl font-bold">{Math.floor(log.sleep.totalMins / 60)}h {log.sleep.totalMins % 60}m</p>
                        </div>
                        {log.sleep.deepMins && <div className="p-3 rounded-xl bg-surface-800/50"><p className="text-sm text-surface-200">Deep</p><p className="text-xl font-bold">{log.sleep.deepMins}m <span className="text-sm text-surface-200">{log.sleep.deepSleepPct}%</span></p></div>}
                        {log.sleep.remMins && <div className="p-3 rounded-xl bg-surface-800/50"><p className="text-sm text-surface-200">REM</p><p className="text-xl font-bold">{log.sleep.remMins}m <span className="text-sm text-surface-200">{log.sleep.remPct}%</span></p></div>}
                        {log.sleep.qualityScore && <div className="p-3 rounded-xl bg-surface-800/50"><p className="text-sm text-surface-200">Quality</p><p className="text-xl font-bold">⭐ {log.sleep.qualityScore}/5</p></div>}
                    </div>
                </div>
            )}

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
                <div className="flex gap-2 items-end">
                    <div className="flex-1">
                        <input placeholder="Supplement name" value={supplementForm.name} onChange={e => setSupplementForm(f => ({ ...f, name: e.target.value }))}
                            className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                    </div>
                    <input placeholder="Dose (mg)" type="number" value={supplementForm.doseMg} onChange={e => setSupplementForm(f => ({ ...f, doseMg: e.target.value }))}
                        className="w-24 px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                    <input type="time" value={supplementForm.takenAt} onChange={e => setSupplementForm(f => ({ ...f, takenAt: e.target.value }))}
                        className="px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                    <button onClick={addSupplement} className="px-4 py-2 rounded-xl bg-accent-600 hover:bg-accent-500 text-white text-sm font-medium transition-all">Add</button>
                </div>
            </div>
        </div>
    );
}
