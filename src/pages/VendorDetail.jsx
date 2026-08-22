import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import Header from '../components/Header'
import VegetableCard from '../components/VegetableCard'
import Loading from '../components/Loading'

export default function VendorDetail() {
  const { vendorId } = useParams()
  const [vendor, setVendor] = useState(null)
  const [vegetables, setVegetables] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    loadData()
  }, [vendorId])

  async function loadData() {
    setLoading(true)
    const { data: vendorData } = await supabase
      .from('sellers')
      .select('id, business_name, owner_name, phone, email, photo_url, is_approved, is_active')
      .eq('id', vendorId)
      .maybeSingle()

    if (!vendorData || !vendorData.is_approved || !vendorData.is_active) {
      setNotFound(true)
      setLoading(false)
      return
    }

    const { data: vegs } = await supabase
      .from('vegetables')
      .select('*, categories(name, slug), sellers(business_name, photo_url)')
      .eq('seller_id', vendorId)
      .eq('is_active', true)
      .order('display_order')

    setVendor(vendorData)
    setVegetables(vegs || [])
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen pb-24">
        <Header />
        <Loading />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen pb-24">
        <Header />
        <div className="text-center py-16 px-6">
          <span className="text-6xl block mb-3">🚫</span>
          <p className="text-gray-500 font-medium mb-4">यह विक्रेता उपलब्ध नहीं है</p>
          <Link to="/vendors" className="text-kisan font-bold text-sm">← सभी विक्रेता देखें</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24">
      <Header />
      <div className="px-4 py-4 animate-fade-slide-in">
        <Link to="/vendors" className="text-kisan text-sm font-bold mb-3 inline-block">← सभी विक्रेता</Link>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-16 h-16 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center border border-gray-200 shrink-0">
            {vendor.photo_url ? (
              <img src={vendor.photo_url} alt={vendor.business_name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl">🧑‍🌾</span>
            )}
          </div>
          <div>
            <h2 className="font-extrabold text-lg text-gray-800 leading-tight">{vendor.business_name}</h2>
            <p className="text-gray-500 text-sm">{vendor.owner_name}</p>
            {vendor.phone && <a href={`tel:${vendor.phone}`} className="text-kisan text-xs font-bold">📞 {vendor.phone}</a>}
          </div>
        </div>

        {vegetables.length === 0 ? (
          <div className="text-center py-16">
            <span className="text-5xl block mb-3">🥬</span>
            <p className="text-gray-500 font-medium">इस विक्रेता के पास अभी कोई सब्ज़ी उपलब्ध नहीं है</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2.5">
            {vegetables.map((veg) => (
              <VegetableCard key={veg.id} veg={veg} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
