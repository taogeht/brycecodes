import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format } from 'date-fns';
import api from '../api/client';

const tooltip = { contentStyle: { background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', color: '#fff' } };

export default function Records() {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ exerciseName: '', metricType: 'weight', value: '', date: format(new Date(), 'yyyy-MM-dd'), notes: '' });
    const [saving, setSaving] = useState(false);
    const [lastResult, setLastResult] = useState(null);

    const EXERCISES = ['Bench Press', 'Squat', 'Deadlift', 'Overhead Press', 'Barbell Row', 'Pull-up', 'Bicep Curl', 'Leg Press', 'Lat Pulldown', 'Running', 'Cycling'];
    const METRIC_TYPES = [
        { value: 'weight', label: '🏋️ Weight (kg)' },
        { value: 'reps', label: '🔄 Reps' },
        { value: 'time', label: '⏱️ Time (sec)' },
        { value: 'distance', label: '📏 Distance (km)' }
    ];

    useEffect(() => {
        api.get('/records').then(r => setRecords(r.data)).catch(console.error).finally(() => setLoading(false));
    }, []);

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const { data } = await api.post('/records', { ...form, value: parseFloat(form.value) });
            setRecords([data, ...records]);
            setLastResult(data);
            setForm({ exerciseName: '', metricType: 'weight', value: '', date: format(new Date(), 'yyyy-MM-dd'), notes: '' });
            setTimeout(() => setLastResult(null), 5000);
        } catch (err) { console.error(err); }
        finally { setSaving(false); }
    };

    const deleteRecord = async (id) => {
        await api.delete(`/records/${id}`);
        setRecords(r => r.filter(x => x.id !== id));
    };

    // Group by exercise
    const grouped = records.reduce((acc, r) => {
        const key = `${r.exerciseName} (${r.metricType})`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(r);
        return acc;
    }, {});

    if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent" /></div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">🏆 Personal Records</h1>
                <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-all">
                    {showForm ? 'Cancel' : '+ Log PR'}
                </button>
            </div>

            {/* PR Result Toast */}
            {lastResult && (
                <div className={`p-4 rounded-2xl border ${lastResult.isNewPR ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-surface-900 border-surface-800'} transition-all animate-in`}>
                    {lastResult.isNewPR ? (
                        <p className="text-yellow-400 font-bold text-lg">🎉 New PR! {lastResult.exerciseName}: {lastResult.value} {lastResult.metricType === 'weight' ? 'kg' : lastResult.metricType}
                            {lastResult.previousBest && <span className="text-surface-200 text-sm font-normal ml-2">(prev: {lastResult.previousBest})</span>}
                        </p>
                    ) : (
                        <p className="text-surface-200">Logged {lastResult.exerciseName}: {lastResult.value} {lastResult.metricType === 'weight' ? 'kg' : lastResult.metricType}</p>
                    )}
                </div>
            )}

            {/* Log PR Form */}
            {showForm && (
                <form onSubmit={submit} className="bg-surface-900 border border-surface-800 rounded-2xl p-6 space-y-4">
                    <h2 className="font-semibold">Log Personal Record</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-surface-200 mb-1">Exercise</label>
                            <div className="relative">
                                <input list="exercises" value={form.exerciseName} onChange={e => setForm(f => ({ ...f, exerciseName: e.target.value }))}
                                    placeholder="e.g. Bench Press" required
                                    className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                                <datalist id="exercises">{EXERCISES.map(e => <option key={e} value={e} />)}</datalist>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm text-surface-200 mb-1">Metric Type</label>
                            <select value={form.metricType} onChange={e => setForm(f => ({ ...f, metricType: e.target.value }))}
                                className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none">
                                {METRIC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-surface-200 mb-1">Value</label>
                            <input type="number" step="0.1" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                                placeholder="e.g. 100" required
                                className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm text-surface-200 mb-1">Date</label>
                            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                                className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                        </div>
                    </div>
                    <input placeholder="Notes (optional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                    <button type="submit" disabled={saving} className="px-6 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium disabled:opacity-50 transition-all">
                        {saving ? 'Saving...' : 'Log Record'}
                    </button>
                </form>
            )}

            {/* PR List by Exercise */}
            {Object.keys(grouped).length === 0 ? (
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-12 text-center">
                    <span className="text-4xl mb-4 block">🏆</span>
                    <p className="text-surface-200">No personal records yet. Start logging your PRs!</p>
                </div>
            ) : (
                Object.entries(grouped).map(([exerciseKey, recs]) => {
                    const chartData = [...recs].reverse().map(r => ({
                        date: format(new Date(r.date), 'MMM d'),
                        value: r.value
                    }));
                    const best = Math.max(...recs.map(r => r.value));
                    const unit = recs[0].metricType === 'weight' ? 'kg' : recs[0].metricType === 'distance' ? 'km' : recs[0].metricType === 'time' ? 's' : '';

                    return (
                        <div key={exerciseKey} className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h2 className="text-lg font-semibold">{exerciseKey}</h2>
                                    <p className="text-sm text-surface-200">Best: <span className="text-primary-400 font-bold">{best} {unit}</span> • {recs.length} entries</p>
                                </div>
                            </div>
                            {chartData.length > 1 && (
                                <ResponsiveContainer width="100%" height={150}>
                                    <LineChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                        <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <Tooltip {...tooltip} formatter={v => [`${v} ${unit}`, 'Value']} />
                                        <Line type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                            <div className="space-y-2 mt-3">
                                {recs.slice(0, 5).map(r => (
                                    <div key={r.id} className="flex items-center justify-between text-sm p-2 rounded-lg bg-surface-800/50">
                                        <div className="flex items-center gap-3">
                                            <span className="text-surface-200">{format(new Date(r.date), 'MMM d, yyyy')}</span>
                                            <span className="font-medium">{r.value} {unit}</span>
                                            {r.previousBest && r.value > r.previousBest && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">PR!</span>}
                                        </div>
                                        <button onClick={() => deleteRecord(r.id)} className="text-red-400/50 hover:text-red-400 text-xs">✕</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
}
