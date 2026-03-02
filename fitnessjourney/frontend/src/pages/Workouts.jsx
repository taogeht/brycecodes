import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import api from '../api/client';

// ─── Exercise Library with icons ────────────────────────────────────
const EXERCISES = {
    // Chest
    'Bench Press': { icon: '🏋️', muscle: 'Chest', img: 'chest-press' },
    'Incline Bench Press': { icon: '🏋️', muscle: 'Chest', img: 'incline-press' },
    'Decline Bench Press': { icon: '🏋️', muscle: 'Chest', img: 'decline-press' },
    'Dumbbell Fly': { icon: '🦋', muscle: 'Chest', img: 'fly' },
    'Cable Crossover': { icon: '🔀', muscle: 'Chest', img: 'cable-cross' },
    'Push-up': { icon: '💪', muscle: 'Chest', img: 'pushup' },
    // Back
    'Deadlift': { icon: '🔥', muscle: 'Back', img: 'deadlift' },
    'Barbell Row': { icon: '🚣', muscle: 'Back', img: 'row' },
    'Lat Pulldown': { icon: '⬇️', muscle: 'Back', img: 'pulldown' },
    'Pull-up': { icon: '⬆️', muscle: 'Back', img: 'pullup' },
    'Seated Cable Row': { icon: '🚣', muscle: 'Back', img: 'cable-row' },
    'T-Bar Row': { icon: '🚣', muscle: 'Back', img: 'tbar' },
    // Shoulders
    'Overhead Press': { icon: '🙌', muscle: 'Shoulders', img: 'ohp' },
    'Lateral Raise': { icon: '🤸', muscle: 'Shoulders', img: 'lateral' },
    'Front Raise': { icon: '🙋', muscle: 'Shoulders', img: 'front-raise' },
    'Face Pull': { icon: '🎯', muscle: 'Shoulders', img: 'face-pull' },
    'Arnold Press': { icon: '💪', muscle: 'Shoulders', img: 'arnold' },
    // Legs
    'Squat': { icon: '🦵', muscle: 'Legs', img: 'squat' },
    'Leg Press': { icon: '🦵', muscle: 'Legs', img: 'leg-press' },
    'Romanian Deadlift': { icon: '🔥', muscle: 'Legs', img: 'rdl' },
    'Leg Extension': { icon: '🦵', muscle: 'Legs', img: 'leg-ext' },
    'Leg Curl': { icon: '🦵', muscle: 'Legs', img: 'leg-curl' },
    'Calf Raise': { icon: '🦶', muscle: 'Legs', img: 'calf' },
    'Lunge': { icon: '🏃', muscle: 'Legs', img: 'lunge' },
    'Hip Thrust': { icon: '🍑', muscle: 'Legs', img: 'hip-thrust' },
    // Arms
    'Bicep Curl': { icon: '💪', muscle: 'Arms', img: 'curl' },
    'Hammer Curl': { icon: '🔨', muscle: 'Arms', img: 'hammer' },
    'Tricep Pushdown': { icon: '⬇️', muscle: 'Arms', img: 'pushdown' },
    'Skull Crusher': { icon: '💀', muscle: 'Arms', img: 'skull' },
    'Tricep Dip': { icon: '↕️', muscle: 'Arms', img: 'dip' },
    'Preacher Curl': { icon: '💪', muscle: 'Arms', img: 'preacher' },
    // Core
    'Plank': { icon: '🧱', muscle: 'Core', img: 'plank' },
    'Crunch': { icon: '🫃', muscle: 'Core', img: 'crunch' },
    'Cable Woodchop': { icon: '🪓', muscle: 'Core', img: 'woodchop' },
    'Hanging Leg Raise': { icon: '🦵', muscle: 'Core', img: 'leg-raise' },
    'Ab Rollout': { icon: '🛞', muscle: 'Core', img: 'rollout' },
};

const MUSCLE_COLORS = {
    'Chest': '#ef4444',
    'Back': '#3b82f6',
    'Shoulders': '#f59e0b',
    'Legs': '#22c55e',
    'Arms': '#a855f7',
    'Core': '#06b6d4'
};

