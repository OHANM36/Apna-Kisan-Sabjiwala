import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import Header from '../components/Header'
import CategoryChips from '../components/CategoryChips'
import VegetableCard from '../components/VegetableCard'
import Loading from '../components/Loading'
import { useSettings } from '../context/SettingsContext'
import { formatRupee } from '../utils/format'

export default function Home() {
  const [vegetables, setVegetables] = useState([])
  const [categories, setCategories] = useState([])
  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeCategory, setActiveCategory] = useState(searchParams.get('category') || null)
  const [search, setSearch] = useState('')
  const { settings } = useSettings()

  useEffect(() => {
    loadData()
  }, [])

  function handleCategorySelect(slug) {
    setActiveCategory(slug)
    setSearchParams(slug ? { category: slug } : {})
  }

  async function loadData() {
    setLoading(true)
    const [{ data: vegs }, { data: cats }, { data: offs }] = await Promise.all([
      supabase
        .from('vegetables')
        .select('*, categories(name, slug), sellers(business_name, photo_url)')
        .eq('is_active', true)
        .order('display_order'),
      supabase.from('categories').select('*').eq('is_active', true).order('display_order'),
      supabase.from('offers').select('*').eq('is_active', true),
    ])
    setVegetables(vegs || [])
    setCategories(cats || [])
    setOffers(offs || [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    return vegetables.filter((v) => {
      const matchesCategory = !activeCategory || v.categories?.slug === activeCategory
      const matchesSearch = v.name.toLowerCase().includes(search.trim().toLowerCase())
      return matchesCategory && matchesSearch
    })
  }, [vegetables, activeCategory, search])

  return (
    <div className="min-h-screen pb-24">
      <Header showSearch searchValue={search} onSearchChange={setSearch} />

      {!settings.is_store_open && (
        <div className="bg-red-100 text-red-700 text-center text-sm font-semibold py-2 px-4">
          फिलहाल स्टोर बंद है। कृपया बाद में ऑर्डर करें।
        </div>
      )}

      {offers.length > 0 && (
        <div className="px-4 pt-3">
          {offers.slice(0, 1).map((o) => (
            <div key={o.id} className="bg-gradient-to-r from-kisan-orange to-orange-400 text-white rounded-2xl p-4 shadow-md">
              <p className="font-extrabold text-base">🎉 {o.title}</p>
              {o.description && <p className="text-xs mt-0.5 opacity-90">{o.description}</p>}
              {o.coupon_code && (
                <p className="text-xs mt-1 bg-white/20 inline-block px-2 py-0.5 rounded font-bold">
                  कोड: {o.coupon_code}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="px-4 pt-3">
        <div className="bg-kisan-dark/5 border border-kisan/20 rounded-xl px-4 py-2.5 text-sm text-kisan-dark font-semibold">
          न्यूनतम ऑर्डर: {formatRupee(settings.min_order_value)} • डिलीवरी शुल्क: {formatRupee(settings.delivery_fee)}
        </div>
      </div>

      <CategoryChips categories={categories} activeSlug={activeCategory} onSelect={handleCategorySelect} />

      <div className="px-4 pb-1">
        <Link
          to="/vendors"
          className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 active:scale-95 transition-transform"
        >
          <span className="flex items-center gap-2 font-bold text-gray-700 text-sm">
            🧑‍🌾 हमारे विक्रेता देखें
          </span>
          <span className="text-kisan text-sm font-bold">→</span>
        </Link>
      </div>

      <div className="px-4 animate-fade-slide-in">
        <h2 className="font-display font-bold text-kisan-ink mb-3">
          {search ? `खोज परिणाम "${search}"` : 'आज की उपलब्ध सब्ज़ियाँ'}
        </h2>

        {loading ? (
          <Loading text="सब्ज़ियाँ लोड हो रही हैं..." />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-3">🔍</p>
            <p className="text-gray-500 font-medium">कोई सब्ज़ी नहीं मिली</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2.5 pb-4">
            {filtered.map((veg) => (
              <VegetableCard key={veg.id} veg={veg} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
