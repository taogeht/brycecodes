import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../api/client';

// ─── Shared Components ──────────────────────────────────────────────
function MacroBar({ label, current, target, color, unit = 'g' }) {
    const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
    return (
        <div className="space-y-2">
            <div className="flex justify-between text-sm">
                <span className="text-surface-200">{label}</span>
                <span className="font-medium">{Math.round(current)}<span className="text-surface-200">/{target}{unit}</span></span>
            </div>
            <div className="h-3 bg-surface-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
        </div>
    );
}

function StatCard({ icon, label, value, sub, color }) {
    return (
        <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5 hover:border-surface-700 transition-all duration-200">
            <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ backgroundColor: `${color}20` }}>{icon}</div>
                <span className="text-surface-200 text-sm">{label}</span>
            </div>
            <p className="text-2xl font-bold">{value}</p>
            {sub && <p className="text-surface-200 text-sm mt-1">{sub}</p>}
        </div>
    );
}

function QuickAddButton({ icon, label, to }) {
    return (
        <Link to={to} className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-surface-900 border border-surface-800 hover:border-primary-500/50 hover:bg-surface-800 transition-all duration-200 group">
            <span className="text-2xl group-hover:scale-110 transition-transform">{icon}</span>
            <span className="text-xs text-surface-200 group-hover:text-white transition-colors">{label}</span>
        </Link>
    );
}

// ─── Activity Ring SVG ──────────────────────────────────────────────
function ActivityRing({ value, goal, color, radius, label }) {
    const pct = goal > 0 ? Math.min(value / goal, 1) : 0;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - pct);
    return (
        <g>
            <circle cx="60" cy="60" r={radius} fill="none" stroke={`${color}20`} strokeWidth="8" />
            <circle cx="60" cy="60" r={radius} fill="none" stroke={color} strokeWidth="8"
                strokeDasharray={circumference} strokeDashoffset={offset}
                strokeLinecap="round" transform="rotate(-90 60 60)"
                className="transition-all duration-1000 ease-out" />
        </g>
    );
}

function ActivityRingsWidget({ rings }) {
    if (!rings) return null;
    return (
        <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-surface-200 mb-3">Activity Rings</h3>
            <div className="flex items-center gap-6">
                <svg width="120" height="120" viewBox="0 0 120 120">
                    <ActivityRing value={rings.moveCal || 0} goal={rings.moveGoal || 600} color="#ef4444" radius={50} label="Move" />
                    <ActivityRing value={rings.exerciseMins || 0} goal={rings.exerciseGoal || 30} color="#22c55e" radius={40} label="Exercise" />
                    <ActivityRing value={rings.standHrs || 0} goal={rings.standGoal || 12} color="#3b82f6" radius={30} label="Stand" />
                </svg>
                <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /><span>{rings.moveCal || 0}<span className="text-surface-200">/{rings.moveGoal || 600} cal</span></span></div>
                    <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /><span>{rings.exerciseMins || 0}<span className="text-surface-200">/{rings.exerciseGoal || 30} min</span></span></div>
                    <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /><span>{rings.standHrs || 0}<span className="text-surface-200">/{rings.standGoal || 12} hrs</span></span></div>
                    {rings.stepCount > 0 && <div className="text-surface-200 pt-1">👟 {rings.stepCount.toLocaleString()} steps</div>}
                </div>
            </div>
        </div>
    );
}

// ─── Macro Pie ──────────────────────────────────────────────────────
const PIE_COLORS = ['#ef4444', '#3b82f6', '#a855f7'];

