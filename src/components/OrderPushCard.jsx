import { useEffect, useState } from 'react'
import { useLanguage } from '../context/LanguageContext'
import { getCustomerPushState, enableCustomerPush, disableCustomerPush, syncCustomerPush } from '../utils/customerPush'

// ऑर्डर-पेज पर: "स्थिति बदलते ही फ़ोन पर सूचना पाएँ" — बटन दबाने पर ही अनुमति माँगी जाती है।
export default function OrderPushCard() {
  const { t } = useLanguage()
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      await syncCustomerPush() // पहले से चालू हो तो इस ऑर्डर को भी जोड़ दे
      const s = await getCustomerPushState()
      if (alive) setState(s)
    })()
    return () => { alive = false }
  }, [])

  if (!state || state === 'no-key' || state === 'unsupported') return null

  async function turnOn() {
    setBusy(true)
    setMsg('')
    const r = await enableCustomerPush()
    setBusy(false)
    if (r.ok) setState('on')
    else if (r.reason === 'denied') setState('denied')
    else if (r.reason !== 'dismissed') setMsg(t('push_err'))
  }

  async function turnOff() {
    setBusy(true)
    await disableCustomerPush()
    setBusy(false)
    setState('off')
  }

  if (state === 'on') {
    return (
      <div className="card p-3 mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-kisan">🔔 {t('push_on')}</p>
        <button onClick={turnOff} disabled={busy} className="text-xs font-bold text-gray-400 underline">{t('push_turn_off')}</button>
      </div>
    )
  }

  if (state === 'denied' || state === 'ios-install') {
    return (
      <div className="card p-3 mb-4">
        <p className="text-xs text-gray-500">🔕 {t(state === 'denied' ? 'push_denied' : 'push_ios')}</p>
      </div>
    )
  }

  return (
    <div className="card p-4 mb-4 border-2 border-kisan/30">
      <p className="text-sm font-bold text-gray-700">🔔 {t('push_title')}</p>
      <p className="text-xs text-gray-500 mt-1">{t('push_desc')}</p>
      {msg && <p className="text-xs font-semibold text-orange-600 mt-2">{msg}</p>}
      <button onClick={turnOn} disabled={busy} className="btn-primary w-full mt-3">
        {busy ? t('checkout_processing') : t('push_turn_on')}
      </button>
    </div>
  )
}
