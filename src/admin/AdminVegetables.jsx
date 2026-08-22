import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { formatRupee } from '../utils/format'
import Loading from '../components/Loading'

const UNITS = ['किलो', 'आधा किलो', 'ग्राम', 'गड्डी', 'नग']
const EMPTY_FORM = { id: null, name: '', category_id: '', price: '', unit: 'किलो', emoji: '🥬', image_url: '', stock_status: 'उपलब्ध', price_tiers: [] }

export default function AdminVegetables() {
  const [vegetables, setVegetables] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: vegs }, { data: cats }] = await Promise.all([
      supabase.from('vegetables').select('*, categories(name)').order('display_order'),
      supabase.from('categories').select('*').order('display_order'),
    ])
    setVegetables(vegs || [])
    setCategories(cats || [])
    setLoading(false)
  }

  function openNew() {
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(veg) {
    setForm({
      id: veg.id,
      name: veg.name,
      category_id: veg.category_id || '',
      price: veg.price,
      unit: veg.unit,
      emoji: veg.emoji || '🥬',
      image_url: veg.image_url || '',
      stock_status: veg.stock_status,
      price_tiers: Array.isArray(veg.price_tiers) ? veg.price_tiers : [],
    })
    setShowForm(true)
  }

  async function handleImageUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    const fileName = `${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('vegetable-images').upload(fileName, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('vegetable-images').getPublicUrl(fileName)
      setForm((f) => ({ ...f, image_url: data.publicUrl }))
    } else {
      alert('फोटो अपलोड नहीं हो सकी। कृपया "vegetable-images" नाम का Storage bucket बनाएं (देखें README)।')
    }
    setUploading(false)
  }

  function addTierRow() {
    setForm((f) => ({ ...f, price_tiers: [...f.price_tiers, { qty: '', unit: f.unit, price: '' }] }))
  }

  function updateTierRow(idx, key, value) {
    setForm((f) => ({
      ...f,
      price_tiers: f.price_tiers.map((t, i) => (i === idx ? { ...t, [key]: value } : t)),
    }))
  }

  function removeTierRow(idx) {
    setForm((f) => ({ ...f, price_tiers: f.price_tiers.filter((_, i) => i !== idx) }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const cleanTiers = form.price_tiers
      .filter((t) => t.qty !== '' && t.price !== '')
      .map((t) => ({ qty: Number(t.qty), unit: t.unit, price: Number(t.price) }))
    const payload = {
      name: form.name,
      category_id: form.category_id || null,
      price: Number(form.price),
      unit: form.unit,
      emoji: form.emoji,
      image_url: form.image_url || null,
      stock_status: form.stock_status,
      price_tiers: cleanTiers.length > 0 ? cleanTiers : null,
    }
    let error
    if (form.id) {
      ;({ error } = await supabase.from('vegetables').update(payload).eq('id', form.id))
    } else {
      ;({ error } = await supabase.from('vegetables').insert(payload))
    }
    setSaving(false)
    if (error) {
      console.error('सब्ज़ी सेव नहीं हो सकी:', error)
      alert('सेव नहीं हो सका: ' + error.message)
      return
    }
    setShowForm(false)
    loadData()
  }

  async function toggleStock(veg) {
    const newStatus = veg.stock_status === 'उपलब्ध' ? 'अनुपलब्ध' : 'उपलब्ध'
    const { error } = await supabase.from('vegetables').update({ stock_status: newStatus }).eq('id', veg.id)
    if (error) {
      alert('स्थिति नहीं बदल सकी: ' + error.message)
      return
    }
    loadData()
  }

  async function handleDelete(veg) {
    if (!confirm(`क्या आप वाकई "${veg.name}" हटाना चाहते हैं?`)) return
    const { error } = await supabase.from('vegetables').delete().eq('id', veg.id)
    if (error) {
      alert('हटाया नहीं जा सका: ' + error.message)
      return
    }
    loadData()
  }

  if (loading) return <Loading />

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-extrabold text-xl text-gray-800">सब्ज़ी प्रबंधन</h1>
        <button onClick={openNew} className="btn-primary py-2 px-4 text-sm">+ नई सब्ज़ी जोड़ें</button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">सब्ज़ी</th>
              <th className="text-left px-4 py-3">श्रेणी</th>
              <th className="text-left px-4 py-3">कीमत</th>
              <th className="text-left px-4 py-3">स्थिति</th>
              <th className="text-left px-4 py-3">कार्रवाई</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {vegetables.map((v) => (
              <tr key={v.id}>
                <td className="px-4 py-3 flex items-center gap-2">
                  <span className="text-xl">{v.emoji}</span>
                  <span className="font-semibold text-gray-800">{v.name}</span>
                </td>
                <td className="px-4 py-3 text-gray-500">{v.categories?.name || '-'}</td>
                <td className="px-4 py-3 font-semibold">
                  {formatRupee(v.price)} / {v.unit}
                  {Array.isArray(v.price_tiers) && v.price_tiers.length > 0 && (
                    <span className="ml-1 text-[10px] bg-kisan/10 text-kisan font-bold px-1.5 py-0.5 rounded-full align-middle">
                      {v.price_tiers.length} रेट
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleStock(v)}
                    className={`text-xs font-bold px-3 py-1 rounded-full ${
                      v.stock_status === 'उपलब्ध' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                    }`}
                  >
                    {v.stock_status}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    <button onClick={() => openEdit(v)} className="text-blue-600 font-semibold text-xs">बदलें</button>
                    <button onClick={() => handleDelete(v)} className="text-red-500 font-semibold text-xs">हटाएं</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="font-bold text-lg text-gray-800 mb-4">{form.id ? 'सब्ज़ी बदलें' : 'नई सब्ज़ी जोड़ें'}</h2>
            <form onSubmit={handleSave} className="flex flex-col gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">सब्ज़ी का नाम</label>
                <input required className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">श्रेणी</label>
                <select className="input-field" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">चुनें</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1">कीमत (₹)</label>
                  <input required type="number" step="0.01" className="input-field" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1">माप</label>
                  <select className="input-field" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                    {UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">इमोजी (फोटो न हो तो दिखेगा)</label>
                <input className="input-field" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">फोटो अपलोड करें</label>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="text-sm" />
                {uploading && <p className="text-xs text-gray-500 mt-1">अपलोड हो रहा है...</p>}
                {form.image_url && <img src={form.image_url} alt="" className="w-16 h-16 rounded-lg object-cover mt-2" />}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">उपलब्धता</label>
                <select className="input-field" value={form.stock_status} onChange={(e) => setForm({ ...form, stock_status: e.target.value })}>
                  <option value="उपलब्ध">उपलब्ध</option>
                  <option value="अनुपलब्ध">अनुपलब्ध</option>
                </select>
              </div>

              <div className="border-t border-gray-200 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-gray-600">
                    मात्रा के हिसाब से अलग कीमत (वैकल्पिक)
                  </label>
                  <button type="button" onClick={addTierRow} className="text-kisan text-xs font-bold">+ रेट जोड़ें</button>
                </div>
                <p className="text-xs text-gray-400 mb-2">
                  खाली छोड़ें तो ऊपर वाली सामान्य कीमत ही इस्तेमाल होगी। भरने पर ग्राहक को माप चुनने का विकल्प मिलेगा।
                </p>
                {form.price_tiers.map((t, idx) => (
                  <div key={idx} className="flex gap-2 mb-2 items-center">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="मात्रा"
                      className="input-field py-1.5 flex-1"
                      value={t.qty}
                      onChange={(e) => updateTierRow(idx, 'qty', e.target.value)}
                    />
                    <select
                      className="input-field py-1.5 flex-1"
                      value={t.unit}
                      onChange={(e) => updateTierRow(idx, 'unit', e.target.value)}
                    >
                      {UNITS.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="कीमत ₹"
                      className="input-field py-1.5 flex-1"
                      value={t.price}
                      onChange={(e) => updateTierRow(idx, 'price', e.target.value)}
                    />
                    <button type="button" onClick={() => removeTierRow(idx)} className="text-red-500 text-lg font-bold px-1">×</button>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-outline flex-1">रद्द करें</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'सेव हो रहा है...' : 'सेव करें'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
