import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { formatRupee } from '../utils/format'
import { ListPageSkeleton } from '../components/Skeleton'

const EMPTY_FORM = {
  id: null,
  title: '',
  description: '',
  coupon_code: '',
  discount_type: 'percent',
  discount_value: '',
  min_order_value: '',
  valid_from: '',
  valid_until: '',
  max_uses_per_customer: '',
  max_total_uses: '',
  is_active: true,
}

const CODE_RE = /^[A-Z0-9]{3,20}$/

// तारीख़ हमेशा भारतीय समय (IST) में — दिन की शुरुआत / दिन का अंत
const istDate = (ts) => (ts ? new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : '')
const showDate = (ts) =>
  ts ? new Date(ts).toLocaleDateString('hi-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : ''
const startOfDayIST = (d) => `${d}T00:00:00+05:30`
const endOfDayIST = (d) => `${d}T23:59:59+05:30`

function couponStatus(o, used) {
  const now = Date.now()
  if (!o.is_active) return { label: 'बंद', cls: 'bg-gray-100 text-gray-600' }
  if (o.valid_until && new Date(o.valid_until).getTime() < now) return { label: 'समाप्त', cls: 'bg-red-100 text-red-600' }
  if (o.valid_from && new Date(o.valid_from).getTime() > now) return { label: 'जल्द शुरू होगा', cls: 'bg-blue-100 text-blue-700' }
  if (o.max_total_uses != null && used >= o.max_total_uses) return { label: 'सीमा पूरी', cls: 'bg-orange-100 text-orange-700' }
  return { label: 'चालू', cls: 'bg-green-100 text-green-700' }
}

const discountLabel = (o) =>
  o.discount_type === 'percent' ? `${Number(o.discount_value)}% छूट` : `${formatRupee(o.discount_value)} की छूट`

function intOrNull(v) {
  const s = String(v ?? '').trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isInteger(n) && n >= 1 ? n : NaN
}

export default function AdminOffers() {
  const [offers, setOffers] = useState([])
  const [usage, setUsage] = useState({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [pageError, setPageError] = useState('')
  const [copied, setCopied] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setPageError('')
    const [offRes, useRes] = await Promise.all([
      supabase.from('offers').select('*').order('created_at', { ascending: false }),
      supabase.from('coupon_redemptions').select('offer_id'),
    ])
    if (offRes.error) setPageError('कूपन लोड नहीं हो सके: ' + offRes.error.message)
    setOffers(offRes.data || [])
    const counts = {}
    for (const r of useRes.data || []) counts[r.offer_id] = (counts[r.offer_id] || 0) + 1
    setUsage(counts)
    setLoading(false)
  }

  function openNew() {
    setForm(EMPTY_FORM)
    setFormError('')
    setShowForm(true)
  }

  function openEdit(o) {
    setForm({
      id: o.id,
      title: o.title || '',
      description: o.description || '',
      coupon_code: o.coupon_code || '',
      discount_type: o.discount_type,
      discount_value: String(o.discount_value ?? ''),
      min_order_value: Number(o.min_order_value) > 0 ? String(o.min_order_value) : '',
      valid_from: istDate(o.valid_from),
      valid_until: istDate(o.valid_until),
      max_uses_per_customer: o.max_uses_per_customer != null ? String(o.max_uses_per_customer) : '',
      max_total_uses: o.max_total_uses != null ? String(o.max_total_uses) : '',
      is_active: o.is_active,
    })
    setFormError('')
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setFormError('')

    const code = form.coupon_code.trim().toUpperCase()
    const value = Number(form.discount_value)
    const minOrder = form.min_order_value === '' ? 0 : Number(form.min_order_value)
    const perCust = intOrNull(form.max_uses_per_customer)
    const total = intOrNull(form.max_total_uses)

    if (!form.title.trim()) return setFormError('ऑफर का नाम लिखें।')
    if (!CODE_RE.test(code)) return setFormError('कूपन कोड 3 से 20 अक्षरों का हो — सिर्फ़ अंग्रेज़ी अक्षर और अंक (जैसे WELCOME10)।')
    if (offers.some((o) => o.id !== form.id && (o.coupon_code || '').toUpperCase() === code)) {
      return setFormError('यह कूपन कोड पहले से मौजूद है। कोई दूसरा कोड चुनें।')
    }
    if (!Number.isFinite(value) || value <= 0) return setFormError('छूट की राशि 0 से ज़्यादा होनी चाहिए।')
    if (form.discount_type === 'percent' && value > 100) return setFormError('प्रतिशत छूट 100 से ज़्यादा नहीं हो सकती।')
    if (!Number.isFinite(minOrder) || minOrder < 0) return setFormError('न्यूनतम ऑर्डर राशि सही नहीं है।')
    if (Number.isNaN(perCust) || Number.isNaN(total)) return setFormError('उपयोग की सीमा 1 या उससे बड़ी पूरी संख्या हो, या खाली छोड़ें।')
    if (form.valid_from && form.valid_until && form.valid_until < form.valid_from) {
      return setFormError('खत्म होने की तारीख़ शुरू होने की तारीख़ से पहले नहीं हो सकती।')
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      coupon_code: code,
      discount_type: form.discount_type,
      discount_value: value,
      min_order_value: minOrder,
      valid_from: form.valid_from ? startOfDayIST(form.valid_from) : null,
      valid_until: form.valid_until ? endOfDayIST(form.valid_until) : null,
      max_uses_per_customer: perCust,
      max_total_uses: total,
      is_active: form.is_active,
    }

    setSaving(true)
    const { error } = form.id
      ? await supabase.from('offers').update(payload).eq('id', form.id)
      : await supabase.from('offers').insert(payload)
    setSaving(false)

    if (error) {
      setFormError(error.code === '23505' ? 'यह कूपन कोड पहले से मौजूद है।' : 'सेव नहीं हो सका: ' + error.message)
      return
    }
    setShowForm(false)
    load()
  }

  async function toggleActive(o) {
    const { error } = await supabase.from('offers').update({ is_active: !o.is_active }).eq('id', o.id)
    if (error) {
      setPageError('स्थिति नहीं बदल सकी: ' + error.message)
      return
    }
    load()
  }

  async function handleDelete(o) {
    const used = usage[o.id] || 0
    const warn = used > 0
      ? `"${o.title}" को ${used} बार इस्तेमाल किया जा चुका है। हटाने पर इस्तेमाल का रिकॉर्ड भी मिट जाएगा। बेहतर है कि इसे सिर्फ़ "बंद" कर दें।\n\nफिर भी हटाएँ?`
      : `क्या आप वाकई "${o.title}" कूपन हटाना चाहते हैं?`
    if (!confirm(warn)) return
    const { error } = await supabase.from('offers').delete().eq('id', o.id)
    if (error) {
      setPageError('हटाया नहीं जा सका: ' + error.message)
      return
    }
    load()
  }

  async function copyCode(code) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(code)
      setTimeout(() => setCopied(''), 1500)
    } catch {
      /* क्लिपबोर्ड उपलब्ध नहीं — कोई बात नहीं */
    }
  }

  // फ़ॉर्म में छोटा उदाहरण: ₹500 के सामान पर कितनी छूट मिलेगी
  const preview = useMemo(() => {
    const v = Number(form.discount_value)
    if (!Number.isFinite(v) || v <= 0) return ''
    const min = Number(form.min_order_value) || 0
    const base = Math.max(500, min)
    const raw = form.discount_type === 'percent' ? (base * v) / 100 : v
    const disc = Math.round(Math.min(raw, base) * 100) / 100
    return `उदाहरण: ${formatRupee(base)} के सामान पर ${formatRupee(disc)} की छूट मिलेगी।`
  }, [form.discount_type, form.discount_value, form.min_order_value])

  if (loading) return <ListPageSkeleton withButton count={3} />

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-3">
        <h1 className="font-extrabold text-xl text-gray-800">कूपन / ऑफर</h1>
        <button onClick={openNew} className="btn-primary py-2 px-4 text-sm">+ नया कूपन</button>
      </div>

      {pageError && <p className="bg-red-50 text-red-600 text-sm font-semibold rounded-xl px-4 py-3 mb-4">{pageError}</p>}

      <p className="text-xs text-gray-500 mb-4">
        होम पेज के ऊपर सिर्फ़ एक चालू ऑफर का बैनर दिखता है। कूपन चेकआउट पर ग्राहक कोड डालकर लगाते हैं।
      </p>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {offers.map((o) => {
          const used = usage[o.id] || 0
          const st = couponStatus(o, used)
          return (
            <div key={o.id} className="bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-gray-800 truncate">{o.title}</p>
                  {o.description && <p className="text-xs text-gray-500 mt-0.5">{o.description}</p>}
                </div>
                <span className={`text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono font-extrabold tracking-wider bg-gray-100 rounded-lg px-3 py-1.5 text-gray-800">
                  {o.coupon_code || '—'}
                </span>
                {o.coupon_code && (
                  <button onClick={() => copyCode(o.coupon_code)} className="text-xs font-bold text-blue-600">
                    {copied === o.coupon_code ? 'कॉपी हुआ ✓' : 'कॉपी'}
                  </button>
                )}
              </div>

              <dl className="text-xs text-gray-600 grid grid-cols-2 gap-x-3 gap-y-1">
                <dt className="text-gray-400">छूट</dt>
                <dd className="font-semibold">{discountLabel(o)}</dd>
                <dt className="text-gray-400">न्यूनतम ऑर्डर</dt>
                <dd className="font-semibold">{Number(o.min_order_value) > 0 ? formatRupee(o.min_order_value) : 'कोई नहीं'}</dd>
                <dt className="text-gray-400">वैधता</dt>
                <dd className="font-semibold">
                  {o.valid_until ? `${showDate(o.valid_until)} तक` : 'कोई अंतिम तारीख़ नहीं'}
                </dd>
                <dt className="text-gray-400">इस्तेमाल</dt>
                <dd className="font-semibold">
                  {used}
                  {o.max_total_uses != null ? ` / ${o.max_total_uses}` : ''} बार
                  {o.max_uses_per_customer != null ? ` • हर ग्राहक ${o.max_uses_per_customer} बार` : ''}
                </dd>
              </dl>

              <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
                <button onClick={() => toggleActive(o)} className="text-xs font-bold text-kisan">
                  {o.is_active ? 'बंद करें' : 'चालू करें'}
                </button>
                <button onClick={() => openEdit(o)} className="text-blue-600 font-semibold text-xs">बदलें</button>
                <button onClick={() => handleDelete(o)} className="text-red-500 font-semibold text-xs ml-auto">हटाएं</button>
              </div>
            </div>
          )
        })}
        {offers.length === 0 && (
          <div className="md:col-span-2 xl:col-span-3 bg-white rounded-2xl shadow-sm text-center text-gray-400 py-10">
            अभी तक कोई कूपन नहीं — "+ नया कूपन" दबाएँ
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="font-bold text-lg text-gray-800 mb-4">{form.id ? 'कूपन बदलें' : 'नया कूपन'}</h2>
            <form onSubmit={handleSave} className="flex flex-col gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">ऑफर का नाम</label>
                <input required className="input-field" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="जैसे: पहले ऑर्डर पर छूट" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">विवरण (वैकल्पिक)</label>
                <input className="input-field" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="जैसे: ₹299 से ऊपर के ऑर्डर पर" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">कूपन कोड (अंग्रेज़ी अक्षर/अंक)</label>
                <input
                  required
                  className="input-field font-mono uppercase"
                  value={form.coupon_code}
                  onChange={(e) => setForm({ ...form, coupon_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                  maxLength={20}
                  placeholder="WELCOME10"
                  autoCapitalize="characters"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">छूट का प्रकार</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['percent', 'प्रतिशत (%)'],
                    ['flat', 'सीधे ₹ में'],
                  ].map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setForm({ ...form, discount_type: val })}
                      className={`py-2.5 rounded-xl text-sm font-bold border ${
                        form.discount_type === val ? 'bg-kisan text-white border-kisan' : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1">
                    {form.discount_type === 'percent' ? 'छूट (%)' : 'छूट (₹)'}
                  </label>
                  <input required inputMode="decimal" className="input-field" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} placeholder={form.discount_type === 'percent' ? '10' : '50'} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1">न्यूनतम ऑर्डर (₹)</label>
                  <input inputMode="decimal" className="input-field" value={form.min_order_value} onChange={(e) => setForm({ ...form, min_order_value: e.target.value })} placeholder="खाली = कोई नहीं" />
                </div>
              </div>
              {preview && <p className="text-xs text-kisan font-semibold -mt-1">{preview}</p>}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1">शुरू (वैकल्पिक)</label>
                  <input type="date" className="input-field" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1">आख़िरी तारीख़</label>
                  <input type="date" className="input-field" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1">हर ग्राहक कितनी बार</label>
                  <input inputMode="numeric" className="input-field" value={form.max_uses_per_customer} onChange={(e) => setForm({ ...form, max_uses_per_customer: e.target.value })} placeholder="खाली = असीमित" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1">कुल कितनी बार</label>
                  <input inputMode="numeric" className="input-field" value={form.max_total_uses} onChange={(e) => setForm({ ...form, max_total_uses: e.target.value })} placeholder="खाली = असीमित" />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="font-semibold text-gray-700 text-sm">चालू रखें</label>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
                  className={`w-12 h-7 rounded-full transition-colors relative ${form.is_active ? 'bg-kisan' : 'bg-gray-300'}`}
                  aria-pressed={form.is_active}
                >
                  <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {formError && <p className="text-sm font-semibold text-red-500">{formError}</p>}

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