function MacroPieChart({ ratio }) {
    if (!ratio || (ratio.proteinPct === 0 && ratio.carbsPct === 0 && ratio.fatPct === 0)) return null;
    const data = [
        { name: 'Protein', value: ratio.proteinPct },
        { name: 'Carbs', value: ratio.carbsPct },
        { name: 'Fat', value: ratio.fatPct }
    ];
    return (
        <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-surface-200 mb-2">Macro Split</h3>
            <div className="flex items-center gap-4">
                <ResponsiveContainer width={100} height={100}>
                    <PieChart>
                        <Pie data={data} cx="50%" cy="50%" innerRadius={28} outerRadius={45} dataKey="value" strokeWidth={0}>
                            {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-500" />{ratio.proteinPct}% Protein</div>
                    <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" />{ratio.carbsPct}% Carbs</div>
                    <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" />{ratio.fatPct}% Fat</div>
                </div>
            </div>
        </div>
    );
}

// ─── Sleep Card ─────────────────────────────────────────────────────
function SleepCard({ sleep, label }) {
    if (!sleep) return null;
    const hrs = sleep.totalMins ? Math.floor(sleep.totalMins / 60) : 0;
    const mins = sleep.totalMins ? sleep.totalMins % 60 : 0;
    return (
        <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-surface-200 mb-3">{label || 'Sleep'}</h3>
            <p className="text-2xl font-bold">{hrs}h {mins}m</p>
            <div className="flex gap-4 mt-2 text-sm text-surface-200">
                {sleep.deepPct > 0 && <span>🟣 {sleep.deepPct}% deep</span>}
                {sleep.quality > 0 && <span>⭐ {sleep.quality}/5 quality</span>}
                {sleep.deepMins > 0 && <span>🌙 {sleep.deepMins}m deep</span>}
                {sleep.qualityScore > 0 && <span>⭐ {sleep.qualityScore}/5</span>}
            </div>
        </div>
    );
}

// ─── Wellness Card ──────────────────────────────────────────────────
function WellnessCard({ stress, energy, soreness }) {
    if (!stress && !energy) return null;
    const dots = (val) => '●'.repeat(val || 0) + '○'.repeat(5 - (val || 0));
    return (
        <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-surface-200 mb-3">Wellness</h3>
            <div className="space-y-2 text-sm">
                {energy && <div className="flex justify-between"><span>⚡ Energy</span><span className="tracking-wider text-amber-400">{dots(energy)}</span></div>}
                {stress && <div className="flex justify-between"><span>😰 Stress</span><span className="tracking-wider text-red-400">{dots(stress)}</span></div>}
                {soreness && <p className="text-surface-200 text-xs mt-1">💪 {soreness}</p>}
            </div>
        </div>
    );
}

// ─── Hydration Widget ───────────────────────────────────────────────
function HydrationWidget({ ml, goal = 2500 }) {
    const pct = Math.min((ml / goal) * 100, 100);
    const glasses = Math.floor(ml / 250);
    return (
        <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-surface-200 mb-3">💧 Hydration</h3>
            <div className="flex items-center gap-4">
                <div className="relative w-12 h-16 bg-surface-800 rounded-xl overflow-hidden border border-surface-700">
                    <div className="absolute bottom-0 w-full bg-blue-500/60 transition-all duration-700" style={{ height: `${pct}%` }} />
                </div>
                <div>
                    <p className="text-xl font-bold">{ml >= 1000 ? `${(ml / 1000).toFixed(1)}L` : `${ml}ml`}</p>
                    <p className="text-surface-200 text-xs">{glasses} glasses • {Math.round(pct)}% of {goal / 1000}L goal</p>
                </div>
            </div>
        </div>
    );
}

// ─── Streak Badge ───────────────────────────────────────────────────
function StreakBadge({ streak }) {
    if (!streak || streak === 0) return null;
    return (
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30">
            <span className="text-xl">🔥</span>
            <span className="font-bold text-orange-400">{streak} day streak!</span>
        </div>
    );
}

// ─── Comparison Badge ───────────────────────────────────────────────
function ComparisonCard({ comparison }) {
    if (!comparison) return null;
    const items = [
        { key: 'calories', label: 'Calories', icon: '🔥' },
        { key: 'protein', label: 'Protein', icon: '💪' },
        { key: 'activeCalories', label: 'Active Burn', icon: '⚡' }
    ].filter(i => comparison[i.key] != null);
    if (items.length === 0) return null;
    return (
        <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-surface-200 mb-3">vs Previous Period</h3>
            <div className="space-y-2">
                {items.map(({ key, label, icon }) => {
                    const val = comparison[key];
                    const up = val > 0;
                    return (
                        <div key={key} className="flex justify-between text-sm">
                            <span>{icon} {label}</span>
                            <span className={up ? 'text-green-400' : 'text-red-400'}>
                                {up ? '↑' : '↓'} {Math.abs(val)}%
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

const RANGES = [
    { key: 'today', label: 'Day', endpoint: '/dashboard/today' },
    { key: 'weekly', label: 'Week', endpoint: '/dashboard/weekly' },
    { key: 'monthly', label: 'Month', endpoint: '/dashboard/monthly' },
    { key: 'total', label: 'Total', endpoint: '/dashboard/total' },
];

const chartTooltipStyle = { background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', color: '#fff' };

// ─── MAIN DASHBOARD ─────────────────────────────────────────────────
export default function Dashboard() {
    const [range, setRange] = useState('today');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        const endpoint = RANGES.find(r => r.key === range).endpoint;
        api.get(endpoint)
            .then(res => setData(res.data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [range]);

    const goals = data?.goals || [];
    const calorieGoal = goals.find(g => g.goalType === 'calories')?.targetValue || 2000;
    const proteinGoal = goals.find(g => g.goalType === 'protein')?.targetValue || 150;

    const subtitle = range === 'today'
        ? format(new Date(), 'EEEE, MMMM d, yyyy')
        : range === 'weekly' ? 'Last 7 days'
            : range === 'monthly' ? 'Last 30 days'
                : data?.daysLogged ? `${data.daysLogged} days tracked` : 'All time';

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <div className="flex items-center gap-4">
                        <h1 className="text-3xl font-bold">Dashboard</h1>
                        <StreakBadge streak={data?.streak} />
                    </div>
                    <p className="text-surface-200 mt-1">{subtitle}</p>
                </div>
                <div className="flex bg-surface-900 border border-surface-800 rounded-xl p-1">
                    {RANGES.map(r => (
                        <button key={r.key} onClick={() => setRange(r.key)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${range === r.key ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20' : 'text-surface-200 hover:text-white hover:bg-surface-800'}`}>
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent" />
                </div>
            ) : range === 'today' ? (
                <TodayView data={data} calorieGoal={calorieGoal} proteinGoal={proteinGoal} />
            ) : (
                <RangeView data={data} range={range} calorieGoal={calorieGoal} proteinGoal={proteinGoal} />
            )}
        </div>
    );
}

// ─── TODAY VIEW ─────────────────────────────────────────────────────
function TodayView({ data, calorieGoal, proteinGoal }) {
    const macros = data?.macros || { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };
    const exercise = data?.exercise || { activeCalories: 0, totalMins: 0, workoutCount: 0, volumeLoad: 0 };
    const weightTrend = (data?.weightTrend || []).map(d => ({
        date: format(new Date(d.date), 'MMM d'),
        weight: d.weightKg
    }));

    return (
        <>
            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon="🔥" label="Calories In" value={Math.round(macros.calories)} sub={`of ${calorieGoal} target`} color="#f59e0b" />
                <StatCard icon="💪" label="Active Burn" value={Math.round(exercise.activeCalories)} sub={`${exercise.workoutCount} workouts`} color="#ef4444" />
                <StatCard icon="⚡" label="Net Calories" value={Math.round(data?.netCalories || 0)} sub="intake − burn" color="#6366f1" />
                <StatCard icon="⏱️" label="Exercise" value={`${exercise.totalMins}m`} sub={exercise.volumeLoad > 0 ? `${exercise.volumeLoad.toLocaleString()}kg volume` : `${exercise.workoutCount} sessions`} color="#10b981" />
            </div>

            {/* Macro Progress */}
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-5">Macro Progress</h2>
                <div className="space-y-4">
                    <MacroBar label="Calories" current={macros.calories} target={calorieGoal} color="#f59e0b" unit="kcal" />
                    <MacroBar label="Protein" current={macros.protein} target={proteinGoal} color="#ef4444" />
                    <MacroBar label="Carbs" current={macros.carbs} target={250} color="#3b82f6" />
                    <MacroBar label="Fat" current={macros.fat} target={65} color="#a855f7" />
                    <MacroBar label="Fibre" current={macros.fibre} target={30} color="#10b981" />
                </div>
            </div>

            {/* New Widgets Row: Activity Rings + Macro Pie + Sleep + Wellness */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <ActivityRingsWidget rings={data?.activityRings} />
                <MacroPieChart ratio={data?.macroRatio} />
                <SleepCard sleep={data?.sleep} label="Last Night" />
                <WellnessCard stress={data?.stressLevel} energy={data?.energyLevel} soreness={data?.sorenessNotes} />
            </div>

            {/* Hydration */}
            <div className="grid md:grid-cols-2 gap-6">
                <HydrationWidget ml={data?.hydrationMl || 0} />
                {/* Recent PRs */}
                {data?.recentPRs?.length > 0 && (
                    <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
                        <h3 className="text-sm font-semibold text-surface-200 mb-3">🏆 Recent PRs</h3>
                        <div className="space-y-2">
                            {data.recentPRs.map(pr => (
                                <div key={pr.id} className="flex justify-between text-sm p-2 rounded-lg bg-surface-800/50">
                                    <span className="font-medium">{pr.exerciseName}</span>
                                    <span className="text-primary-400">{pr.value} {pr.metricType === 'weight' ? 'kg' : pr.metricType}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Weight Trend + Quick Add */}
            <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4">Weight Trend</h2>
                    {weightTrend.length > 0 ? (
                        <ResponsiveContainer width="100%" height={180}>
                            <LineChart data={weightTrend}>
                                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                                <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={chartTooltipStyle} formatter={(val) => [`${val} kg`, 'Weight']} />
                                <Line type="monotone" dataKey="weight" stroke="#6366f1" strokeWidth={3} dot={{ fill: '#6366f1', r: 4 }} activeDot={{ r: 6, stroke: '#818cf8', strokeWidth: 2 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[180px] flex items-center justify-center text-surface-200">No weight data yet. Log your first weigh-in!</div>
                    )}
                </div>
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4">Quick Add</h2>
                    <div className="grid grid-cols-3 gap-3">
                        <QuickAddButton icon="🍽️" label="Meal" to="/meals/add" />
                        <QuickAddButton icon="🏃" label="Workout" to="/workouts" />
                        <QuickAddButton icon="⚖️" label="Weigh-in" to={`/log/${format(new Date(), 'yyyy-MM-dd')}`} />
                        <QuickAddButton icon="💊" label="Supplement" to={`/log/${format(new Date(), 'yyyy-MM-dd')}`} />
                        <QuickAddButton icon="🏆" label="Record" to="/records" />
                        <QuickAddButton icon="📈" label="Progress" to="/progress" />
                    </div>
                </div>
            </div>

            {/* Today's Supplements */}
            {(data?.supplements?.length > 0) && (
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4">Today's Supplements</h2>
                    <div className="flex flex-wrap gap-3">
                        {data.supplements.map(s => (
                            <span key={s.id} className="px-4 py-2 rounded-xl bg-accent-500/10 border border-accent-500/20 text-accent-400 text-sm font-medium">
                                {s.name} {s.doseMg ? `${s.doseMg}mg` : ''}
                                {s.takenAt && <span className="text-surface-200 ml-1">@ {s.takenAt}</span>}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}

// ─── RANGE VIEW (WEEK / MONTH / TOTAL) ──────────────────────────────
function RangeView({ data, range, calorieGoal, proteinGoal }) {
    const avg = data?.averages || {};
    const totals = data?.totals || {};
    const days = (data?.days || []).map(d => ({
        ...d,
        date: format(new Date(d.date), range === 'monthly' || range === 'total' ? 'M/d' : 'EEE'),
    }));
    const weightData = (data?.weightData || []).map(d => ({
        date: format(new Date(d.date), range === 'total' ? 'MMM d' : range === 'monthly' ? 'M/d' : 'EEE'),
        weight: d.weightKg,
        bodyFat: d.bodyFatPct,
        muscle: d.muscleMassKg
    }));
    const rangeLabel = '/day avg';

    return (
        <>
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon="🔥" label="Avg Calories" value={Math.round(avg.calories || 0)} sub={rangeLabel} color="#f59e0b" />
                <StatCard icon="💪" label="Avg Active Burn" value={Math.round(avg.activeCalories || 0)} sub={`${totals.workoutCount || 0} workouts total`} color="#ef4444" />
                <StatCard icon="⚡" label="Avg Net Cal" value={Math.round(avg.netCalories || 0)} sub={`intake − burn${rangeLabel}`} color="#6366f1" />
                <StatCard icon="⏱️" label="Total Exercise" value={`${totals.workoutMins || 0}m`} sub={totals.volumeLoad > 0 ? `${totals.volumeLoad.toLocaleString()}kg volume` : `${data?.daysLogged || 0} days logged`} color="#10b981" />
            </div>

            {/* Comparison + Sleep + Macro Ratio */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ComparisonCard comparison={data?.comparison} />
                <SleepCard sleep={data?.sleepAvg} label="Avg Sleep" />
                {avg.macroRatio && <MacroPieChart ratio={avg.macroRatio} />}
            </div>

            {/* Avg Macro Progress */}
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-1">Daily Average Macros</h2>
                <p className="text-surface-200 text-sm mb-5">Average per day across {data?.daysLogged || 0} logged days</p>
                <div className="space-y-4">
                    <MacroBar label="Calories" current={avg.calories || 0} target={calorieGoal} color="#f59e0b" unit="kcal" />
                    <MacroBar label="Protein" current={avg.protein || 0} target={proteinGoal} color="#ef4444" />
                    <MacroBar label="Carbs" current={avg.carbs || 0} target={250} color="#3b82f6" />
                    <MacroBar label="Fat" current={avg.fat || 0} target={65} color="#a855f7" />
                    <MacroBar label="Fibre" current={avg.fibre || 0} target={30} color="#10b981" />
                </div>
            </div>

            {/* Calorie Trend */}
            {days.length > 0 && (
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4">Calorie Trend</h2>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={days} barGap={2}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={chartTooltipStyle} />
                            <Bar dataKey="calories" name="Calories In" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="activeCalories" name="Active Burn" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Protein Trend */}
            {days.length > 0 && (
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4">Protein Trend</h2>
                    <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={days}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={chartTooltipStyle} formatter={(val) => [`${Math.round(val)}g`, 'Protein']} />
                            <Line type="monotone" dataKey="protein" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', r: 3 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Weight Trend + Quick Add */}
            <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4">Weight Trend</h2>
                    {weightData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={180}>
                            <LineChart data={weightData}>
                                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                                <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={chartTooltipStyle} formatter={(val) => [`${val} kg`, 'Weight']} />
                                <Line type="monotone" dataKey="weight" stroke="#6366f1" strokeWidth={3} dot={{ fill: '#6366f1', r: 3 }} activeDot={{ r: 6, stroke: '#818cf8', strokeWidth: 2 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[180px] flex items-center justify-center text-surface-200">No weight data for this period</div>
                    )}
                </div>
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4">Quick Add</h2>
                    <div className="grid grid-cols-3 gap-3">
                        <QuickAddButton icon="🍽️" label="Meal" to="/meals/add" />
                        <QuickAddButton icon="🏃" label="Workout" to="/workouts" />
                        <QuickAddButton icon="⚖️" label="Weigh-in" to={`/log/${format(new Date(), 'yyyy-MM-dd')}`} />
                        <QuickAddButton icon="💊" label="Supplement" to={`/log/${format(new Date(), 'yyyy-MM-dd')}`} />
                        <QuickAddButton icon="🏆" label="Record" to="/records" />
                        <QuickAddButton icon="📈" label="Progress" to="/progress" />
                    </div>
                </div>
            </div>
        </>
    );
}
