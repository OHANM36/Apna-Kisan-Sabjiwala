import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAdminAuth } from '../context/AdminAuthContext'
import { usePT } from '../pricing/strings'
import { validateQuantity } from '../pricing/engine'
import { istDate, stockAgeDays } from '../pricing/products'
import { NumberInput, bigBtn } from '../pricing/ui/common'
import { FormPageSkeleton } from '../components/Skeleton'

/** मालिक + स्टाफ: मौजूदा स्टॉक मात्रा और स्टॉक कब आया (सिर्फ़ inventory; कीमत/लागत नहीं दिखती) */
export default function AdminStock() {
  const pt = usePT()
  const { session } = useAdminAuth()
  const [veg, setVeg] = useState(null)
  const [inv, setInv] = useState(new Map())
  const [draft, setDraft] = useState({})
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const today = istDate()

  const load = useCallback(async () => {
    const [v, i] = await Promise.all([
      supabase.from('vegetables').select('id, name, name_en, emoji, unit').is('seller_id', null).eq('is_active', true).order('display_order').order('name'),
      supabase.from('inventory').select('*'),
    ])
    if (v.error || i.error) return setError((v.error || i.error).message)
    setVeg(v.data)
    setInv(new Map((i.data || []).map((r) => [r.vegetable_id, r])))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function save(v) {
    const d = draft[v.id]
    if (!d) return
    const cur = inv.get(v.id)
    const qtyRaw = d.qty ?? (cur ? String(cur.quantity) : '')
    const errs = validateQuantity(qtyRaw)
    if (errs.length) return setMsg(pt(`err_${errs[0].code}`))
    const { error } = await supabase.from('inventory').upsert({
      vegetable_id: v.id,
      quantity: Number(qtyRaw),
      unit: cur?.unit || 'kg',
      stock_received_at: d.received || cur?.stock_received_at || today,
      updated_by: session?.user?.id,
    })
    if (error) return setMsg(error.message)
    setDraft((p) => {
      const n = { ...p }
      delete n[v.id]
      return n
    })
    setMsg(pt('pp_saved'))
    load()
  }

  if (error) return <p className="text-red-600 p-4">{error}</p>
  if (!veg) return <FormPageSkeleton fields={3} />
  return (
    <div className="max-w-2xl mx-auto pb-10">
      <h1 className="text-xl font-extrabold text-gray-800 mb-3">{pt('st_title')}</h1>
      {msg && <p className="rounded-xl bg-green-50 border border-green-300 text-green-800 p-2 text-sm font-bold mb-3">{msg}</p>}
      <ul className="space-y-2">
        {veg.map((v) => {
          const cur = inv.get(v.id)
          const d = draft[v.id] || {}
          return (
            <li key={v.id} className="rounded-2xl bg-white border border-gray-100 p-3">
              <p className="font-extrabold text-gray-800">
                {v.emoji} {v.name} {cur && <span className="text-xs font-semibold text-gray-400">• {pt('pp_stock_age', { d: stockAgeDays(cur.stock_received_at, today) })}</span>}
              </p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <NumberInput value={d.qty ?? (cur ? String(cur.quantity) : '')} onChange={(x) => setDraft((p) => ({ ...p, [v.id]: { ...d, qty: x } }))} placeholder={pt('st_qty')} />
                <input type="date" max={today} value={d.received ?? cur?.stock_received_at ?? today} onChange={(e) => setDraft((p) => ({ ...p, [v.id]: { ...d, received: e.target.value } }))} className="border-2 border-gray-200 rounded-xl px-3 py-3 text-base font-semibold" />
              </div>
              {draft[v.id] && (
                <button onClick={() => save(v)} className={`${bigBtn} bg-kisan-green text-white mt-2 !py-3`}>
                  {pt('save')}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
