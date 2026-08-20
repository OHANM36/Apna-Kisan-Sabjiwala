import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { formatDate } from '../utils/format'
import Loading from '../components/Loading'

export default function AdminSellers() {
  const [sellers, setSellers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('सभी')

  useEffect(() => {
    loadSellers()
  }, [])

  async function loadSellers() {
    setLoading(true)
    const { data } = await supabase.from('sellers').select('*').order('created_at', { ascending: false })
    setSellers(data || [])
    setLoading(false)
  }

  async function toggleApproval(seller) {
    await supabase.from('sellers').update({ is_approved: !seller.is_approved }).eq('id', seller.id)
    loadSellers()
  }

  async function toggleActive(seller) {
    await supabase.from('sellers').update({ is_active: !seller.is_active }).eq('id', seller.id)
    loadSellers()
  }

  const filtered = sellers.filter((s) => {
    if (filter === 'सभी') return true
    if (filter === 'अप्रूवल बाकी') return !s.is_approved
    if (filter === 'अप्रूव्ड') return s.is_approved
    if (filter === 'निष्क्रिय') return !s.is_active
    return true
  })

  if (loading) return <Loading />

  return (
    <div>
      <h1 className="font-extrabold text-xl text-gray-800 mb-5">विक्रेता प्रबंधन</h1>

      <div className="flex gap-2 overflow-x-auto mb-4 no-scrollbar">
        {['सभी', 'अप्रूवल बाकी', 'अप्रूव्ड', 'निष्क्रिय'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold border-2 ${
              filter === f ? 'bg-kisan text-white border-kisan' : 'bg-white text-gray-500 border-gray-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {filtered.map((s) => (
          <div key={s.id} className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="font-bold text-gray-800 text-sm">{s.business_name}</p>
                <p className="text-xs text-gray-500">{s.owner_name} • {s.phone}</p>
                {s.email && <p className="text-xs text-gray-400">{s.email}</p>}
                <p className="text-xs text-gray-400 mt-0.5">जुड़े: {formatDate(s.created_at)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${s.is_approved ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-600'}`}>
                  {s.is_approved ? 'अप्रूव्ड' : 'अप्रूवल बाकी'}
                </span>
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${s.is_active ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-600'}`}>
                  {s.is_active ? 'सक्रिय' : 'निष्क्रिय'}
                </span>
              </div>
            </div>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => toggleApproval(s)}
                className={`flex-1 text-xs font-bold py-2 rounded-lg ${s.is_approved ? 'border-2 border-red-400 text-red-500' : 'bg-kisan text-white'}`}
              >
                {s.is_approved ? 'अप्रूवल हटाएं' : 'अप्रूव करें'}
              </button>
              <button
                onClick={() => toggleActive(s)}
                className={`flex-1 text-xs font-bold py-2 rounded-lg border-2 ${s.is_active ? 'border-red-400 text-red-500' : 'border-kisan text-kisan'}`}
              >
                {s.is_active ? 'निष्क्रिय करें' : 'सक्रिय करें'}
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-gray-400 text-center py-16">इस श्रेणी में कोई विक्रेता नहीं</p>}
      </div>
    </div>
  )
}
