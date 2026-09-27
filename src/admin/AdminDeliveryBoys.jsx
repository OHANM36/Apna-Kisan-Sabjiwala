import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { formatDate } from '../utils/format'
import Loading from '../components/Loading'

const emptyForm = { id: null, full_name: '', phone: '', pin: '', is_active: true }

export default function AdminDeliveryBoys() {
  const [boys, setBoys] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadBoys()
  }, [])

  async function loadBoys() {
    setLoading(true)
    const { data } = await supabase.from('delivery_boys').select('*').order('created_at', { ascending: false })
    setBoys(data || [])
    setLoading(false)
  }

  function openNew() {
    setError('')
    setEditing({ ...emptyForm })
  }

  function openEdit(boy) {
    setError('')
    setEditing({ ...boy })
  }

  async function saveBoy(e) {
    e.preventDefault()
    setError('')

    const pin = editing.pin.trim()
    if (!/^\d{4}$/.test(pin)) {
      setError('पिन ठीक 4 अंकों का होना चाहिए (जैसे: 1234)')
      return
    }
    if (!editing.full_name.trim()) {
      setError('नाम डालना ज़रूरी है')
      return
    }

    setSaving(true)
    const payload = {
      full_name: editing.full_name.trim(),
      phone: editing.phone?.trim() || null,
      pin,
      is_active: editing.is_active,
    }

    const { error: dbError } = editing.id
      ? await supabase.from('delivery_boys').update(payload).eq('id', editing.id)
      : await supabase.from('delivery_boys').insert(payload)

    setSaving(false)

    if (dbError) {
      setError(
        dbError.message.includes('idx_delivery_boys_active_pin')
          ? 'यह पिन पहले से किसी सक्रिय डिलीवरी बॉय का है। कृपया अलग पिन चुनें।'
          : `सेव नहीं हुआ: ${dbError.message}`
      )
      return
    }

    setEditing(null)
    loadBoys()
  }

  async function toggleActive(boy) {
    await supabase.from('delivery_boys').update({ is_active: !boy.is_active }).eq('id', boy.id)
    loadBoys()
  }

  async function removeBoy(boy) {
    if (!confirm(`क्या आप वाकई ${boy.full_name} को हटाना चाहते हैं?`)) return
    await supabase.from('delivery_boys').delete().eq('id', boy.id)
    loadBoys()
  }

  if (loading) return <Loading />

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-extrabold text-xl text-gray-800">डिलीवरी बॉय प्रबंधन</h1>
        <button onClick={openNew} className="btn-primary py-2 px-4 text-sm">+ नया जोड़ें</button>
      </div>

      <p className="text-xs text-gray-400 mb-4">
        हर डिलीवरी बॉय को एक 4 अंकों का पिन दें — वह उसी पिन से <span className="font-bold">/delivery</span> पेज पर लॉगिन करेगा।
      </p>

      <div className="flex flex-col gap-3">
        {boys.map((b) => (
          <div key={b.id} className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="font-bold text-gray-800 text-sm">{b.full_name}</p>
                {b.phone && <p className="text-xs text-gray-500">{b.phone}</p>}
                <p className="text-xs text-gray-400 mt-0.5">पिन: <span className="font-mono font-bold text-gray-600">{b.pin}</span></p>
                <p className="text-xs text-gray-400">जुड़े: {formatDate(b.created_at)}</p>
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${b.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                {b.is_active ? 'सक्रिय' : 'निष्क्रिय'}
              </span>
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => openEdit(b)} className="flex-1 text-xs font-bold py-2 rounded-lg border-2 border-kisan text-kisan">
                संपादित करें
              </button>
              <button
                onClick={() => toggleActive(b)}
                className={`text-xs font-bold py-2 px-3 rounded-lg border-2 ${b.is_active ? 'border-red-400 text-red-500' : 'border-kisan text-kisan'}`}
              >
                {b.is_active ? 'निष्क्रिय करें' : 'सक्रिय करें'}
              </button>
              <button onClick={() => removeBoy(b)} className="text-xs font-bold py-2 px-3 rounded-lg border-2 border-red-400 text-red-500">
                हटाएं
              </button>
            </div>
          </div>
        ))}
        {boys.length === 0 && <p className="text-gray-400 text-center py-16">अभी तक कोई डिलीवरी बॉय नहीं जोड़ा गया</p>}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-3">
          <form onSubmit={saveBoy} className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-extrabold text-lg text-gray-800">
                {editing.id ? 'डिलीवरी बॉय संपादित करें' : 'नया डिलीवरी बॉय जोड़ें'}
              </h2>
              <button type="button" onClick={() => setEditing(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="flex flex-col gap-3">
              <Field label="नाम">
                <input required className="input-field" value={editing.full_name} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} />
              </Field>
              <Field label="मोबाइल नंबर (वैकल्पिक)">
                <input
                  inputMode="numeric"
                  className="input-field"
                  value={editing.phone || ''}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                />
              </Field>
              <Field label="4 अंकों का पिन">
                <input
                  required
                  inputMode="numeric"
                  maxLength={4}
                  className="input-field font-mono tracking-widest"
                  value={editing.pin}
                  onChange={(e) => setEditing({ ...editing, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                  placeholder="1234"
                />
              </Field>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-600">
                <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
                सक्रिय (लॉगिन कर सकता है)
              </label>
            </div>

            {error && <p className="text-red-500 text-sm font-semibold mt-3">{error}</p>}

            <div className="flex gap-3 mt-5">
              <button type="button" onClick={() => setEditing(null)} className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 font-bold text-gray-600">
                रद्द करें
              </button>
              <button type="submit" disabled={saving} className="flex-1 btn-primary">
                {saving ? 'सेव हो रहा है...' : 'सेव करें'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}