const MUSCLE_GROUPS = ['All', 'Chest', 'Back', 'Shoulders', 'Legs', 'Arms', 'Core'];

const TYPES = ['strength', 'walk', 'cardio', 'run', 'cycling', 'swim', 'yoga'];
const ICONS = { walk: '🚶', strength: '🏋️', cardio: '🏃', run: '🏃', cycling: '🚴', swim: '🏊', yoga: '🧘' };

// ─── Exercise illustration (simple SVG) ─────────────────────────────
function ExerciseIllustration({ exercise, size = 48 }) {
    const info = EXERCISES[exercise];
    if (!info) return <div className="w-12 h-12 rounded-xl bg-surface-800 flex items-center justify-center text-xl">🏋️</div>;
    const color = MUSCLE_COLORS[info.muscle] || '#6366f1';

    // Simple stick-figure style illustrations per exercise type
    const illustrations = {
        'chest-press': (
            <svg viewBox="0 0 48 48" width={size} height={size}>
                <rect x="8" y="22" width="32" height="4" rx="2" fill={color} opacity="0.3" />
                <circle cx="24" cy="12" r="5" fill={color} opacity="0.6" />
                <line x1="24" y1="17" x2="24" y2="30" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                <line x1="12" y1="22" x2="36" y2="22" stroke={color} strokeWidth="3" strokeLinecap="round" />
                <line x1="24" y1="30" x2="18" y2="40" stroke={color} strokeWidth="2" strokeLinecap="round" />
                <line x1="24" y1="30" x2="30" y2="40" stroke={color} strokeWidth="2" strokeLinecap="round" />
            </svg>
        ),
        'squat': (
            <svg viewBox="0 0 48 48" width={size} height={size}>
                <circle cx="24" cy="8" r="5" fill={color} opacity="0.6" />
                <line x1="24" y1="13" x2="24" y2="24" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                <line x1="14" y1="18" x2="34" y2="18" stroke={color} strokeWidth="3" strokeLinecap="round" />
                <rect x="12" y="16" width="3" height="6" rx="1" fill={color} opacity="0.4" />
                <rect x="33" y="16" width="3" height="6" rx="1" fill={color} opacity="0.4" />
                <line x1="24" y1="24" x2="18" y2="32" stroke={color} strokeWidth="2" strokeLinecap="round" />
                <line x1="24" y1="24" x2="30" y2="32" stroke={color} strokeWidth="2" strokeLinecap="round" />
                <line x1="18" y1="32" x2="16" y2="42" stroke={color} strokeWidth="2" strokeLinecap="round" />
                <line x1="30" y1="32" x2="32" y2="42" stroke={color} strokeWidth="2" strokeLinecap="round" />
            </svg>
        ),
        'deadlift': (
            <svg viewBox="0 0 48 48" width={size} height={size}>
                <circle cx="24" cy="10" r="5" fill={color} opacity="0.6" />
                <line x1="24" y1="15" x2="24" y2="28" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                <line x1="18" y1="20" x2="18" y2="36" stroke={color} strokeWidth="2" strokeLinecap="round" />
                <line x1="30" y1="20" x2="30" y2="36" stroke={color} strokeWidth="2" strokeLinecap="round" />
                <rect x="10" y="34" width="28" height="4" rx="2" fill={color} opacity="0.4" />
                <rect x="8" y="33" width="4" height="6" rx="2" fill={color} opacity="0.5" />
                <rect x="36" y="33" width="4" height="6" rx="2" fill={color} opacity="0.5" />
                <line x1="24" y1="28" x2="20" y2="40" stroke={color} strokeWidth="2" strokeLinecap="round" />
                <line x1="24" y1="28" x2="28" y2="40" stroke={color} strokeWidth="2" strokeLinecap="round" />
            </svg>
        ),
        'curl': (
            <svg viewBox="0 0 48 48" width={size} height={size}>
                <circle cx="24" cy="10" r="5" fill={color} opacity="0.6" />
                <line x1="24" y1="15" x2="24" y2="30" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                <line x1="24" y1="20" x2="30" y2="26" stroke={color} strokeWidth="2" strokeLinecap="round" />
                <line x1="30" y1="26" x2="30" y2="18" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                <rect x="28" y="14" width="4" height="5" rx="2" fill={color} opacity="0.4" />
                <line x1="24" y1="20" x2="18" y2="28" stroke={color} strokeWidth="2" strokeLinecap="round" />
                <line x1="24" y1="30" x2="20" y2="42" stroke={color} strokeWidth="2" strokeLinecap="round" />
                <line x1="24" y1="30" x2="28" y2="42" stroke={color} strokeWidth="2" strokeLinecap="round" />
            </svg>
        ),
        'pullup': (
            <svg viewBox="0 0 48 48" width={size} height={size}>
                <rect x="4" y="4" width="40" height="3" rx="1.5" fill={color} opacity="0.3" />
                <circle cx="24" cy="14" r="4" fill={color} opacity="0.6" />
                <line x1="24" y1="18" x2="24" y2="32" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                <line x1="24" y1="22" x2="16" y2="10" stroke={color} strokeWidth="2" strokeLinecap="round" />
                <line x1="24" y1="22" x2="32" y2="10" stroke={color} strokeWidth="2" strokeLinecap="round" />
                <line x1="24" y1="32" x2="20" y2="42" stroke={color} strokeWidth="2" strokeLinecap="round" />
                <line x1="24" y1="32" x2="28" y2="42" stroke={color} strokeWidth="2" strokeLinecap="round" />
            </svg>
        ),
        'plank': (
            <svg viewBox="0 0 48 48" width={size} height={size}>
                <circle cx="10" cy="22" r="4" fill={color} opacity="0.6" />
                <line x1="14" y1="24" x2="38" y2="24" stroke={color} strokeWidth="3" strokeLinecap="round" />
                <line x1="14" y1="28" x2="14" y2="36" stroke={color} strokeWidth="2" strokeLinecap="round" />
                <line x1="38" y1="24" x2="38" y2="36" stroke={color} strokeWidth="2" strokeLinecap="round" />
            </svg>
        ),
    };

    // Map exercise images to illustrations
    const mapping = {
        'chest-press': 'chest-press', 'incline-press': 'chest-press', 'decline-press': 'chest-press',
        'fly': 'chest-press', 'cable-cross': 'chest-press', 'pushup': 'plank',
        'deadlift': 'deadlift', 'row': 'deadlift', 'pulldown': 'pullup', 'pullup': 'pullup',
        'cable-row': 'deadlift', 'tbar': 'deadlift',
        'ohp': 'chest-press', 'lateral': 'curl', 'front-raise': 'curl', 'face-pull': 'curl', 'arnold': 'chest-press',
        'squat': 'squat', 'leg-press': 'squat', 'rdl': 'deadlift', 'leg-ext': 'squat',
        'leg-curl': 'squat', 'calf': 'squat', 'lunge': 'squat', 'hip-thrust': 'squat',
        'curl': 'curl', 'hammer': 'curl', 'pushdown': 'curl', 'skull': 'chest-press',
        'dip': 'pullup', 'preacher': 'curl',
        'plank': 'plank', 'crunch': 'plank', 'woodchop': 'curl', 'leg-raise': 'pullup', 'rollout': 'plank',
    };

    const key = mapping[info.img] || 'chest-press';
    return (
        <div className="rounded-xl bg-surface-800/50 flex items-center justify-center overflow-hidden" style={{ width: size, height: size }}>
            {illustrations[key] || <span className="text-2xl">{info.icon}</span>}
        </div>
    );
}

