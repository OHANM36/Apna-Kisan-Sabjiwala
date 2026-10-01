import { usePT, explainSentence } from '../strings'
import { rupee } from './common'

const LABEL = {
  purchase: 'bd_purchase',
  wastage: 'bd_wastage',
  effective_cost: 'bd_effective_cost',
  handling: 'bd_handling',
  base_cost: 'bd_base_cost',
  margin: 'bd_margin',
  base_recommended: 'bd_base_recommended',
  demand: 'bd_demand',
  freshness: 'bd_freshness',
  min_safe: 'bd_min_safe',
  recommended: 'bd_recommended',
  rounding: 'bd_rounding',
  rounded: 'bd_rounded',
}
const BOLD = new Set(['effective_cost', 'base_cost', 'base_recommended', 'rounded'])

/** एडमिन-ओनली कीमत स्पष्टीकरण (Section 15). ग्राहक-पेज में कभी इस्तेमाल नहीं करें। */
export default function PriceBreakdown({ calc, unitLabel }) {
  const pt = usePT()
  if (!calc || !calc.valid) return null
  const levelName = (lvl) => pt(`pp_demand_${lvl}`)
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="font-extrabold text-gray-800 text-sm">{pt('pp_breakdown')}</p>
        <span className="text-[10px] font-bold bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">🔒 {pt('pp_admin_only')}</span>
      </div>
      <p className="text-xs text-gray-600 mb-3 leading-relaxed">{explainSentence(calc, pt.language)}</p>
      <dl className="text-sm">
        {calc.explanation.lines.map((l) => {
          const key = LABEL[l.key]
          if (!key) return null
          const label = pt(key, { level: l.level ? levelName(l.level) : '', d: l.days })
          const pct = l.key === 'margin' || l.key === 'demand' || l.key === 'freshness' || l.key === 'wastage' ? l.percent : null
          const value = l.key === 'rounded' ? `${rupee(l.amount)}${unitLabel ? `/${unitLabel}` : ''}` : rupee(l.amount)
          return (
            <div key={l.key} className={`flex justify-between gap-3 py-1 ${BOLD.has(l.key) ? 'font-extrabold border-t border-gray-100 mt-1 pt-2' : 'text-gray-600'}`}>
              <dt>
                {label}
                {pct !== null && pct !== undefined && <span className="text-gray-400 font-semibold"> ({pct > 0 && l.key !== 'margin' && l.key !== 'wastage' ? '+' : ''}{pct}%)</span>}
              </dt>
              <dd className={l.key === 'rounded' ? 'text-kisan-green' : ''}>{value}</dd>
            </div>
          )
        })}
      </dl>
      {calc.warnings.map((w, i) => (
        <p key={i} className="mt-2 text-xs font-bold text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">
          ⚠️ {pt(`warn_${w.code}`, w.params)}
        </p>
      ))}
    </div>
  )
}
