import { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, ComposedChart, Area } from 'recharts';
import { format } from 'date-fns';
import api from '../api/client';

const MAGNESIUM_START = '2026-02-23';

const tt = { contentStyle: { background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', color: '#fff' } };

export default function Sleep() {
    const [trends, setTrends] = useState(null);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(30);

    useEffect(() => {
        setLoading(true);
        api.get(`/sleep/trends?days=${days}`)
            .then(r => setTrends(r.data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [days]);

    if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent" /></div>;

    const logs = (trends?.logs || []).map(l => ({
        date: format(new Date(l.date), 'MMM d'),
        rawDate: l.date,
        total: (l.totalMins / 60).toFixed(1),
        deep: l.deepMins || 0,
        rem: l.remMins || 0,
        core: l.coreMins || 0,
        awake: l.awakeMins || 0,
        deepPct: l.deepSleepPct || 0
    }));

    const avg = trends?.averages || {};
    const magIdx = logs.findIndex(l => l.rawDate >= MAGNESIUM_START);
    const magLabel = magIdx >= 0 ? logs[magIdx].date : null;

    const deepStatus = (pct) => pct >= 15 ? '✅' : pct >= 10 ? '⚠️' : '🔴';

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Sleep</h1>
                    <p className="text-surface-200 text-sm">Tracking deep sleep optimization with magnesium bisglycinate</p>
                </div>
                <div className="flex gap-2">
                    {[7, 14, 30, 60, 90].map(d => (
                        <button key={d} onClick={() => setDays(d)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${days === d ? 'bg-purple-600 text-white' : 'bg-surface-800 text-surface-200 hover:bg-surface-700'}`}>{d}d</button>
                    ))}
                </div>
            </div>

            {/* Averages cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-4 text-center">
                    <p className="text-2xl font-bold">{Math.floor(avg.totalMins / 60)}h {avg.totalMins % 60}m</p>
                    <p className="text-xs text-surface-200">Avg Sleep</p>
                </div>
                <div className="bg-surface-900 border border-purple-800/30 rounded-2xl p-4 text-center">
                    <p className="text-2xl font-bold text-purple-400">{avg.deepMins}m</p>
                    <p className="text-xs text-surface-200">Avg Deep {deepStatus(avg.deepPct)}</p>
                </div>
                <div className="bg-surface-900 border border-blue-800/30 rounded-2xl p-4 text-center">
                    <p className="text-2xl font-bold text-blue-400">{avg.remMins}m</p>
                    <p className="text-xs text-surface-200">Avg REM</p>
                </div>
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-4 text-center">
                    <p className="text-2xl font-bold text-surface-300">{avg.coreMins}m</p>
                    <p className="text-xs text-surface-200">Avg Core</p>
                </div>
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-4 text-center">
                    <p className="text-2xl font-bold text-purple-300">{avg.deepPct}%</p>
                    <p className="text-xs text-surface-200">Avg Deep %</p>
                </div>
            </div>

            {/* Deep Sleep % Trend — THE KEY CHART */}
            <div className="bg-surface-900 border border-purple-800/20 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Deep Sleep % Trend</h2>
                    <span className="text-xs px-3 py-1 rounded-full bg-purple-500/20 text-purple-300">Target: 15-20%</span>
                </div>
                {logs.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                        <ComposedChart data={logs}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} />
                            <YAxis domain={[0, 25]} tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} unit="%" />
                            <Tooltip {...tt} formatter={v => [`${v}%`, 'Deep Sleep']} />
                            <Area type="monotone" dataKey="deepPct" fill="#7c3aed20" stroke="none" />
                            <Line type="monotone" dataKey="deepPct" stroke="#7c3aed" strokeWidth={3} dot={{ fill: '#7c3aed', r: 5 }} />
                            {/* Target zone */}
                            <ReferenceLine y={15} stroke="#4ade80" strokeDasharray="5 5" label={{ value: '15%', fill: '#4ade80', fontSize: 11 }} />
                            <ReferenceLine y={20} stroke="#4ade80" strokeDasharray="5 5" label={{ value: '20%', fill: '#4ade80', fontSize: 11 }} />
                            {/* Mag start */}
                            {magLabel && <ReferenceLine x={magLabel} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: '💊 Mag Start', fill: '#f59e0b', fontSize: 11, position: 'top' }} />}
                        </ComposedChart>
                    </ResponsiveContainer>
                ) : <p className="text-surface-200 text-center py-8">No sleep data yet. Import a daily log with sleep data.</p>}
            </div>

            {/* Sleep Stages Stacked */}
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4">Sleep Stages (minutes)</h2>
                {logs.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={logs}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} />
                            <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} />
                            <Tooltip {...tt} />
                            <Bar dataKey="deep" stackId="a" fill="#7c3aed" name="Deep" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="rem" stackId="a" fill="#3b82f6" name="REM" />
                            <Bar dataKey="core" stackId="a" fill="#60a5fa" name="Core" />
                            <Bar dataKey="awake" stackId="a" fill="#475569" name="Awake" radius={[4, 4, 0, 0]} />
                            {magLabel && <ReferenceLine x={magLabel} stroke="#f59e0b" strokeDasharray="3 3" />}
                        </BarChart>
                    </ResponsiveContainer>
                ) : <p className="text-surface-200 text-center py-8">No data yet</p>}
            </div>

            {/* Deep Sleep Minutes Trend */}
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4">Deep Sleep Minutes</h2>
                {logs.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={logs}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} />
                            <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} />
                            <Tooltip {...tt} formatter={v => [`${v}m`, 'Deep']} />
                            <Line type="monotone" dataKey="deep" stroke="#a78bfa" strokeWidth={2} dot={{ fill: '#a78bfa', r: 4 }} />
                            <ReferenceLine y={68} stroke="#4ade80" strokeDasharray="5 5" label={{ value: 'Target 68m', fill: '#4ade80', fontSize: 11 }} />
                            {magLabel && <ReferenceLine x={magLabel} stroke="#f59e0b" strokeDasharray="3 3" />}
                        </LineChart>
                    </ResponsiveContainer>
                ) : <p className="text-surface-200 text-center py-8">No data yet</p>}
            </div>

            {/* Recent nights table */}
            {logs.length > 0 && (
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4">Recent Nights</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead><tr className="text-surface-200 text-xs">
                                <th className="text-left py-2 px-3">Date</th>
                                <th className="text-right py-2 px-3">Total</th>
                                <th className="text-right py-2 px-3">Deep</th>
                                <th className="text-right py-2 px-3">Deep%</th>
                                <th className="text-right py-2 px-3">REM</th>
                                <th className="text-right py-2 px-3">Core</th>
                                <th className="text-right py-2 px-3">Awake</th>
                            </tr></thead>
                            <tbody>
                                {[...logs].reverse().map((l, i) => (
                                    <tr key={i} className="border-t border-surface-800/50 hover:bg-surface-800/30">
                                        <td className="py-2 px-3 font-medium">{l.date}</td>
                                        <td className="py-2 px-3 text-right">{l.total}h</td>
                                        <td className="py-2 px-3 text-right text-purple-400 font-medium">{l.deep}m</td>
                                        <td className="py-2 px-3 text-right">{deepStatus(l.deepPct)} {l.deepPct}%</td>
                                        <td className="py-2 px-3 text-right text-blue-400">{l.rem}m</td>
                                        <td className="py-2 px-3 text-right text-blue-300">{l.core}m</td>
                                        <td className="py-2 px-3 text-right text-surface-200">{l.awake}m</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Legend */}
            <div className="text-xs text-surface-200 flex gap-4 justify-center">
                <span>🟣 Deep = restorative (target 15-20%)</span>
                <span>🔵 REM = memory/learning</span>
                <span>💊 Yellow line = magnesium start ({MAGNESIUM_START})</span>
            </div>
        </div>
    );
}