// ─── Set Row Component ──────────────────────────────────────────────
function SetRow({ set, index, onChange, onRemove }) {
    return (
        <div className="flex items-center gap-2 animate-in">
            <span className="text-xs text-surface-200 w-8 text-center font-mono">#{index + 1}</span>
            <input type="number" step="0.5" value={set.weight} onChange={e => onChange('weight', e.target.value)}
                placeholder="kg" className="w-20 px-2 py-1.5 rounded-lg bg-surface-800 border border-surface-700 text-white text-sm text-center focus:ring-2 focus:ring-primary-500 focus:outline-none" />
            <span className="text-surface-200 text-xs">×</span>
            <input type="number" value={set.reps} onChange={e => onChange('reps', e.target.value)}
                placeholder="reps" className="w-16 px-2 py-1.5 rounded-lg bg-surface-800 border border-surface-700 text-white text-sm text-center focus:ring-2 focus:ring-primary-500 focus:outline-none" />
            {set.weight && set.reps && (
                <span className="text-xs text-surface-200 w-16 text-right">{(parseFloat(set.weight) * parseInt(set.reps || 0)).toFixed(0)}kg vol</span>
            )}
            <button onClick={onRemove} className="text-red-400/50 hover:text-red-400 transition-colors ml-auto text-xs">✕</button>
        </div>
    );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────
export default function Workouts() {
    const [workouts, setWorkouts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('weights'); // weights | general
    const [saving, setSaving] = useState(false);

    // Weights state
    const [weightDate, setWeightDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [muscleFilter, setMuscleFilter] = useState('All');
    const [exercises, setExercises] = useState([]); // [{name, sets: [{weight, reps}]}]
    const [searchQuery, setSearchQuery] = useState('');

    // General workout form
    const [showForm, setShowForm] = useState(false);
    const initForm = { date: format(new Date(), 'yyyy-MM-dd'), type: 'walk', startTime: '', endTime: '', durationMins: '', activeCalories: '', totalCalories: '', avgHeartRate: '', maxHeartRate: '', distanceKm: '', effortLevel: 3, notes: '' };
    const [form, setForm] = useState(initForm);

    useEffect(() => { load(); }, []);
    const load = async () => {
        try { const r = await api.get(`/logs/${format(new Date(), 'yyyy-MM-dd')}`); setWorkouts(r.data?.workouts || []); } catch (e) { } finally { setLoading(false); }
    };

    // Add exercise to the workout
    const addExercise = (name) => {
        if (exercises.find(e => e.name === name)) return; // already added
        setExercises(prev => [...prev, { name, sets: [{ weight: '', reps: '' }] }]);
        setSearchQuery('');
    };

    const addSet = (exIdx) => {
        setExercises(prev => prev.map((ex, i) =>
            i === exIdx ? { ...ex, sets: [...ex.sets, { weight: ex.sets[ex.sets.length - 1]?.weight || '', reps: '' }] } : ex
        ));
    };

    const updateSet = (exIdx, setIdx, field, value) => {
        setExercises(prev => prev.map((ex, i) =>
            i === exIdx ? { ...ex, sets: ex.sets.map((s, j) => j === setIdx ? { ...s, [field]: value } : s) } : ex
        ));
    };

    const removeSet = (exIdx, setIdx) => {
        setExercises(prev => prev.map((ex, i) =>
            i === exIdx ? { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) } : ex
        ));
    };

    const removeExercise = (exIdx) => {
        setExercises(prev => prev.filter((_, i) => i !== exIdx));
    };

    const saveWeightWorkout = async () => {
        if (exercises.length === 0) return;
        setSaving(true);
        try {
            const logRes = await api.post('/logs', { date: weightDate });
            const allSets = [];
            let totalVolume = 0;
            exercises.forEach(ex => {
                ex.sets.forEach(s => {
                    if (s.weight && s.reps) {
                        allSets.push({ exercise: ex.name, weight: parseFloat(s.weight), reps: parseInt(s.reps) });
                        totalVolume += parseFloat(s.weight) * parseInt(s.reps);
                    }
                });
            });

            const totalDuration = exercises.length * 5; // rough estimate

            await api.post('/workouts', {
                dailyLogId: logRes.data.id,
                type: 'strength',
                durationMins: totalDuration,
                volumeLoad: totalVolume,
                sets: allSets,
                effortLevel: 3,
                notes: exercises.map(e => e.name).join(', ')
            });

            await load();
            setExercises([]);
        } catch (err) { console.error(err); }
        finally { setSaving(false); }
    };

    // General workout submit
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

    // Filter exercises for search
    const filteredExercises = Object.entries(EXERCISES).filter(([name, info]) => {
        if (muscleFilter !== 'All' && info.muscle !== muscleFilter) return false;
        if (searchQuery && !name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent" /></div>;

    return (
        <div className="space-y-6 max-w-4xl">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Workouts</h1>
                <div className="flex bg-surface-900 border border-surface-800 rounded-xl p-1">
                    <button onClick={() => setTab('weights')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'weights' ? 'bg-primary-600 text-white shadow-lg' : 'text-surface-200 hover:text-white hover:bg-surface-800'}`}>
                        🏋️ Weights
                    </button>
                    <button onClick={() => setTab('general')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'general' ? 'bg-primary-600 text-white shadow-lg' : 'text-surface-200 hover:text-white hover:bg-surface-800'}`}>
                        🏃 General
                    </button>
                </div>
            </div>

            {tab === 'weights' ? (
                <>
                    {/* Date */}
                    <div className="flex items-center gap-4">
                        <label className="text-sm text-surface-200">Date:</label>
                        <input type="date" value={weightDate} onChange={e => setWeightDate(e.target.value)}
                            className="px-3 py-2 rounded-xl bg-surface-900 border border-surface-800 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                    </div>

                    {/* Exercise Picker */}
                    <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                        <h2 className="text-lg font-semibold mb-4">Add Exercises</h2>

                        {/* Muscle Group Filter */}
                        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                            {MUSCLE_GROUPS.map(mg => (
                                <button key={mg} onClick={() => setMuscleFilter(mg)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${muscleFilter === mg ? 'text-white' : 'bg-surface-800 text-surface-200 hover:text-white'}`}
                                    style={muscleFilter === mg ? { backgroundColor: MUSCLE_COLORS[mg] || '#6366f1' } : {}}>
                                    {mg}
                                </button>
                            ))}
                        </div>

                        {/* Search */}
                        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search exercises..." className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white text-sm mb-4 focus:ring-2 focus:ring-primary-500 focus:outline-none" />

                        {/* Exercise Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-64 overflow-y-auto pr-1">
                            {filteredExercises.map(([name, info]) => {
                                const isAdded = exercises.some(e => e.name === name);
                                return (
                                    <button key={name} onClick={() => !isAdded && addExercise(name)}
                                        className={`flex items-center gap-3 p-3 rounded-xl text-left text-sm transition-all ${isAdded ? 'bg-primary-600/20 border border-primary-500/30 text-primary-300' : 'bg-surface-800/50 border border-surface-700 hover:border-surface-600 hover:bg-surface-800 text-white'}`}>
                                        <ExerciseIllustration exercise={name} size={36} />
                                        <div className="min-w-0">
                                            <p className="font-medium truncate">{name}</p>
                                            <p className="text-xs" style={{ color: MUSCLE_COLORS[info.muscle] }}>{info.muscle}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Current Workout — Set Entry */}
                    {exercises.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold">Today's Workout</h2>
                                <span className="text-sm text-surface-200">{exercises.length} exercises</span>
                            </div>

                            {exercises.map((ex, exIdx) => {
                                const info = EXERCISES[ex.name] || { icon: '🏋️', muscle: 'Other' };
                                const exVolume = ex.sets.reduce((s, set) => s + (parseFloat(set.weight || 0) * parseInt(set.reps || 0)), 0);

                                return (
                                    <div key={ex.name} className="bg-surface-900 border border-surface-800 rounded-2xl p-5 hover:border-surface-700 transition-all">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <ExerciseIllustration exercise={ex.name} size={48} />
                                                <div>
                                                    <h3 className="font-semibold">{ex.name}</h3>
                                                    <p className="text-xs" style={{ color: MUSCLE_COLORS[info.muscle] }}>{info.muscle} • {ex.sets.length} sets{exVolume > 0 && ` • ${exVolume.toLocaleString()}kg vol`}</p>
                                                </div>
                                            </div>
                                            <button onClick={() => removeExercise(exIdx)} className="text-red-400/50 hover:text-red-400 text-sm transition-colors">Remove</button>
                                        </div>

                                        <div className="space-y-2 mb-3">
                                            <div className="flex items-center gap-2 text-xs text-surface-200 px-1">
                                                <span className="w-8 text-center">Set</span>
                                                <span className="w-20 text-center">Weight</span>
                                                <span className="w-4" />
                                                <span className="w-16 text-center">Reps</span>
                                            </div>
                                            {ex.sets.map((set, setIdx) => (
                                                <SetRow key={setIdx} set={set} index={setIdx}
                                                    onChange={(field, value) => updateSet(exIdx, setIdx, field, value)}
                                                    onRemove={() => removeSet(exIdx, setIdx)} />
                                            ))}
                                        </div>

                                        <button onClick={() => addSet(exIdx)}
                                            className="w-full py-2 rounded-lg border border-dashed border-surface-700 text-surface-200 text-sm hover:border-primary-500 hover:text-primary-400 transition-all">
                                            + Add Set
                                        </button>
                                    </div>
                                );
                            })}

                            {/* Summary + Save */}
                            <div className="bg-gradient-to-r from-primary-600/20 to-accent-600/20 border border-primary-500/20 rounded-2xl p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <h3 className="font-semibold">Workout Summary</h3>
                                        <p className="text-sm text-surface-200">
                                            {exercises.length} exercises •{' '}
                                            {exercises.reduce((s, e) => s + e.sets.filter(s => s.weight && s.reps).length, 0)} sets •{' '}
                                            {exercises.reduce((s, e) => s + e.sets.reduce((ss, set) => ss + (parseFloat(set.weight || 0) * parseInt(set.reps || 0)), 0), 0).toLocaleString()}kg total volume
                                        </p>
                                    </div>
                                </div>
                                <button onClick={saveWeightWorkout} disabled={saving}
                                    className="w-full py-3 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold hover:from-primary-500 hover:to-primary-400 transition-all shadow-lg shadow-primary-600/30 disabled:opacity-50">
                                    {saving ? 'Saving...' : '💪 Save Workout'}
                                </button>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                /* ─── General Tab ─────────────────────────────────── */
                <>
                    <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium transition-all">{showForm ? 'Cancel' : '+ Log Workout'}</button>
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
                            </div>
                            <div><label className="block text-sm text-surface-200 mb-1">Notes</label>
                                <textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={2} className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none" /></div>
                            <button type="submit" disabled={saving} className="px-8 py-3 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold disabled:opacity-50">{saving ? 'Saving...' : 'Save Workout'}</button>
                        </form>
                    )}
                </>
            )}

            {/* Today's Workouts List */}
            <div className="space-y-3">
                <h2 className="text-lg font-semibold">Today's Workouts</h2>
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
                            {w.volumeLoad && <div className="p-2 rounded-lg bg-surface-800/50 text-center"><p className="text-xs text-surface-200">Volume</p><p className="font-bold">{w.volumeLoad.toLocaleString()}kg</p></div>}
                            {w.distanceKm && <div className="p-2 rounded-lg bg-surface-800/50 text-center"><p className="text-xs text-surface-200">Distance</p><p className="font-bold">{w.distanceKm}km</p></div>}
                            {w.avgHeartRate && <div className="p-2 rounded-lg bg-surface-800/50 text-center"><p className="text-xs text-surface-200">Avg HR</p><p className="font-bold">{w.avgHeartRate}bpm</p></div>}
                        </div>
                        {/* Show sets if it's a weights workout */}
                        {w.sets && Array.isArray(w.sets) && w.sets.length > 0 && (
                            <div className="mt-3 space-y-1">
                                <p className="text-xs text-surface-200 font-medium mb-2">Sets:</p>
                                {Object.entries(w.sets.reduce((acc, s) => {
                                    if (!acc[s.exercise]) acc[s.exercise] = [];
                                    acc[s.exercise].push(s);
                                    return acc;
                                }, {})).map(([exerciseName, sets]) => (
                                    <div key={exerciseName} className="flex items-center gap-3 p-2 rounded-lg bg-surface-800/30">
                                        <ExerciseIllustration exercise={exerciseName} size={32} />
                                        <span className="font-medium text-sm flex-1">{exerciseName}</span>
                                        <div className="flex gap-2">
                                            {sets.map((s, i) => (
                                                <span key={i} className="text-xs px-2 py-1 rounded-lg bg-surface-800 text-surface-200">
                                                    {s.weight}kg × {s.reps}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {w.notes && <p className="mt-3 text-sm text-surface-200 bg-surface-800/30 p-3 rounded-lg">{w.notes}</p>}
                    </div>
                ))}
            </div>
        </div>
    );
}
