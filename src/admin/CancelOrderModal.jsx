import { useState } from 'react'
import { formatRupee } from '../utils/format'
import { CANCEL_REASONS, OTHER_REASON, buildCancelReason, isPaidOnline } from '../utils/orderFlow'

// ऑर्डर रद्द करने की पुष्टि: कारण चुनना ज़रूरी; "अन्य" पर लिखना ज़रूरी।
// onConfirm(reason) async है; गड़बड़ी होने पर parent error लौटाता है/दिखाता है और मॉडल खुला रहता है।
export default function CancelOrderModal({ order, busy, error, onClose, onConfirm }) {
  const [selected, setSelected] = useState(null)
  const [other, setOther] = useState('')
  const reason = buildCancelReason(selected, other)
  const paid = isPaidOnline(order)

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-3" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto p-5">
        <h2 id="cancel-title" className="font-extrabold text-lg text-gray-800">ऑर्डर रद्द करें?</h2>

        <div className="mt-3 text-sm text-gray-700 bg-gray-50 rounded-xl p-3 space-y-0.5">
          <p>ऑर्डर: <span className="font-bold">{order.order_number}</span></p>
          <p>ग्राहक: <span className="font-bold">{order.customer_name}</span></p>
          <p>राशि: <span className="font-bold">{formatRupee(order.total_amount)}</span></p>
        </div>

        {paid && (
          <div className="mt-3 text-sm bg-amber-50 border border-amber-300 text-amber-900 rounded-xl p-3">
            <p className="font-bold">इस ऑर्डर का भुगतान ऑनलाइन हो चुका है।</p>
            <p className="text-xs mt-1">रद्द करने पर भुगतान की स्थिति "सफल" ही रहेगी। पैसा अपने-आप वापस नहीं होता — रिफंड आपको अलग से करना होगा।</p>
          </div>
        )}

        <fieldset className="mt-4">
          <legend className="text-sm font-bold text-gray-700 mb-2">रद्द करने का कारण:</legend>
          <div className="flex flex-col gap-2">
            {[...CANCEL_REASONS, OTHER_REASON].map((r) => (
              <label key={r} className={`flex items-center gap-3 border-2 rounded-xl px-3 py-2.5 text-sm cursor-pointer ${selected === r ? 'border-gray-800 bg-gray-50 font-bold' : 'border-gray-200'}`}>
                <input type="radio" name="cancel-reason" value={r} checked={selected === r} onChange={() => setSelected(r)} disabled={busy} />
                {r}
              </label>
            ))}
          </div>
          {selected === OTHER_REASON && (
            <input
              autoFocus
              value={other}
              onChange={(e) => setOther(e.target.value)}
              maxLength={450}
              placeholder="कारण लिखें..."
              className="input-field mt-2 text-sm"
              disabled={busy}
            />
          )}
        </fieldset>

        {error && <p className="mt-3 text-sm font-semibold text-red-600" role="alert">{error}</p>}

        <div className="mt-5 flex gap-3">
          <button onClick={onClose} disabled={busy} className="flex-1 py-3 rounded-xl border-2 border-gray-300 text-gray-700 font-bold text-sm disabled:opacity-50">
            वापस जाएँ
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={busy || !reason}
            className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold text-sm disabled:opacity-40"
          >
            {busy ? 'रद्द हो रहा है...' : 'ऑर्डर रद्द करें'}
          </button>
        </div>
      </div>
    </div>
  )
}
