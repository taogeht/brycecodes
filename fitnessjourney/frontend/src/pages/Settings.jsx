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
    const [apiKey, setApiKey] = useState(null);
    const [apiKeyVisible, setApiKeyVisible] = useState(false);
    const [apiKeyLoading, setApiKeyLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [allUsers, setAllUsers] = useState([]);
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [addingUser, setAddingUser] = useState(false);
    const [userMsg, setUserMsg] = useState(null);
    const [strava, setStrava] = useState({ connected: false });
    const [stravaLoading, setStravaLoading] = useState(false);
    const [syncDays, setSyncDays] = useState(7);
    const [syncResult, setSyncResult] = useState(null);
    const [syncing, setSyncing] = useState(false);

    const SUPPLEMENTS = ['Creatine', 'Magnesium', 'Caffeine', 'Whey Protein', 'Fish Oil', 'Vitamin D', 'Zinc', 'Multivitamin'];

    // Handle Strava OAuth callback redirect
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const scope = params.get('scope');
        if (code) {
            // Clean the URL
            window.history.replaceState({}, '', window.location.pathname);
            api.get(`/strava/callback?code=${code}&scope=${scope || ''}`)
                .then(() => api.get('/strava/status'))
                .then(({ data }) => setStrava(data))
                .catch(err => console.error('Strava callback error:', err));
        }
    }, []);

    useEffect(() => {
        const fetches = [
            api.get('/goals'),
            api.get('/templates'),
            api.get('/apikeys'),
            api.get('/strava/status')
        ];
        if (user?.isAdmin) fetches.push(api.get('/auth/users'));
        Promise.all(fetches).then(([g, t, k, s, u]) => {
            setGoals(g.data);
            setTemplates(t.data);
            setApiKey(k.data.apiKey);
            setStrava(s.data);
            if (u) setAllUsers(u.data);
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

    const regenerateApiKey = async () => {
        if (!confirm('Are you sure? Your old API key will stop working immediately.')) return;
        setApiKeyLoading(true);
        try {
            const { data } = await api.post('/apikeys/regenerate');
            setApiKey(data.apiKey);
            setApiKeyVisible(true);
        } catch (e) { console.error(e); } finally { setApiKeyLoading(false); }
    };

    const copyApiKey = () => {
        navigator.clipboard.writeText(apiKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const maskedKey = apiKey ? apiKey.slice(0, 8) + '••••••••••••••••' + apiKey.slice(-8) : '—';

    const goalLabels = { weight: '⚖️ Weight (kg)', calories: '🔥 Daily Calories', protein: '💪 Protein (g)', steps: '👟 Daily Steps', hydration: '💧 Hydration (ml)', sleep: '😴 Sleep (hrs)', body_fat: '📉 Body Fat %', exercise_mins: '⏱️ Exercise (mins)' };

    const addUser = async (e) => {
        e.preventDefault();
        setAddingUser(true);
        setUserMsg(null);
        try {
            const { data } = await api.post('/auth/users', { email: newUserEmail, password: newUserPassword });
            setAllUsers(prev => [{ ...data, createdAt: new Date().toISOString() }, ...prev]);
            setNewUserEmail('');
            setNewUserPassword('');
            setUserMsg({ type: 'success', text: `User ${data.email} created successfully` });
        } catch (err) {
            setUserMsg({ type: 'error', text: err.response?.data?.error || 'Failed to create user' });
        } finally {
            setAddingUser(false);
        }
    };

    const connectStrava = async () => {
        setStravaLoading(true);
        try {
            const { data } = await api.get('/strava/auth-url');
            window.location.href = data.url;
        } catch (e) { console.error(e); setStravaLoading(false); }
    };

    const disconnectStrava = async () => {
        if (!confirm('Disconnect Strava? Your synced workouts will remain.')) return;
        setStravaLoading(true);
        try {
            await api.post('/strava/disconnect');
            setStrava({ connected: false });
            setSyncResult(null);
        } catch (e) { console.error(e); } finally { setStravaLoading(false); }
    };

    const syncStrava = async () => {
        setSyncing(true);
        setSyncResult(null);
        try {
            const { data } = await api.post('/strava/sync', { days: syncDays });
            setSyncResult(data.summary);
            const s = await api.get('/strava/status');
            setStrava(s.data);
        } catch (e) {
            setSyncResult({ error: e.response?.data?.error || 'Sync failed' });
        } finally { setSyncing(false); }
    };

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

            {/* API Key */}
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-2">API Key</h2>
                <p className="text-sm text-surface-200 mb-4">Use this key to authenticate external tools (e.g. OpenClaw). Send it as an <code className="text-primary-400 bg-surface-800 px-1.5 py-0.5 rounded">X-API-Key</code> header.</p>
                {apiKey ? (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <code className="flex-1 px-4 py-2.5 rounded-xl bg-surface-800 border border-surface-700 text-sm font-mono text-surface-100 break-all select-all">
                                {apiKeyVisible ? apiKey : maskedKey}
                            </code>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setApiKeyVisible(!apiKeyVisible)}
                                className="px-4 py-2 rounded-xl bg-surface-800 hover:bg-surface-700 text-sm text-surface-200 hover:text-white transition-all"
                            >
                                {apiKeyVisible ? '🙈 Hide' : '👁️ Reveal'}
                            </button>
                            <button
                                onClick={copyApiKey}
                                className="px-4 py-2 rounded-xl bg-surface-800 hover:bg-surface-700 text-sm text-surface-200 hover:text-white transition-all"
                            >
                                {copied ? '✅ Copied!' : '📋 Copy'}
                            </button>
                            <button
                                onClick={regenerateApiKey}
                                disabled={apiKeyLoading}
                                className="px-4 py-2 rounded-xl bg-red-900/20 hover:bg-red-900/40 text-sm text-red-400 hover:text-red-300 transition-all disabled:opacity-50"
                            >
                                {apiKeyLoading ? 'Regenerating...' : '🔄 Regenerate'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-3">
                        <p className="text-sm text-surface-400">No API key yet.</p>
                        <button
                            onClick={regenerateApiKey}
                            disabled={apiKeyLoading}
                            className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-sm text-white font-medium transition-all disabled:opacity-50"
                        >
                            {apiKeyLoading ? 'Generating...' : 'Generate API Key'}
                        </button>
                    </div>
                )}
            </div>

            {/* Strava Integration */}
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-[#FC4C02] flex items-center justify-center text-white font-bold text-lg">S</div>
                    <div>
                        <h2 className="text-lg font-semibold">Strava</h2>
                        <p className="text-sm text-surface-200">Sync your activities automatically</p>
                    </div>
                </div>

                {strava.connected ? (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-900/20 border border-green-500/20">
                            <span className="text-green-400 text-sm font-medium">Connected</span>
                            <span className="text-surface-400 text-sm">Athlete #{strava.athleteId}</span>
                            {strava.lastSyncAt && (
                                <span className="text-surface-400 text-sm ml-auto">Last sync: {new Date(strava.lastSyncAt).toLocaleDateString()}</span>
                            )}
                        </div>

                        <div className="flex items-end gap-3">
                            <div>
                                <label className="block text-sm text-surface-200 mb-1">Sync last N days</label>
                                <select value={syncDays} onChange={e => setSyncDays(Number(e.target.value))} className="px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none">
                                    <option value={3}>3 days</option>
                                    <option value={7}>7 days</option>
                                    <option value={14}>14 days</option>
                                    <option value={30}>30 days</option>
                                    <option value={90}>90 days</option>
                                </select>
                            </div>
                            <button onClick={syncStrava} disabled={syncing} className="px-6 py-2 rounded-xl bg-[#FC4C02] hover:bg-[#e04400] text-white font-medium disabled:opacity-50 transition-all">
                                {syncing ? 'Syncing...' : 'Sync Now'}
                            </button>
                            <button onClick={disconnectStrava} disabled={stravaLoading} className="px-4 py-2 rounded-xl bg-red-900/20 hover:bg-red-900/40 text-sm text-red-400 hover:text-red-300 transition-all disabled:opacity-50 ml-auto">
                                Disconnect
                            </button>
                        </div>

                        {syncResult && (
                            <div className={`px-4 py-3 rounded-xl text-sm ${syncResult.error ? 'bg-red-900/20 border border-red-500/20 text-red-400' : 'bg-green-900/20 border border-green-500/20 text-green-400'}`}>
                                {syncResult.error ? (
                                    <span>{syncResult.error}</span>
                                ) : (
                                    <span>Found {syncResult.activitiesFound} activities — {syncResult.workoutsCreated} new workouts created, {syncResult.duplicatesSkipped} duplicates skipped</span>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <button onClick={connectStrava} disabled={stravaLoading} className="px-6 py-2.5 rounded-xl bg-[#FC4C02] hover:bg-[#e04400] text-white font-medium disabled:opacity-50 transition-all">
                        {stravaLoading ? 'Connecting...' : 'Connect Strava'}
                    </button>
                )}
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
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

            {/* User Management (admin only) */}
            {user?.isAdmin && (
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4">👥 User Management</h2>

                    {userMsg && (
                        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${userMsg.type === 'success'
                                ? 'bg-green-900/20 border border-green-500/20 text-green-400'
                                : 'bg-red-900/20 border border-red-500/20 text-red-400'
                            }`}>
                            {userMsg.type === 'success' ? '✅' : '❌'} {userMsg.text}
                        </div>
                    )}

                    {/* Add User form */}
                    <form onSubmit={addUser} className="space-y-3 mb-6">
                        <p className="text-sm text-surface-200 font-medium">Add New User</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <input
                                type="email"
                                placeholder="Email"
                                value={newUserEmail}
                                onChange={e => setNewUserEmail(e.target.value)}
                                required
                                className="px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            />
                            <input
                                type="password"
                                placeholder="Password"
                                value={newUserPassword}
                                onChange={e => setNewUserPassword(e.target.value)}
                                required
                                minLength={6}
                                className="px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={addingUser}
                            className="px-6 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium disabled:opacity-50 transition-all"
                        >
                            {addingUser ? 'Adding...' : 'Add User'}
                        </button>
                    </form>

                    {/* Existing users list */}
                    {allUsers.length > 0 && (
                        <div>
                            <p className="text-sm text-surface-200 font-medium mb-3">Existing Users</p>
                            <div className="space-y-2">
                                {allUsers.map(u => (
                                    <div key={u.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-800/50">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-sm font-bold">
                                                {u.name?.[0] || u.email[0].toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-medium text-sm">{u.name || u.email.split('@')[0]}</p>
                                                <p className="text-xs text-surface-200">{u.email}</p>
                                            </div>
                                        </div>
                                        <span className="text-xs text-surface-400">
                                            {new Date(u.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
