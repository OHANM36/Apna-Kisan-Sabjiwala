import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { rupee } from './common'

/** ऑर्डर-स्तर का मुनाफ़ा (सिर्फ़ मालिक). ग्राहक/स्टाफ को RLS से यह डेटा मिलता ही नहीं। */
export default function OrderProfit({ orderId }) {
  const [f, setF] = useState(undefined)

  useEffect(() => {
    let alive = true
    supabase
      .from('order_financials')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle()
      .then(({ data }) => alive && setF(data || null))
    return () => {
      alive = false
    }
  }, [orderId])

  if (f === undefined) return null
  if (f === null) return <p className="text-[11px] text-gray-400 mb-3">💼 लागत का हिसाब उपलब्ध नहीं (यह ऑर्डर प्राइसिंग सिस्टम से पहले का है)</p>

  const row = (label, value, neg = false, strong = false) => (
    <div className={`flex justify-between ${strong ? 'font-extrabold border-t border-gray-200 mt-1 pt-1' : ''}`}>
      <span>{label}</span>
      <span className={strong ? (Number(value) < 0 ? 'text-red-600' : 'text-green-700') : ''}>
        {neg ? '− ' : ''}
        {rupee(Math.abs(Number(value)))}
        {strong && Number(value) < 0 ? ' (घाटा)' : ''}
      </span>
    </div>
  )

  return (
    <div className="mb-3 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-gray-700">
      <p className="font-extrabold text-emerald-800 mb-1">💼 मुनाफ़ा (सिर्फ़ मालिक)</p>
      {row('ग्राहक का भुगतान (रेवेन्यू)', f.revenue)}
      {row('सामान की खरीद लागत', f.product_purchase_cost, true)}
      {row('अनुमानित बर्बादी लागत', f.wastage_cost, true)}
      {row('पैकिंग/हैंडलिंग', f.packing_cost, true)}
      {Number(f.discount) > 0 && row('दी गई छूट (रेवेन्यू में पहले से घटी)', f.discount)}
      {row('डिलीवरी खर्च', f.delivery_cost, true)}
      {Number(f.payment_charges) > 0 && row(`पेमेंट चार्ज (${f.payment_charge_pct}%)`, f.payment_charges, true)}
      {row('अनुमानित कंट्रीब्यूशन', f.contribution, false, true)}
      {f.unknown_cost_items > 0 && <p className="text-amber-700 font-semibold mt-1">⚠️ {f.unknown_cost_items} आइटम की लागत पता नहीं (प्राइसिंग सेट नहीं / विक्रेता की सब्ज़ी) — असली मुनाफ़ा इससे कम हो सकता है।</p>}
    </div>
  )
}
