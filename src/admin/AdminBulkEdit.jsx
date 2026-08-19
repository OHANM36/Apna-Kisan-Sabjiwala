import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { formatRupee } from '../utils/format'
import Loading from '../components/Loading'

export default function AdminBulkEdit() {
  const [vegetables, setVegetables] = useState([])
  const [prices, setPrices] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [bulkPercent, setBulkPercent] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadVegetables()
  }, [])

  async function loadVegetables() {
    setLoading(true)
    const { data } = await supabase
      .from('vegetables')
      .select('*, categories(name)')
      .order('display_order')
    setVegetables(data || [])
    const initialPrices = {}
    ;(data || []).forEach((v) => {
      initialPrices[v.id] = v.price
    })
    setPrices(initialPrices)
    setLoading(false)
  }

  function updatePrice(id, value) {
    setPrices((prev) => ({ ...prev, [id]: value }))
    setSavedMsg('')
  }

  function applyBulkPercent() {
    const pct = Number(bulkPercent)
    if (!pct) return
    const updated = {}
    vegetables.forEach((v) => {
      const current = Number(prices[v.id] ?? v.price)
      updated[v.id] = Math.round(current * (1 + pct / 100) * 100) / 100
    })
    setPrices((prev) => ({ ...prev, ...updated }))
    setSavedMsg('')
  }

  function hasChanges() {
    return vegetables.some((v) => Number(prices[v.id]) !== Number(v.price))
  }

  async function saveAll() {
    setSaving(true)
    setSavedMsg('')
    const changed = vegetables.filter((v) => Number(prices[v.id]) !== Number(v.price))

    for (const v of changed) {
      await supabase
        .from('vegetables')
        .update({ price: Number(prices[v.id]) })
        .eq('id', v.id)
    }

    setSaving(false)
    setSavedMsg(`✅ ${changed.length} सब्ज़ियों की कीमत अपडेट हो गई`)
    loadVegetables()
  }

  const filtered = vegetables.filter((v) => v.name.toLowerCase().includes(search.toLowerCase()))

  if (loading) return <Loading />

  return (
    <div>
      <h1 className="font-extrabold text-xl text-gray-800 mb-5">कीमतें एक साथ बदलें (Bulk Edit)</h1>

      <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 flex flex-col md:flex-row gap-3 md:items-end">
        <div className="flex-1">
          <label className="block text-sm font-semibold text-gray-600 mb-1">सब्ज़ी खोजें</label>
          <input className="input-field" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="नाम से खोजें" />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-semibold text-gray-600 mb-1">सभी की कीमत % में बदलें</label>
          <div className="flex gap-2">
            <input
              type="number"
              className="input-field"
              value={bulkPercent}
              onChange={(e) => setBulkPercent(e.target.value)}
              placeholder="जैसे 10 (बढ़ाने के लिए) या -10 (घटाने के लिए)"
            />
            <button onClick={applyBulkPercent} className="btn-outline px-4 py-0 whitespace-nowrap">लागू करें</button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">सब्ज़ी</th>
              <th className="text-left px-4 py-3">श्रेणी</th>
              <th className="text-left px-4 py-3">पुरानी कीमत</th>
              <th className="text-left px-4 py-3">नई कीमत (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((v) => {
              const changed = Number(prices[v.id]) !== Number(v.price)
              return (
                <tr key={v.id} className={changed ? 'bg-orange-50' : ''}>
                  <td className="px-4 py-3 flex items-center gap-2">
                    <span className="text-xl">{v.emoji}</span>
                    <span className="font-semibold text-gray-800">{v.name}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{v.categories?.name || '-'}</td>
                  <td className="px-4 py-3 text-gray-400">{formatRupee(v.price)} / {v.unit}</td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      step="0.01"
                      className={`input-field py-1.5 w-28 ${changed ? 'border-kisan-orange' : ''}`}
                      value={prices[v.id] ?? ''}
                      onChange={(e) => updatePrice(v.id, e.target.value)}
                    />
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-gray-400 py-8">कोई सब्ज़ी नहीं मिली</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {savedMsg && <p className="text-kisan font-bold text-sm mb-3">{savedMsg}</p>}

      <div className="sticky bottom-4 flex justify-end">
        <button
          onClick={saveAll}
          disabled={saving || !hasChanges()}
          className="btn-primary px-8"
        >
          {saving ? 'सेव हो रहा है...' : 'सभी बदलाव सेव करें'}
        </button>
      </div>
    </div>
  )
}
