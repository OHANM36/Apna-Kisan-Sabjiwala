import { useEffect, useState } from 'react'
import { getPushState, enablePush, disablePush, syncPush } from '../utils/push'

// "ऑर्डर आते ही फ़ोन/कंप्यूटर पर नोटिफ़िकेशन" चालू-बंद करने वाला कार्ड
export default function AdminPushCard() {
  const [state, setState] = useState('checking')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    getPushState().then((s) => {
      if (!alive) return
      setState(s)
      if (s === 'on') syncPush()
    })
    return () => {
      alive = false
    }
  }, [])

  async function turnOn() {
    setBusy(true)
    setError('')
    const res = await enablePush()
    if (res.ok) setState('on')
    else if (res.reason === 'denied') setState('denied')
    else if (res.reason === 'dismissed') setError('अनुमति नहीं मिली। दोबारा "चालू करें" दबाकर "अनुमति दें" चुनें।')
    else if (res.reason === 'sw') setError('ऐप अभी तैयार नहीं है। पेज रीफ़्रेश करके दोबारा कोशिश करें।')
    else setError('चालू नहीं हो सका। थोड़ी देर बाद दोबारा कोशिश करें।')
    setBusy(false)
  }

  async function turnOff() {
    setBusy(true)
    setError('')
    await disablePush()
    setState('off')
    setBusy(false)
  }

  if (state === 'checking' || state === 'no-key' || state === 'unsupported') return null

  if (state === 'on') {
    return (
      <div className="mb-3 flex items-center justify-between gap-3 text-xs font-semibold text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
        <span>🔔 इस डिवाइस पर नए-ऑर्डर नोटिफ़िकेशन चालू हैं</span>
        <button onClick={turnOff} disabled={busy} className="text-gray-500 underline shrink-0">बंद करें</button>
      </div>
    )
  }

  const warn = 'mb-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-sm font-semibold px-3 py-2'

  if (state === 'ios-install') {
    return (
      <div className={warn}>
        📲 iPhone पर नोटिफ़िकेशन के लिए ऐप को Safari में "Share → Add to Home Screen" से होम स्क्रीन पर जोड़ें, फिर वहीं से खोलें।
      </div>
    )
  }

  if (state === 'denied') {
    return (
      <div className={warn}>
        🔕 नोटिफ़िकेशन की अनुमति बंद है। ब्राउज़र/फ़ोन की साइट-सेटिंग में इस साइट के लिए "Notifications" को Allow करें, फिर पेज रीफ़्रेश करें।
      </div>
    )
  }

  return (
    <div className={warn}>
      <p>📲 ऐप बंद होने पर भी ऑर्डर आते ही इस डिवाइस पर नोटिफ़िकेशन पाएँ</p>
      <button
        onClick={turnOn}
        disabled={busy}
        className="mt-2 bg-kisan-dark text-white text-sm font-bold rounded-lg px-4 py-2 disabled:opacity-60"
      >
        {busy ? 'चालू हो रहा है…' : 'नोटिफ़िकेशन चालू करें'}
      </button>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  )
}
