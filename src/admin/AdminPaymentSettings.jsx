import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAdminAuth } from '../context/AdminAuthContext'
import { useSettings } from '../context/SettingsContext'
import Loading from '../components/Loading'
import { formatRupee } from '../utils/format'

const MAX_COD_LIMIT = 100000

/**
 * भुगतान विकल्प — कैश ऑन डिलीवरी (COD) चालू/बंद + वैकल्पिक अधिकतम ऑर्डर-राशि।
 * बदलाव सिर्फ़ मालिक (owner) कर सकता है: यह नियम डेटाबेस (RLS) में लागू है, सिर्फ़ इस पेज की रोक पर निर्भर नहीं।
 * हर बदलाव pricing_audit_log में (किसने, कब) दर्ज होता है।
 */
export default function AdminPaymentSettings() {
  const { isOwner } = useAdminAuth()
  const { reloadSettings } = useSettings()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [codEnabled, setCodEnabled] = useState(false)
  const [maxInput, setMaxInput] = useState('')
  const [savedMax, setSavedMax] = useState(null)
  const [openCod, setOpenCod] = useState(null) // डिलीवरी बाकी COD ऑर्डर (सिर्फ़ जानकारी के लिए)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null) // { ok, text }

  const applyRow = useCallback((row) => {
    setCodEnabled(row.cod_enabled === true)
    setSavedMax(row.cod_max_order_value == null ? null : Number(row.cod_max_order_value))
    setMaxInput(row.cod_max_order_value == null ? '' : String(Number(row.cod_max_order_value)))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const { data, error } = await supabase
        .from('delivery_settings')
        .select('cod_enabled, cod_max_order_value')
        .eq('id', 1)
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('NO_SETTINGS')
      applyRow(data)

      // जानकारी: कितने COD ऑर्डर में कैश लेना बाकी है (गिनती न मिले तो पेज फिर भी चलता है)
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('payment_method', 'COD')
        .not('order_status', 'in', '("डिलीवरी पूरी हुई","रद्द")')
      setOpenCod(typeof count === 'number' ? count : null)
    } catch (e) {
      console.error(e)
      setLoadError(
        /cod_enabled|column/i.test(String(e?.message))
          ? 'COD की सेटिंग डेटाबेस में नहीं मिली। पहले Supabase SQL Editor में supabase/cod_payment.sql चलाएँ।'
          : 'सेटिंग लोड नहीं हो सकी। इंटरनेट जाँचकर दोबारा कोशिश करें।'
      )
    } finally {
      setLoading(false)
    }
  }, [applyRow])

  useEffect(() => {
    load()
  }, [load])

  async function save(patch, okText) {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      const { data, error } = await supabase
        .from('delivery_settings')
        .update(patch)
        .eq('id', 1)
        .select('cod_enabled, cod_max_order_value')
      if (error) throw error
      // RLS अनुमति न दे तो error नहीं आता, 0 पंक्तियाँ बदलती हैं — इसे साफ़ पकड़ें
      if (!data || data.length !== 1) throw new Error('NOT_ALLOWED')
      applyRow(data[0])
      await reloadSettings() // ग्राहक-ऐप का संदर्भ भी ताज़ा
      setMsg({ ok: true, text: okText })
    } catch (e) {
      console.error(e)
      setMsg({
        ok: false,
        text: /NOT_ALLOWED/.test(String(e?.message))
          ? 'यह बदलाव सिर्फ़ मालिक (owner) कर सकता है।'
          : 'सेव नहीं हो सका। इंटरनेट जाँचकर दोबारा कोशिश करें।',
      })
      await load() // स्क्रीन को सर्वर की असली स्थिति से मिलाएँ
    } finally {
      setBusy(false)
    }
  }

  function toggleCod() {
    const next = !codEnabled
    save({ cod_enabled: next }, next ? '✅ कैश ऑन डिलीवरी चालू हो गया' : '⛔ कैश ऑन डिलीवरी बंद हो गया')
  }

  function saveMax(e) {
    e.preventDefault()
    const raw = maxInput.trim()
    if (raw === '') {
      save({ cod_max_order_value: null }, '✅ COD की अधिकतम राशि की सीमा हटा दी गई')
      return
    }
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0 || n > MAX_COD_LIMIT) {
      setMsg({ ok: false, text: `सही राशि डालें (₹1 से ₹${MAX_COD_LIMIT.toLocaleString('en-IN')} के बीच), या सीमा हटाने के लिए खाली छोड़ें।` })
      return
    }
    save({ cod_max_order_value: Math.round(n * 100) / 100 }, `✅ COD अब ${formatRupee(n)} तक के ऑर्डर पर चालू रहेगा`)
  }

  if (loading) return <Loading />

  return (
    <div className="max-w-xl">
      <h1 className="font-extrabold text-xl text-gray-800 mb-1">भुगतान विकल्प</h1>
      <p className="text-sm text-gray-500 mb-5">ग्राहकों को चेकआउट पर कौन-से भुगतान के तरीके दिखें, यहाँ तय करें।</p>

      {loadError ? (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm font-semibold rounded-xl px-4 py-3">
          ⚠️ {loadError}
          <button onClick={load} className="block mt-2 underline font-bold">दोबारा कोशिश करें</button>
        </div>
      ) : (
        <>
          <div className="card p-4 mb-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-bold text-gray-800">💵 कैश ऑन डिलीवरी (COD)</p>
                <p className={`text-xs font-bold mt-0.5 ${codEnabled ? 'text-kisan' : 'text-gray-400'}`}>
                  {codEnabled ? 'चालू — ग्राहक चेकआउट पर COD चुन सकते हैं' : 'बंद — सिर्फ़ ऑनलाइन भुगतान दिखता है'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={codEnabled}
                aria-label="कैश ऑन डिलीवरी चालू/बंद"
                onClick={toggleCod}
                disabled={busy || !isOwner}
                className={`relative shrink-0 w-14 h-8 rounded-full transition-colors disabled:opacity-50 ${codEnabled ? 'bg-kisan' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-all ${codEnabled ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
            {!isOwner && <p className="text-xs text-orange-600 font-semibold mt-3">इसे सिर्फ़ मालिक (owner) बदल सकता है।</p>}
            {openCod != null && openCod > 0 && (
              <p className="text-xs text-gray-500 mt-3">
                अभी {openCod} COD ऑर्डर की डिलीवरी बाकी है। COD बंद करने पर ये ऑर्डर वैसे ही चलते रहेंगे — सिर्फ़ नए COD ऑर्डर रुकेंगे।
              </p>
            )}
          </div>

          <form onSubmit={saveMax} className="card p-4 mb-4">
            <label htmlFor="cod-max" className="block font-bold text-gray-800 text-sm mb-1">COD की अधिकतम ऑर्डर-राशि (वैकल्पिक)</label>
            <p className="text-xs text-gray-500 mb-3">
              इससे बड़े ऑर्डर पर COD नहीं दिखेगा (ग्राहक ऑनलाइन भुगतान कर सकता है)। खाली छोड़ने पर कोई सीमा नहीं।
              {savedMax != null && <> अभी सीमा: <b>{formatRupee(savedMax)}</b>।</>}
            </p>
            <div className="flex gap-2">
              <input
                id="cod-max"
                className="input-field flex-1"
                inputMode="decimal"
                placeholder="जैसे 1500"
                value={maxInput}
                onChange={(e) => setMaxInput(e.target.value.replace(/[^\d.]/g, '').slice(0, 9))}
                disabled={busy || !isOwner}
              />
              <button type="submit" className="btn-primary px-5" disabled={busy || !isOwner}>
                {busy ? '...' : 'सेव'}
              </button>
            </div>
          </form>

          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl px-4 py-3 mb-4 leading-relaxed">
            <p className="font-bold mb-1">COD कैसे काम करता है</p>
            <ul className="list-disc pl-4 flex flex-col gap-0.5">
              <li>COD ऑर्डर बनते ही आपके पास आता है (भुगतान "लंबित") — पहले की तरह स्वीकार करें और डिलीवरी बॉय को दें।</li>
              <li>डिलीवरी बॉय की सूची में "कैश लें ₹…" दिखता है।</li>
              <li>डिलीवरी पूरी होते ही भुगतान अपने-आप "सफल" दर्ज होता है और रिपोर्ट की बिक्री में जुड़ता है।</li>
              <li>बिना भुगतान वाले ऑनलाइन ऑर्डर की तरह COD ऑर्डर अपने-आप रद्द नहीं होते।</li>
              <li>सुरक्षा: एक IP से एक घंटे में 10 से ज़्यादा COD ऑर्डर नहीं बन सकते।</li>
            </ul>
          </div>
        </>
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
