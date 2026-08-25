import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import Loading from '../components/Loading'

const EMPTY_FORM = { id: null, name: '', name_en: '', slug: '', display_order: 0, is_active: true }

function slugify(text) {
  // हिंदी टेक्स्ट के लिए बुनियादी slug — सिर्फ स्पेस को हाइफ़न में बदलता है, बाकी वैसा ही रहता है
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\u0900-\u097Fa-z0-9-]/g, '')
}

export default function AdminCategories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadCategories()
  }, [])

  async function loadCategories() {
    setLoading(true)
    const { data } = await supabase.from('categories').select('*').order('display_order')
    setCategories(data || [])
    setLoading(false)
  }

  function openNew() {
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(cat) {
    setForm({
      id: cat.id,
      name: cat.name,
      name_en: cat.name_en || '',
      slug: cat.slug,
      display_order: cat.display_order,
      is_active: cat.is_active,
    })
    setShowForm(true)
  }

  function handleNameChange(value) {
    setForm((f) => ({
      ...f,
      name: value,
      // नई श्रेणी में slug अपने आप बने, मौजूदा को बदलने पर slug न छेड़ें
      slug: f.id ? f.slug : slugify(value),
    }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const payload = {
      name: form.name,
      name_en: form.name_en.trim() || null,
      slug: form.slug || slugify(form.name),
      display_order: Number(form.display_order) || 0,
      is_active: form.is_active,
    }
    let error
    if (form.id) {
      ;({ error } = await supabase.from('categories').update(payload).eq('id', form.id))
    } else {
      ;({ error } = await supabase.from('categories').insert(payload))
    }
    setSaving(false)
    if (error) {
      alert('सेव नहीं हो सका: ' + error.message)
      return
    }
    setShowForm(false)
    loadCategories()
  }

  async function toggleActive(cat) {
    const { error } = await supabase.from('categories').update({ is_active: !cat.is_active }).eq('id', cat.id)
    if (error) {
      alert('स्थिति नहीं बदल सकी: ' + error.message)
      return
    }
    loadCategories()
  }

  async function handleDelete(cat) {
    if (!confirm(`क्या आप वाकई "${cat.name}" श्रेणी हटाना चाहते हैं? इस श्रेणी की सब्ज़ियाँ "बिना श्रेणी" हो जाएंगी।`)) return
    const { error } = await supabase.from('categories').delete().eq('id', cat.id)
    if (error) {
      alert('हटाया नहीं जा सका: ' + error.message)
      return
    }
    loadCategories()
  }

  if (loading) return <Loading />

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-extrabold text-xl text-gray-800">श्रेणी प्रबंधन</h1>
        <button onClick={openNew} className="btn-primary py-2 px-4 text-sm">+ नई श्रेणी जोड़ें</button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">नाम (हिंदी)</th>
              <th className="text-left px-4 py-3">Name (English)</th>
              <th className="text-left px-4 py-3">क्रम</th>
              <th className="text-left px-4 py-3">स्थिति</th>
              <th className="text-left px-4 py-3">कार्रवाई</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {categories.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-semibold text-gray-800">{c.name}</td>
                <td className="px-4 py-3 text-gray-500">{c.name_en || '-'}</td>
                <td className="px-4 py-3 text-gray-500">{c.display_order}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleActive(c)}
                    className={`text-xs font-bold px-3 py-1 rounded-full ${
                      c.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                    }`}
                  >
                    {c.is_active ? 'सक्रिय' : 'निष्क्रिय'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    <button onClick={() => openEdit(c)} className="text-blue-600 font-semibold text-xs">बदलें</button>
                    <button onClick={() => handleDelete(c)} className="text-red-500 font-semibold text-xs">हटाएं</button>
                  </div>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-gray-400 py-10">अभी तक कोई श्रेणी नहीं</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="font-bold text-lg text-gray-800 mb-4">{form.id ? 'श्रेणी बदलें' : 'नई श्रेणी जोड़ें'}</h2>
            <form onSubmit={handleSave} className="flex flex-col gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">नाम (हिंदी)</label>
                <input required className="input-field" value={form.name} onChange={(e) => handleNameChange(e.target.value)} placeholder="जैसे: हरी सब्ज़ियाँ" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">English नाम (वैकल्पिक)</label>
                <input className="input-field" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} placeholder="जैसे: Green Vegetables" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">Slug (यूनीक पहचान, अंग्रेज़ी/छोटे अक्षरों में)</label>
                <input required className="input-field" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="जैसे: hari-sabjiyan" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">क्रम संख्या (छोटी संख्या पहले दिखेगी)</label>
                <input type="number" className="input-field" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
              </div>
              <div className="flex items-center justify-between">
                <label className="font-semibold text-gray-700 text-sm">सक्रिय रखें</label>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
                  className={`w-12 h-7 rounded-full transition-colors relative ${form.is_active ? 'bg-kisan' : 'bg-gray-300'}`}
                >
                  <span
                    className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                      form.is_active ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
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
