import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import api from '../api/client';

export default function MealEntry() {
    const navigate = useNavigate();
    const [templates, setTemplates] = useState([]);
    const [form, setForm] = useState({
        date: format(new Date(), 'yyyy-MM-dd'),
        mealType: 'lunch',
        name: '',
        notes: ''
    });
    const [components, setComponents] = useState([]);
    const [photo, setPhoto] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(null);
    const [saving, setSaving] = useState(false);
    const [saveAsTemplate, setSaveAsTemplate] = useState(false);

    useEffect(() => {
        api.get('/templates').then(res => setTemplates(res.data)).catch(() => { });
    }, []);

    const addComponent = () => {
        setComponents([...components, { name: '', weightG: '', calories: '', proteinG: '', carbsG: '', fatG: '' }]);
    };

    const updateComponent = (i, field, value) => {
        setComponents(components.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
    };

    const removeComponent = (i) => {
        setComponents(components.filter((_, idx) => idx !== i));
    };

    // Auto-calculate totals from components
    const totals = components.reduce((acc, c) => ({
        calories: acc.calories + (parseFloat(c.calories) || 0),
        proteinG: acc.proteinG + (parseFloat(c.proteinG) || 0),
        carbsG: acc.carbsG + (parseFloat(c.carbsG) || 0),
        fatG: acc.fatG + (parseFloat(c.fatG) || 0)
    }), { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });

    const loadTemplate = (template) => {
        setForm(f => ({ ...f, name: template.name, mealType: template.mealType }));
        if (template.components) {
            setComponents(template.components);
        }
    };

    const handlePhotoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setPhoto(file);
            setPhotoPreview(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);

        try {
            // Ensure daily log exists
            const logRes = await api.post('/logs', { date: form.date });
            const dailyLogId = logRes.data.id;

            // Create meal
            const mealData = {
                dailyLogId,
                mealType: form.mealType,
                name: form.name,
                calories: totals.calories || null,
                proteinG: totals.proteinG || null,
                carbsG: totals.carbsG || null,
                fatG: totals.fatG || null,
                notes: form.notes,
                components: components.filter(c => c.name)
            };

            const mealRes = await api.post('/meals', mealData);

            // Upload photo if present
            if (photo) {
                const formData = new FormData();
                formData.append('photo', photo);
                await api.post(`/meals/${mealRes.data.id}/photo`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            }

            // Save as template if checked
            if (saveAsTemplate) {
                await api.post('/templates', {
                    name: form.name,
                    mealType: form.mealType,
                    calories: totals.calories,
                    proteinG: totals.proteinG,
                    carbsG: totals.carbsG,
                    fatG: totals.fatG,
                    components: components.filter(c => c.name)
                });
            }

            navigate(`/log/${form.date}`);
        } catch (err) {
            console.error('Save meal error:', err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6 max-w-3xl">
            <h1 className="text-2xl font-bold">Add Meal</h1>

            {/* Templates */}
            {templates.length > 0 && (
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
                    <h2 className="text-sm font-semibold text-surface-200 mb-3">Quick Templates</h2>
                    <div className="flex flex-wrap gap-2">
                        {templates.map(t => (
                            <button
                                key={t.id}
                                onClick={() => loadTemplate(t)}
                                className="px-4 py-2 rounded-xl bg-primary-600/10 border border-primary-500/20 text-primary-400 text-sm hover:bg-primary-600/20 transition-all"
                            >
                                {t.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Info */}
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4">Meal Details</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-surface-200 mb-1">Date</label>
                            <input
                                type="date"
                                value={form.date}
                                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                                className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-surface-200 mb-1">Meal Type</label>
                            <select
                                value={form.mealType}
                                onChange={e => setForm(f => ({ ...f, mealType: e.target.value }))}
                                className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            >
                                <option value="breakfast">Breakfast</option>
                                <option value="lunch">Lunch</option>
                                <option value="dinner">Dinner</option>
                                <option value="snack">Snack</option>
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm text-surface-200 mb-1">Meal Name</label>
                            <input
                                type="text"
                                value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="e.g. Chicken and Rice Bowl"
                                className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                                required
                            />
                        </div>
                    </div>
                </div>

                {/* Photo Upload */}
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4">Photo</h2>
                    <div className="flex items-center gap-4">
                        {photoPreview ? (
                            <img src={photoPreview} alt="Meal" className="w-24 h-24 rounded-xl object-cover" />
                        ) : (
                            <div className="w-24 h-24 rounded-xl bg-surface-800 border-2 border-dashed border-surface-700 flex items-center justify-center text-surface-200">
                                📷
                            </div>
                        )}
                        <label className="cursor-pointer px-4 py-2 rounded-xl bg-surface-800 border border-surface-700 text-sm text-surface-200 hover:bg-surface-700 transition-all">
                            Choose Photo
                            <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                        </label>
                    </div>
                </div>

                {/* Components Builder */}
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold">Ingredients</h2>
                        <button
                            type="button"
                            onClick={addComponent}
                            className="text-sm px-3 py-1 rounded-xl bg-primary-600/10 text-primary-400 hover:bg-primary-600/20 transition-all"
                        >
                            + Add Ingredient
                        </button>
                    </div>

                    {components.length === 0 ? (
                        <p className="text-surface-200 text-sm">Add ingredients to auto-calculate macros</p>
                    ) : (
                        <div className="space-y-3">
                            {components.map((c, i) => (
                                <div key={i} className="grid grid-cols-12 gap-2 items-center p-3 rounded-xl bg-surface-800/50">
                                    <input className="col-span-3 px-2 py-1.5 rounded-lg bg-surface-800 border border-surface-700 text-white text-sm" placeholder="Ingredient" value={c.name} onChange={e => updateComponent(i, 'name', e.target.value)} />
                                    <input className="col-span-1 px-2 py-1.5 rounded-lg bg-surface-800 border border-surface-700 text-white text-sm" placeholder="g" type="number" value={c.weightG} onChange={e => updateComponent(i, 'weightG', e.target.value)} />
                                    <input className="col-span-2 px-2 py-1.5 rounded-lg bg-surface-800 border border-surface-700 text-white text-sm" placeholder="kcal" type="number" value={c.calories} onChange={e => updateComponent(i, 'calories', e.target.value)} />
                                    <input className="col-span-2 px-2 py-1.5 rounded-lg bg-surface-800 border border-surface-700 text-white text-sm" placeholder="Protein" type="number" value={c.proteinG} onChange={e => updateComponent(i, 'proteinG', e.target.value)} />
                                    <input className="col-span-2 px-2 py-1.5 rounded-lg bg-surface-800 border border-surface-700 text-white text-sm" placeholder="Carbs" type="number" value={c.carbsG} onChange={e => updateComponent(i, 'carbsG', e.target.value)} />
                                    <input className="col-span-1 px-2 py-1.5 rounded-lg bg-surface-800 border border-surface-700 text-white text-sm" placeholder="Fat" type="number" value={c.fatG} onChange={e => updateComponent(i, 'fatG', e.target.value)} />
                                    <button type="button" onClick={() => removeComponent(i)} className="col-span-1 text-red-400 hover:text-red-300 text-sm">✕</button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Totals */}
                    {components.length > 0 && (
                        <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-surface-800/80 to-surface-800/40 border border-surface-700">
                            <p className="text-sm font-semibold mb-2">Calculated Totals</p>
                            <div className="flex gap-6 text-sm">
                                <span className="text-calories">{Math.round(totals.calories)} kcal</span>
                                <span className="text-protein">{Math.round(totals.proteinG)}g protein</span>
                                <span className="text-carbs">{Math.round(totals.carbsG)}g carbs</span>
                                <span className="text-fat">{Math.round(totals.fatG)}g fat</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Notes */}
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6">
                    <label className="block text-sm text-surface-200 mb-2">Notes</label>
                    <textarea
                        value={form.notes}
                        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        rows={3}
                        placeholder="Paste a Claude macro breakdown here, or add any notes..."
                        className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none"
                    />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm text-surface-200">
                        <input
                            type="checkbox"
                            checked={saveAsTemplate}
                            onChange={e => setSaveAsTemplate(e.target.checked)}
                            className="rounded border-surface-700 bg-surface-800 text-primary-500 focus:ring-primary-500"
                        />
                        Save as template
                    </label>
                    <button
                        type="submit"
                        disabled={saving}
                        className="px-8 py-3 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold hover:from-primary-500 hover:to-primary-400 transition-all shadow-lg shadow-primary-600/30 disabled:opacity-50"
                    >
                        {saving ? 'Saving...' : 'Save Meal'}
                    </button>
                </div>
            </form>
        </div>
    );
}
