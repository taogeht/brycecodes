import { useState, useEffect } from 'react';
import api from '../api/client';

export default function Import() {
    const [raw, setRaw] = useState('');
    const [parsed, setParsed] = useState(null);
    const [errors, setErrors] = useState([]);
    const [status, setStatus] = useState('idle');
    const [result, setResult] = useState(null);
    const [conflictId, setConflictId] = useState(null);
    const [history, setHistory] = useState([]);

    useEffect(() => {
        api.get('/import/history').then(r => setHistory(r.data)).catch(() => { });
    }, []);

    const handleFile = (e) => {
        const file = e.target?.files?.[0] || e.dataTransfer?.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => { setRaw(ev.target.result); handleParse(ev.target.result); };
        reader.readAsText(file);
    };

    // Auto-wrap single items (bare workout, supplement, meal) into full structure
    const normalizeData = (data) => {
        // Single workout object with a "type" field but no "workouts" array
        if (data.type && !data.workouts && !data.nutrition && !data.supplements) {
            return { date: data.date, workouts: [data] };
        }
        // Single supplement object
        if (data.name && data.dose_mg !== undefined && !data.supplements) {
            return { date: data.date, supplements: [data] };
        }
        // Single meal object
        if (data.meal_type && data.name && !data.nutrition) {
            return { date: data.date, nutrition: { meals: [data] } };
        }
        return data;
    };

    const handleParse = (text) => {
        setErrors([]); setResult(null); setConflictId(null);
        try {
            let data = JSON.parse(text);
            data = normalizeData(data);
            // Auto-fill today's date if missing
            if (!data.date) {
                data.date = new Date().toISOString().split('T')[0];
            }
            const errs = validate(data);
            setParsed(data);
            if (errs.length > 0) { setErrors(errs); setStatus('error'); }
            else { setStatus('validated'); }
        } catch { setErrors(['Invalid JSON — check for syntax errors']); setStatus('error'); setParsed(null); }
    };

    const validate = (data) => {
        const errs = [];
        if (data.date && isNaN(new Date(data.date))) errs.push('Invalid date format');
        if (data.nutrition?.meals) {
            data.nutrition.meals.forEach((m, i) => {
                if (!m.name) errs.push(`Meal ${i + 1}: missing "name"`);
                if (!m.meal_type) errs.push(`Meal ${i + 1}: missing "meal_type"`);
            });
        }
        if (data.workouts) {
            data.workouts.forEach((w, i) => { if (!w.type) errs.push(`Workout ${i + 1}: missing "type"`); });
        }
        if (data.supplements) {
            data.supplements.forEach((s, i) => { if (!s.name) errs.push(`Supplement ${i + 1}: missing "name"`); });
        }
        return errs;
    };

    const doImport = async (mode = 'create') => {
        setStatus('importing');
        try {
            const urlMap = { create: '/import/daily', overwrite: '/import/daily/overwrite', merge: '/import/daily/merge' };
            const res = await api.post(urlMap[mode], parsed);
            setResult({ ...res.data, mode });
            setStatus('done');
        } catch (err) {
            if (err.response?.status === 409) {
                setConflictId(err.response.data.id);
                setStatus('conflict');
            } else {
                setErrors([err.response?.data?.error || err.message]);
                setStatus('error');
            }
        }
    };

    const reset = () => { setRaw(''); setParsed(null); setErrors([]); setStatus('idle'); setResult(null); setConflictId(null); };

    const preview = parsed;
    const meals = preview?.nutrition?.meals || [];
    const totals = preview?.nutrition?.totals || {};
    const workouts = preview?.workouts || [];
    const supplements = preview?.supplements || [];

    return (
        <div className="space-y-6 max-w-3xl">
            <div>
                <h1 className="text-2xl font-bold">Import Daily Log</h1>
                <p className="text-surface-200 mt-1">Paste JSON to log a full day or add individual items throughout the day</p>
            </div>

            {/* Drop zone */}
            <div
                onDrop={(e) => { e.preventDefault(); handleFile(e); }}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-surface-700 rounded-2xl p-10 text-center hover:border-primary-500/50 transition-all"
            >
                <input type="file" accept=".json" onChange={handleFile} className="hidden" id="json-file" />
                <label htmlFor="json-file" className="cursor-pointer">
                    <span className="text-4xl block mb-3">📄</span>
                    <span className="text-surface-200">Drop a JSON file here, or <span className="text-primary-400 underline">click to browse</span></span>
                </label>
            </div>

            {/* Paste area */}
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-surface-200">Or paste JSON directly</label>
                    {raw && <button onClick={() => handleParse(raw)} className="text-xs px-3 py-1 rounded-lg bg-primary-600/20 text-primary-400 hover:bg-primary-600/30 transition-all">Re-validate</button>}
                </div>
                <textarea
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    onBlur={() => raw && handleParse(raw)}
                    placeholder='{"date": "2026-02-24", "meta": {...}, "nutrition": {...}, "workouts": [...], "supplements": [...]}'
                    rows={6}
                    className="w-full px-4 py-3 rounded-xl bg-surface-800 border border-surface-700 text-white font-mono text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none placeholder-surface-700"
                />
            </div>

            {/* Errors */}
            {errors.length > 0 && (
                <div className="bg-red-900/20 border border-red-800/50 rounded-2xl p-5">
                    <p className="font-semibold text-red-400 mb-2">⚠️ Validation Errors</p>
                    {errors.map((e, i) => <p key={i} className="text-red-300 text-sm">• {e}</p>)}
                </div>
            )}

            {/* Conflict */}
            {status === 'conflict' && (
                <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-2xl p-5">
                    <p className="font-semibold text-yellow-400 mb-2">📅 Log already exists for {parsed.date}</p>
                    <p className="text-yellow-300 text-sm mb-4">Add to the existing log, or replace it entirely?</p>
                    <div className="flex gap-3">
                        <button onClick={() => doImport('merge')} className="px-6 py-2 rounded-xl bg-accent-600 hover:bg-accent-500 text-white font-medium transition-all">Merge (add to existing)</button>
                        <button onClick={() => doImport('overwrite')} className="px-6 py-2 rounded-xl bg-yellow-600/50 hover:bg-yellow-600 text-white font-medium transition-all">Overwrite all</button>
                        <button onClick={reset} className="px-6 py-2 rounded-xl bg-surface-800 border border-surface-700 text-surface-200 hover:bg-surface-700 transition-all">Cancel</button>
                    </div>
                </div>
            )}

            {/* Preview */}
            {preview && status !== 'error' && (
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">Preview</h2>
                        <span className={`text-xs px-3 py-1 rounded-full font-medium ${status === 'validated' ? 'bg-accent-500/20 text-accent-400' : status === 'done' ? 'bg-green-500/20 text-green-400' : 'bg-surface-700 text-surface-200'}`}>
                            {status === 'validated' ? '✓ Valid' : status === 'done' ? '✓ Imported' : status}
                        </span>
                    </div>

                    {/* Date & Meta */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="p-3 rounded-xl bg-surface-800/50"><p className="text-xs text-surface-200">Date</p><p className="font-bold">📅 {preview.date}</p></div>
                        {preview.meta?.weight_kg && <div className="p-3 rounded-xl bg-surface-800/50"><p className="text-xs text-surface-200">Weight</p><p className="font-bold">⚖️ {preview.meta.weight_kg} kg</p></div>}
                        {preview.meta?.wake_time && <div className="p-3 rounded-xl bg-surface-800/50"><p className="text-xs text-surface-200">Wake</p><p className="font-bold">🌅 {preview.meta.wake_time}</p></div>}
                        {preview.meta?.sleep_time && <div className="p-3 rounded-xl bg-surface-800/50"><p className="text-xs text-surface-200">Sleep</p><p className="font-bold">🌙 {preview.meta.sleep_time}</p></div>}
                    </div>

                    {/* Meals */}
                    {meals.length > 0 && (
                        <div>
                            <p className="text-sm font-medium text-surface-200 mb-2">🍽️ Meals ({meals.length})</p>
                            <div className="space-y-2">
                                {meals.map((m, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-surface-800/50">
                                        <div>
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-calories/20 text-calories mr-2">{m.meal_type}</span>
                                            <span className="font-medium">{m.name}</span>
                                        </div>
                                        <div className="flex gap-3 text-xs text-surface-200">
                                            {m.calories && <span className="text-calories">{m.calories} kcal</span>}
                                            {m.protein_g && <span className="text-protein">{m.protein_g}g P</span>}
                                            {m.carbs_g && <span className="text-carbs">{m.carbs_g}g C</span>}
                                            {m.fat_g && <span className="text-fat">{m.fat_g}g F</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Totals bar */}
                    {(totals.calories || totals.protein_g) && (
                        <div className="p-4 rounded-xl bg-gradient-to-r from-surface-800/80 to-surface-800/40 border border-surface-700">
                            <p className="text-xs text-surface-200 mb-2">Daily Totals</p>
                            <div className="flex gap-6 text-sm font-semibold">
                                {totals.calories && <span className="text-calories">🔥 {totals.calories} kcal</span>}
                                {totals.protein_g && <span className="text-protein">💪 {totals.protein_g}g protein</span>}
                                {totals.carbs_g && <span className="text-carbs">{totals.carbs_g}g carbs</span>}
                                {totals.fat_g && <span className="text-fat">{totals.fat_g}g fat</span>}
                            </div>
                        </div>
                    )}

                    {/* Workouts */}
                    {workouts.length > 0 && (
                        <div>
                            <p className="text-sm font-medium text-surface-200 mb-2">🏃 Workouts ({workouts.length})</p>
                            {workouts.map((w, i) => (
                                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-surface-800/50">
                                    <span className="font-medium capitalize">{w.type}</span>
                                    <div className="flex gap-3 text-xs text-surface-200">
                                        {w.duration_mins && <span>{w.duration_mins}m</span>}
                                        {w.active_calories && <span>🔥 {w.active_calories} cal</span>}
                                        {w.distance_km && <span>📏 {w.distance_km}km</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Supplements */}
                    {supplements.length > 0 && (
                        <div>
                            <p className="text-sm font-medium text-surface-200 mb-2">💊 Supplements ({supplements.length})</p>
                            <div className="flex flex-wrap gap-2">
                                {supplements.map((s, i) => (
                                    <span key={i} className="px-3 py-1.5 rounded-xl bg-accent-500/10 border border-accent-500/20 text-accent-400 text-sm">
                                        {s.name} {s.dose_mg ? `${s.dose_mg}mg` : ''} {s.taken_at ? `@ ${s.taken_at}` : ''}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Sleep */}
                    {preview.sleep && (
                        <div className="p-4 rounded-xl bg-purple-900/10 border border-purple-800/20">
                            <p className="text-sm font-medium text-surface-200 mb-2">😴 Sleep</p>
                            <div className="flex gap-4 text-sm">
                                <span>{Math.floor(preview.sleep.total_mins / 60)}h {preview.sleep.total_mins % 60}m total</span>
                                <span className="text-purple-400 font-medium">🟣 Deep: {preview.sleep.deep_mins}m ({preview.sleep.total_mins ? Math.round((preview.sleep.deep_mins / preview.sleep.total_mins) * 100) : 0}%)</span>
                                <span className="text-blue-400">REM: {preview.sleep.rem_mins}m</span>
                                <span className="text-blue-300">Core: {preview.sleep.core_mins}m</span>
                            </div>
                        </div>
                    )}

                    {/* Activity Rings */}
                    {preview.activity_rings && (
                        <div className="p-4 rounded-xl bg-surface-800/50">
                            <p className="text-sm font-medium text-surface-200 mb-2">⌚ Activity Rings</p>
                            <div className="flex gap-4 text-sm">
                                {preview.activity_rings.move_cal && <span className="text-red-400">🔴 Move: {preview.activity_rings.move_cal}/{preview.activity_rings.move_goal || 720} cal</span>}
                                {preview.activity_rings.exercise_mins != null && <span className="text-green-400">🟢 Exercise: {preview.activity_rings.exercise_mins}/{preview.activity_rings.exercise_goal || 45}m</span>}
                                {preview.activity_rings.stand_hrs != null && <span className="text-blue-400">🔵 Stand: {preview.activity_rings.stand_hrs}/{preview.activity_rings.stand_goal || 12}h</span>}
                            </div>
                            {preview.steps && <p className="text-xs text-surface-200 mt-2">👟 {preview.steps.count?.toLocaleString()} steps • {preview.steps.distance_km}km</p>}
                        </div>
                    )}
                </div>
            )}

            {/* Success */}
            {status === 'done' && result && (
                <div className="bg-accent-500/10 border border-accent-500/20 rounded-2xl p-5">
                    <p className="font-semibold text-accent-400 mb-2">
                        ✅ {result.mode === 'merge' ? 'Merged into existing log!' : 'Import Successful!'}
                    </p>
                    <div className="flex flex-wrap gap-4 text-sm text-accent-300">
                        {result.mealsCreated > 0 && <span>🍽️ {result.mealsCreated} meals</span>}
                        {result.workoutsCreated > 0 && <span>🏃 {result.workoutsCreated} workouts</span>}
                        {result.supplementsCreated > 0 && <span>💊 {result.supplementsCreated} supplements</span>}
                        {result.sleepLogged && <span>😴 Sleep logged</span>}
                        {result.activityLogged && <span>⌚ Activity rings</span>}
                        {result.weightLogged && <span>⚖️ Weight logged</span>}
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
                {status === 'validated' && (
                    <button
                        onClick={() => doImport('create')}
                        className="flex-1 py-3 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold hover:from-primary-500 hover:to-primary-400 transition-all shadow-lg shadow-primary-600/30"
                    >
                        Import Daily Log
                    </button>
                )}
                {status === 'importing' && (
                    <button disabled className="flex-1 py-3 rounded-xl bg-primary-600 text-white font-semibold opacity-50">
                        <span className="inline-flex items-center gap-2">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                            Importing...
                        </span>
                    </button>
                )}
                <button onClick={reset} className="px-6 py-3 rounded-xl bg-surface-800 border border-surface-700 text-surface-200 hover:bg-surface-700 font-medium transition-all">
                    Reset
                </button>
            </div>

            {/* Import History */}
            {history.length > 0 && (
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4">Import History</h2>
                    <div className="space-y-2">
                        {history.map(h => (
                            <div key={h.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-800/50">
                                <div className="flex items-center gap-3">
                                    <span className={h.status === 'success' ? 'text-green-400' : 'text-red-400'}>{h.status === 'success' ? '✓' : '✗'}</span>
                                    <span className="font-medium">{new Date(h.date).toLocaleDateString()}</span>
                                </div>
                                <div className="flex gap-3 text-xs text-surface-200">
                                    {h.mealsCount != null && <span>🍽️ {h.mealsCount}</span>}
                                    {h.workoutsCount != null && <span>🏃 {h.workoutsCount}</span>}
                                    <span>{new Date(h.importedAt).toLocaleString()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
