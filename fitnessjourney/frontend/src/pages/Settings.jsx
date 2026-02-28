import { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../hooks/useAuth';

export default function Settings() {
    const { user } = useAuth();
    const [goals, setGoals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [templates, setTemplates] = useState([]);
    const [form, setForm] = useState({ goalType: 'weight', targetValue: '', targetDate: '' });
    const [saving, setSaving] = useState(false);
    const [weightInput, setWeightInput] = useState('');
    const [weightSaving, setWeightSaving] = useState(false);

    const SUPPLEMENTS = ['Creatine', 'Magnesium', 'Caffeine', 'Whey Protein', 'Fish Oil', 'Vitamin D', 'Zinc', 'Multivitamin'];

    useEffect(() => {
        Promise.all([
            api.get('/goals'),
            api.get('/templates')
        ]).then(([g, t]) => {
            setGoals(g.data);
            setTemplates(t.data);
        }).catch(console.error).finally(() => setLoading(false));
    }, []);

    const addGoal = async (e) => {
        e.preventDefault(); setSaving(true);
        try {
            const r = await api.post('/goals', { ...form, targetValue: parseFloat(form.targetValue) });
            setGoals([r.data, ...goals]);
            setForm({ goalType: 'weight', targetValue: '', targetDate: '' });
        } catch (e) { console.error(e); } finally { setSaving(false); }
    };

    const logWeight = async () => {
        if (!weightInput) return;
        setWeightSaving(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            await api.post('/metrics', { date: today, weightKg: parseFloat(weightInput) });
            setWeightInput('');
        } catch (e) { console.error(e); } finally { setWeightSaving(false); }
    };

    const deleteTemplate = async (id) => {
        await api.delete(`/templates/${id}`);
        setTemplates(t => t.filter(x => x.id !== id));
    };

    const goalLabels = { weight: '⚖️ Weight (kg)', calories: '🔥 Daily Calories', protein: '💪 Protein (g)', steps: '👟 Daily Steps' };

    if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent" /></div>;

    return (
        <div className="space-y-6 max-w-3xl">
            <h1 className="text-2xl font-bold">Settings</h1>

            {/* Profile */}
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4">Profile</h2>
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-2xl font-bold">{user?.name?.[0]}</div>
                    <div><p className="font-semibold text-lg">{user?.name}</p><p className="text-surface-200 text-sm">{user?.email}</p></div>
                </div>
            </div>

            {/* Quick Weight Entry */}
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4">Quick Weigh-In</h2>
                <div className="flex gap-3 items-end">
                    <div className="flex-1">
                        <label className="block text-sm text-surface-200 mb-1">Current Weight (kg)</label>
                        <input type="number" step="0.1" value={weightInput} onChange={e => setWeightInput(e.target.value)} placeholder="e.g. 82.5" className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                    </div>
                    <button onClick={logWeight} disabled={weightSaving} className="px-6 py-2 rounded-xl bg-accent-600 hover:bg-accent-500 text-white font-medium disabled:opacity-50 transition-all">{weightSaving ? 'Saving...' : 'Log'}</button>
                </div>
            </div>

            {/* Goals */}
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4">Goals</h2>
                {goals.length > 0 && (
                    <div className="space-y-3 mb-6">
                        {goals.map(g => (
                            <div key={g.id} className="flex items-center justify-between p-4 rounded-xl bg-surface-800/50">
                                <div className="flex items-center gap-3">
                                    <span className="text-lg">{goalLabels[g.goalType]?.split(' ')[0]}</span>
                                    <div><p className="font-medium capitalize">{g.goalType}</p><p className="text-sm text-surface-200">Target: {g.targetValue}</p></div>
                                </div>
                                {g.targetDate && <span className="text-sm text-surface-200">by {new Date(g.targetDate).toLocaleDateString()}</span>}
                            </div>
                        ))}
                    </div>
                )}
                <form onSubmit={addGoal} className="space-y-4">
                    <p className="text-sm text-surface-200 font-medium">Add New Goal</p>
                    <div className="grid grid-cols-3 gap-3">
                        <select value={form.goalType} onChange={e => setForm(f => ({ ...f, goalType: e.target.value }))} className="px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none">
                            {Object.entries(goalLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <input type="number" step="0.1" placeholder="Target value" value={form.targetValue} onChange={e => setForm(f => ({ ...f, targetValue: e.target.value }))} className="px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none" required />
                        <input type="date" value={form.targetDate} onChange={e => setForm(f => ({ ...f, targetDate: e.target.value }))} className="px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                    </div>
                    <button type="submit" disabled={saving} className="px-6 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium disabled:opacity-50 transition-all">{saving ? 'Saving...' : 'Add Goal'}</button>
                </form>
            </div>

            {/* Supplement Defaults */}
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4">Default Supplements</h2>
                <div className="flex flex-wrap gap-2">
                    {SUPPLEMENTS.map(s => (
                        <span key={s} className="px-4 py-2 rounded-xl bg-accent-500/10 border border-accent-500/20 text-accent-400 text-sm">{s}</span>
                    ))}
                </div>
                <p className="text-xs text-surface-200 mt-3">Quick-add these on your daily log page</p>
            </div>

            {/* Meal Templates */}
            {templates.length > 0 && (
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4">Saved Meal Templates</h2>
                    <div className="space-y-2">
                        {templates.map(t => (
                            <div key={t.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-800/50">
                                <div><p className="font-medium">{t.name}</p><p className="text-xs text-surface-200 capitalize">{t.mealType} • {t.calories ? `${t.calories} kcal` : 'No macros'}</p></div>
                                <button onClick={() => deleteTemplate(t.id)} className="text-red-400/60 hover:text-red-400 text-sm">Delete</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
