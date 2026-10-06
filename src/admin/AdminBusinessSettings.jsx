import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAdminAuth } from '../context/AdminAuthContext'
import { useSettings } from '../context/SettingsContext'
import { SettingsPageSkeleton } from '../components/Skeleton'

// असली कारण पहचानने के लिए: Supabase की त्रुटि को साफ़ हिंदी संदेश में बदलें
function saveErrorText(err) {
  const m = String(err?.message || '')
  const code = String(err?.code || '')
  if (/NOT_ALLOWED/.test(m)) return 'यह बदलाव सिर्फ़ मालिक (owner) कर सकता है।'
  if (code === '42501' || /row-level security|permission denied/i.test(m)) return 'अनुमति नहीं है — सिर्फ़ मालिक (owner) खाते से लॉगिन करके सेव करें।'
  if (code === 'PGRST301' || /JWT|expired/i.test(m)) return 'लॉगिन की अवधि खत्म हो गई। दोबारा लॉगिन करें।'
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'इंटरनेट की दिक्कत है। जाँचकर दोबारा कोशिश करें।'
  return 'सेव नहीं हो सका' + (m ? ` (${m}${code ? ' · ' + code : ''})` : '') + '।'
}

// सिर्फ़ अंक रखें; 10 अंक हों तो आगे 91 जोड़ें (देश-कोड सहित, बिना +)
function normalizePhone(raw) {
  const d = String(raw || '').replace(/\D/g, '')
  if (d.length === 10) return '91' + d
  return d
}

// दिखाने के लिए: 91XXXXXXXXXX → +91 XXXXX XXXXX
function prettyPhone(p) {
  const d = String(p || '').replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`
  return d ? `+${d}` : ''
}

/**
 * दुकान/मालिक का WhatsApp नंबर — WhatsApp ऑर्डर लिंक और "कॉल" बटन में यही नंबर इस्तेमाल होता है।
 * बदलाव सिर्फ़ मालिक (owner) कर सकता है: यह नियम डेटाबेस (RLS) में लागू है।
 */
export default function AdminBusinessSettings() {
  const { isOwner } = useAdminAuth()
  const { reloadSettings } = useSettings()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saved, setSaved] = useState('')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null) // { ok, text }

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const { data, error } = await supabase
        .from('delivery_settings')
        .select('business_whatsapp')
        .eq('id', 1)
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('NO_SETTINGS')
      setSaved(data.business_whatsapp || '')
      setInput(data.business_whatsapp || '')
    } catch (e) {
      console.error(e)
      setLoadError('सेटिंग लोड नहीं हो सकी। इंटरनेट जाँचकर दोबारा कोशिश करें।')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function save(e) {
    e.preventDefault()
    if (busy) return
    const phone = normalizePhone(input)
    if (!/^\d{11,15}$/.test(phone) || (phone.startsWith('91') && phone.length !== 12)) {
      setMsg({ ok: false, text: 'सही नंबर डालें — 10 अंक का मोबाइल नंबर, या देश-कोड सहित (जैसे 919876543210)।' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const { data, error } = await supabase
        .from('delivery_settings')
        .update({ business_whatsapp: phone })
        .eq('id', 1)
        .select('business_whatsapp')
      if (error) throw error
      // RLS अनुमति न दे तो error नहीं आता, 0 पंक्तियाँ बदलती हैं — इसे साफ़ पकड़ें
      if (!data || data.length !== 1) throw new Error('NOT_ALLOWED')
      setSaved(data[0].business_whatsapp || '')
      setInput(data[0].business_whatsapp || '')
      try { await reloadSettings() } catch (re) { console.warn('reloadSettings', re) }
      setMsg({ ok: true, text: `✅ नंबर सेव हो गया: ${prettyPhone(data[0].business_whatsapp)}` })
    } catch (err) {
      console.error(err)
      setMsg({ ok: false, text: saveErrorText(err) })
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <SettingsPageSkeleton rows={1} />

  return (
    <div className="max-w-xl">
      <h1 className="font-extrabold text-xl text-gray-800 mb-1">दुकान की जानकारी</h1>
      <p className="text-sm text-gray-500 mb-5">ग्राहकों को दिखने वाला और ऑर्डर पाने का नंबर यहाँ बदलें।</p>

      {loadError ? (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm font-semibold rounded-xl px-4 py-3">
          ⚠️ {loadError}
          <button onClick={load} className="block mt-2 underline font-bold">दोबारा कोशिश करें</button>
        </div>
      ) : (
        <form onSubmit={save} className="card p-4 mb-4">
          <label htmlFor="biz-wa" className="block font-bold text-gray-800 text-sm mb-1">📱 मालिक / दुकान का WhatsApp नंबर</label>
          <p className="text-xs text-gray-500 mb-3">
            नए ऑर्डर इसी नंबर पर WhatsApp से आते हैं, और ग्राहक ऐप का कॉल बटन भी इसी नंबर पर लगता है।
            {saved && <> अभी: <b>{prettyPhone(saved)}</b>।</>}
          </p>
          <div className="flex gap-2">
            <input
              id="biz-wa"
              className="input-field flex-1"
              inputMode="numeric"
              autoComplete="off"
              placeholder="जैसे 9876543210"
              value={input}
              onChange={(e) => setInput(e.target.value.replace(/[^\d+\s-]/g, '').slice(0, 20))}
              disabled={busy || !isOwner}
            />
            <button type="submit" className="btn-primary px-5" disabled={busy || !isOwner}>
              {busy ? '...' : 'सेव'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">10 अंक डालेंगे तो आगे 91 अपने-आप जुड़ जाएगा।</p>
          {!isOwner && <p className="text-xs text-orange-600 font-semibold mt-3">इसे सिर्फ़ मालिक (owner) बदल सकता है।</p>}
        </form>
      )}

      {msg && (
        <div
          role="status"
          className={`text-sm font-semibold rounded-xl px-4 py-3 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'}`}
        >
          {msg.text}
        </div>
      )}
    </div>
  )
}
