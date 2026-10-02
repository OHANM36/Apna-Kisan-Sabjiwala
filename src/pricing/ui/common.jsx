import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { usePT } from '../strings'
import { getPending, syncPending, clearPending } from '../api'
import { PageSkeleton } from '../../components/Skeleton'

export const rupee = (v, digits = 2) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  const s = Number.isInteger(n) ? String(n) : n.toFixed(digits)
  return `₹${s}`
}

/** सिर्फ़ मालिक (admin_users.role = 'admin') */
export function OwnerOnly({ children }) {
  const { isOwner, loading } = useAdminAuth()
  const pt = usePT()
  if (loading) return <PageSkeleton />
  if (!isOwner) return <Navigate to="/admin" replace state={{ ownerOnly: true }} />
  return children
}

/** पुरानी→नई कीमत, हरा (घटा)/लाल (बढ़ा). खरीद कीमत के लिए "बढ़ना" बुरा है; बिक्री के लिए ग्राहक को दिखने वाला बदलाव */
export function Delta({ from, to, invert = false }) {
  const a = Number(from)
  const b = Number(to)
  if (!Number.isFinite(b)) return <span className="text-gray-400">—</span>
  if (!Number.isFinite(a) || a === b) return <span className="font-bold text-gray-800">{rupee(b)}</span>
  const up = b > a
  const good = invert ? !up : up // बिक्री बढ़ना = हरा (ज़्यादा कमाई); खरीद बढ़ना = लाल (invert)
  return (
    <span className="font-bold">
      <span className="text-gray-400 line-through font-semibold mr-1">{rupee(a)}</span>
      <span className="text-gray-400">→</span>{' '}
      <span className={good ? 'text-green-600' : 'text-red-600'}>
        {rupee(b)} {up ? '▲' : '▼'}
      </span>
    </span>
  )
}

export function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-gray-600 mb-1">{label}</span>
      {children}
      {hint && !error && <span className="block text-[11px] text-gray-400 mt-0.5">{hint}</span>}
      {error && <span className="block text-[11px] text-red-600 font-semibold mt-0.5">{error}</span>}
    </label>
  )
}

export const inputCls =
  'w-full border-2 border-gray-200 rounded-xl px-3 py-3 text-base font-semibold focus:border-kisan-green focus:outline-none bg-white'
export const bigBtn = 'w-full rounded-2xl py-4 text-base font-extrabold active:scale-[0.99] disabled:opacity-50'

/** ₹ वाला बड़ा नंबर-इनपुट (Android पर दशमलव कीबोर्ड) */
export function MoneyInput({ value, onChange, placeholder, invalid, suffix, className = '', ...rest }) {
  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
        placeholder={placeholder}
        className={`${inputCls} pl-8 ${suffix ? 'pr-14' : ''} ${invalid ? 'border-red-400' : ''}`}
        {...rest}
      />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold">{suffix}</span>}
    </div>
  )
}

export function NumberInput({ value, onChange, invalid, placeholder, ...rest }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
      className={`${inputCls} ${invalid ? 'border-red-400' : ''}`}
      {...rest}
    />
  )
}

/** "Pending Sync" पट्टी — मालिक के सभी एडमिन पेजों पर ऊपर दिखती है */
export function PendingSyncBanner() {
  const pt = usePT()
  const [pending, setPending] = useState(() => getPending())
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function sync() {
    if (busy) return
    setBusy(true)
    try {
      const r = await syncPending()
      if (r.status === 'offline') setMsg({ tone: 'warn', text: pt('tp_sync_offline') })
      else if (r.status === 'done') {
        const bad = [...(r.conflicts || []), ...(r.rejected || [])]
        setMsg({
          tone: bad.length ? 'warn' : 'ok',
          text: pt('tp_sync_ok', { n: r.applied }) + (r.conflicts?.length ? ` • ${pt('tp_conflicts')}` : '') + (r.rejected?.length ? ` • ${pt('tp_rejected')} ${r.rejected.map((x) => x.reason).join(', ')}` : ''),
        })
      }
    } catch (e) {
      setMsg({ tone: 'warn', text: e.message })
    }
    setPending(getPending())
    setBusy(false)
  }

  useEffect(() => {
    const onOnline = () => sync()
    const onStorage = () => setPending(getPending())
    window.addEventListener('online', onOnline)
    window.addEventListener('aks-pending-changed', onStorage)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('aks-pending-changed', onStorage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!pending && !msg) return null
  return (
    <div className={`rounded-2xl p-3 mb-3 text-sm font-semibold ${pending ? 'bg-amber-50 border border-amber-300 text-amber-900' : msg?.tone === 'ok' ? 'bg-green-50 border border-green-300 text-green-800' : 'bg-amber-50 border border-amber-300 text-amber-900'}`}>
      {pending && <p>⏳ {pt('tp_pending_banner', { n: pending.items.length })}</p>}
      {msg && <p className="mt-1">{msg.text}</p>}
      {pending && (
        <div className="flex gap-2 mt-2">
          <button onClick={sync} disabled={busy} className="flex-1 bg-kisan-green text-white rounded-xl py-2.5 font-bold disabled:opacity-50">
            {pt('tp_sync_now')}
          </button>
          <button
            onClick={() => {
              clearPending()
              setPending(null)
            }}
            className="px-4 rounded-xl border border-amber-400 font-bold"
          >
            {pt('tp_discard_pending')}
          </button>
        </div>
      )}
      {!pending && msg && (
        <button onClick={() => setMsg(null)} className="mt-1 text-xs underline">
          {pt('close')}
        </button>
      )}
    </div>
  )
}
