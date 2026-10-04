import { useState } from 'react'
import { formatRupee } from '../utils/format'
import { CANCEL_REASONS, OTHER_REASON, buildCancelReason, isPaidOnline } from '../utils/orderFlow'
import { useLanguage } from '../context/LanguageContext'
import { AdminBottomSheet } from './AdminUI'

// ऑर्डर रद्द करने की पुष्टि: कारण चुनना ज़रूरी; "अन्य" पर लिखना ज़रूरी।
// onConfirm(reason) async है; गड़बड़ी होने पर parent error लौटाता है/दिखाता है और शीट खुली रहती है।
// अब यह मोबाइल पर नीचे से खुलने वाली शीट है (लॉजिक पहले जैसा).
const T = {
  title: { hi: 'ऑर्डर रद्द करें?', en: 'Cancel this order?' },
  order: { hi: 'ऑर्डर', en: 'Order' },
  customer: { hi: 'ग्राहक', en: 'Customer' },
  amount: { hi: 'राशि', en: 'Amount' },
  paidTitle: { hi: 'इस ऑर्डर का भुगतान ऑनलाइन हो चुका है।', en: 'This order was already paid online.' },
  paidBody: {
    hi: 'रद्द करने पर भुगतान की स्थिति "सफल" ही रहेगी। पैसा अपने-आप वापस नहीं होता — रिफंड आपको अलग से करना होगा।',
    en: 'Cancelling keeps the payment status as "successful". The money is not returned automatically — you must refund it separately.',
  },
  reason: { hi: 'रद्द करने का कारण:', en: 'Reason for cancelling:' },
  other: { hi: 'कारण लिखें...', en: 'Write the reason...' },
  back: { hi: 'वापस जाएँ', en: 'Go back' },
  confirm: { hi: 'ऑर्डर रद्द करें', en: 'Cancel order' },
  busy: { hi: 'रद्द हो रहा है...', en: 'Cancelling...' },
  close: { hi: 'बंद करें', en: 'Close' },
}

export default function CancelOrderModal({ order, busy, error, onClose, onConfirm }) {
  const { language } = useLanguage()
  const lang = language === 'en' ? 'en' : 'hi'
  const t = (k) => T[k][lang]
  const [selected, setSelected] = useState(null)
  const [other, setOther] = useState('')
  const reason = buildCancelReason(selected, other)
  const paid = isPaidOnline(order)

  return (
    <AdminBottomSheet
      title={t('title')}
      onClose={onClose}
      dismissible={!busy}
      closeLabel={t('close')}
      labelId="cancel-title"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="admin-btn admin-btn-outline">{t('back')}</button>
          <button type="button" onClick={() => onConfirm(reason)} disabled={busy || !reason} className="admin-btn admin-btn-danger">
            {busy ? t('busy') : t('confirm')}
          </button>
        </>
      }
    >
      <div className="admin-note" style={{ background: '#f6f5f0' }}>
        <p>{t('order')}: <b>{order.order_number}</b></p>
        <p>{t('customer')}: <b>{order.customer_name}</b></p>
        <p>{t('amount')}: <b>{formatRupee(order.total_amount)}</b></p>
      </div>

      {paid && (
        <div className="admin-note amber mt-3">
          <p className="font-bold">{t('paidTitle')}</p>
          <p className="text-xs mt-1">{t('paidBody')}</p>
        </div>
      )}

      <fieldset className="mt-4">
        <legend className="text-sm font-bold text-gray-700 mb-2">{t('reason')}</legend>
        {[...CANCEL_REASONS, OTHER_REASON].map((r) => (
          <label key={r} className={`admin-radio ${selected === r ? 'is-on' : ''}`}>
            <input type="radio" name="cancel-reason" value={r} checked={selected === r} onChange={() => setSelected(r)} disabled={busy} />
            {r}
          </label>
        ))}
        {selected === OTHER_REASON && (
          <input
            autoFocus
            value={other}
            onChange={(e) => setOther(e.target.value)}
            maxLength={450}
            placeholder={t('other')}
            className="admin-input mt-2"
            disabled={busy}
          />
        )}
      </fieldset>

      {error && <p className="mt-3 text-sm font-semibold text-red-600" role="alert">{error}</p>}
    </AdminBottomSheet>
  )
}
