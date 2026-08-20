import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import Header from '../components/Header'
import Loading from '../components/Loading'

export default function Vendors() {
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadVendors()
  }, [])

  async function loadVendors() {
    setLoading(true)
    const { data } = await supabase
      .from('sellers')
      .select('id, business_name, owner_name, phone, photo_url')
      .eq('is_approved', true)
      .eq('is_active', true)
      .order('business_name')
    setVendors(data || [])
    setLoading(false)
  }

  return (
    <div className="min-h-screen pb-24">
      <Header />
      <div className="px-4 py-4">
        <h2 className="font-bold text-gray-800 text-lg mb-1">हमारे विक्रेता</h2>
        <p className="text-gray-500 text-sm mb-4">किसी विक्रेता पर टैप करके उसकी सब्ज़ियाँ देखें</p>

        {loading ? (
          <Loading />
        ) : vendors.length === 0 ? (
          <div className="text-center py-16">
            <span className="text-6xl block mb-3">🧑‍🌾</span>
            <p className="text-gray-500 font-medium">अभी तक कोई विक्रेता उपलब्ध नहीं</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {vendors.map((v) => (
              <Link
                key={v.id}
                to={`/vendors/${v.id}`}
                className="card p-4 flex flex-col items-center gap-2 text-center active:scale-95 transition-transform"
              >
                <div className="w-16 h-16 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center border border-gray-200">
                  {v.photo_url ? (
                    <img src={v.photo_url} alt={v.business_name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl">🧑‍🌾</span>
                  )}
                </div>
                <div>
                  <p className="font-bold text-gray-800 text-sm leading-tight">{v.business_name}</p>
                  <p className="text-xs text-gray-500">{v.owner_name}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
