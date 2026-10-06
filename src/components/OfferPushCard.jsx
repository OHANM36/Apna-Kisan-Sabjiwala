import { useEffect, useState } from 'react'
import { useLanguage } from '../context/LanguageContext'
import { getOfferPushState, enableOfferPush, syncOfferPush, offerCardDismissed, dismissOfferCard } from '../utils/offerPush'

// होम पेज पर: "नए ऑफर की सूचना पाएँ" — बटन दबाने पर ही अनुमति माँगी जाती है। चालू होने के बाद कुछ नहीं दिखता।
export default function OfferPushCard() {
  const { t } = useLanguage()
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const s = await getOfferPushState()
      if (s === 'on') syncOfferPush()
      if (alive) setState(offerCardDismissed() && s === 'off' ? 'hidden' : s)
    })()
    return () => { alive = false }
  }, [])

  if (state !== 'off') return null

  async function turnOn() {
    setBusy(true)
    setMsg('')
    const r = await enableOfferPush()
    setBusy(false)
    if (r.ok) setState('on')
    else if (r.reason === 'denied') setState('denied')
    else if (r.reason !== 'dismissed') setMsg(t('push_err'))
  }

  return (
    <div className="px-3 pt-3">
      <div className="card p-3 border border-kisan-orange/40">
        <p className="text-sm font-bold text-gray-700">🎁 {t('offer_push_title')}</p>
        <p className="text-xs text-gray-500 mt-0.5">{t('offer_push_desc')}</p>
        {msg && <p className="text-xs font-semibold text-orange-600 mt-2">{msg}</p>}
        <div className="flex items-center gap-3 mt-2">
          <button onClick={turnOn} disabled={busy} className="btn-primary py-2 px-4 text-xs">
            {busy ? t('checkout_processing') : t('offer_push_turn_on')}
          </button>
          <button
            onClick={() => { dismissOfferCard(); setState('hidden') }}
            className="text-xs font-bold text-gray-400 underline"
          >
            {t('offer_push_later')}
          </button>
        </div>
      </div>
    </div>
  )
}
