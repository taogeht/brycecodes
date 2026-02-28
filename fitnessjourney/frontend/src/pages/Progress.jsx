import { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format } from 'date-fns';
import api from '../api/client';

const tooltip = { contentStyle: { background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', color: '#fff' } };

export default function Progress() {
    const [monthly, setMonthly] = useState(null);
    const [metrics, setMetrics] = useState([]);
    const [loading, setLoading] = useState(true);
    const [photoUpload, setPhotoUpload] = useState(false);
    const [photoForm, setPhotoForm] = useState({ weight: '', notes: '' });
    const [photoFile, setPhotoFile] = useState(null);

    useEffect(() => {
        Promise.all([
            api.get('/dashboard/monthly'),
            api.get('/metrics?limit=90')
        ]).then(([m, met]) => {
            setMonthly(m.data);
            setMetrics(met.data);
        }).catch(console.error).finally(() => setLoading(false));
    }, []);

    const uploadPhoto = async () => {
        if (!photoFile) return;
        const fd = new FormData();
        fd.append('photo', photoFile);
        fd.append('date', format(new Date(), 'yyyy-MM-dd'));
        if (photoForm.weight) fd.append('weightKg', photoForm.weight);
        if (photoForm.notes) fd.append('notes', photoForm.notes);
        await api.post('/metrics/photo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        const met = await api.get('/metrics?limit=90');
        setMetrics(met.data);
        setPhotoUpload(false); setPhotoFile(null);
    };

    const exportCSV = () => { window.open('/api/export/csv', '_blank'); };

    if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent" /></div>;

    const calData = (monthly?.days || []).map(d => ({ date: format(new Date(d.date), 'MMM d'), calories: d.calories, protein: d.protein }));
    const wData = (monthly?.weightData || []).map(d => ({ date: format(new Date(d.date), 'MMM d'), weight: d.weightKg }));
    const photos = metrics.filter(m => m.photoUrl);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Progress</h1>
                <div className="flex gap-3">
                    <button onClick={() => setPhotoUpload(!photoUpload)} className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-all">📸 Check-in Photo</button>
                    <button onClick={exportCSV} className="px-4 py-2 rounded-xl bg-surface-800 border border-surface-700 hover:bg-surface-700 text-white text-sm font-medium transition-all">📥 Export CSV</button>
                </div>
            </div>

            {photoUpload && (
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6 space-y-4">
                    <h2 className="font-semibold">Upload Check-in Photo</h2>
                    <div className="flex gap-4 items-end">
                        <label className="cursor-pointer px-4 py-2 rounded-xl bg-surface-800 border border-surface-700 text-surface-200 text-sm hover:bg-surface-700">
                            Choose Photo<input type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files[0])} className="hidden" />
                        </label>
                        <input placeholder="Weight (kg)" type="number" step="0.1" value={photoForm.weight} onChange={e => setPhotoForm(f => ({ ...f, weight: e.target.value }))} className="px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white text-sm w-32 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                        <input placeholder="Notes" value={photoForm.notes} onChange={e => setPhotoForm(f => ({ ...f, notes: e.target.value }))} className="flex-1 px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                        <button onClick={uploadPhoto} disabled={!photoFile} className="px-4 py-2 rounded-xl bg-accent-600 hover:bg-accent-500 text-white text-sm font-medium disabled:opacity-50">Upload</button>
                    </div>
                    {photoFile && <p className="text-sm text-surface-200">Selected: {photoFile.name}</p>}
                </div>
            )}

            {/* Weight Chart */}
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4">Weight Over Time</h2>
                {wData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={wData}><CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} />
                            <YAxis domain={['dataMin-1', 'dataMax+1']} tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} />
                            <Tooltip {...tooltip} formatter={v => [`${v} kg`, 'Weight']} />
                            <Line type="monotone" dataKey="weight" stroke="#6366f1" strokeWidth={3} dot={{ fill: '#6366f1', r: 4 }} /></LineChart>
                    </ResponsiveContainer>
                ) : <p className="text-surface-200 text-center py-8">No weight data yet</p>}
            </div>

            {/* Calories Chart */}
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4">Daily Calories (30 Days)</h2>
                {calData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={calData}><CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} />
                            <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} />
                            <Tooltip {...tooltip} />
                            <Bar dataKey="calories" fill="#f59e0b" radius={[4, 4, 0, 0]} /></BarChart>
                    </ResponsiveContainer>
                ) : <p className="text-surface-200 text-center py-8">No calorie data yet</p>}
            </div>

            {/* Protein Trend */}
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4">Protein Intake Trend</h2>
                {calData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={calData}><CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} />
                            <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} />
                            <Tooltip {...tooltip} formatter={v => [`${v}g`, 'Protein']} />
                            <Line type="monotone" dataKey="protein" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', r: 3 }} /></LineChart>
                    </ResponsiveContainer>
                ) : <p className="text-surface-200 text-center py-8">No protein data yet</p>}
            </div>

            {/* Photo Timeline */}
            {photos.length > 0 && (
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4">Photo Timeline</h2>
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                        {photos.map(p => (
                            <div key={p.id} className="space-y-1">
                                <img src={p.photoUrl} alt="check-in" className="w-full aspect-square rounded-xl object-cover hover:scale-105 transition-transform cursor-pointer" />
                                <p className="text-xs text-surface-200 text-center">{format(new Date(p.date), 'MMM d')}</p>
                                {p.weightKg && <p className="text-xs text-center font-medium">{p.weightKg}kg</p>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5 text-center">
                    <p className="text-3xl font-bold text-primary-400">{monthly?.daysLogged || 0}</p>
                    <p className="text-sm text-surface-200">Days Logged</p>
                </div>
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5 text-center">
                    <p className="text-3xl font-bold text-accent-400">{monthly?.totalWorkouts || 0}</p>
                    <p className="text-sm text-surface-200">Workouts</p>
                </div>
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5 text-center">
                    <p className="text-3xl font-bold text-calories">{photos.length}</p>
                    <p className="text-sm text-surface-200">Check-in Photos</p>
                </div>
            </div>
        </div>
    );
}
