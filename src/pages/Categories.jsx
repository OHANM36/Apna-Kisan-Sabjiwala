import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import Header from '../components/Header'
import Loading from '../components/Loading'

const CATEGORY_EMOJI = {
  'sabhi-sabjiyan': '🧺',
  'aloo-pyaz': '🥔',
  'hari-sabjiyan': '🫛',
  'mausami-sabjiyan': '🍅',
  'patedar-sabjiyan': '🥬',
  'jad-wali-sabjiyan': '🥕',
  fal: '🍎',
  'anya-samaan': '🧄',
}

export default function Categories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('display_order')
      .then(({ data }) => {
        setCategories(data || [])
        setLoading(false)
      })
  }, [])

  return (
    <div className="min-h-screen pb-24">
      <Header />
      <div className="px-4 py-4">
        <h2 className="font-bold text-gray-800 text-lg mb-4">सब्ज़ियों की श्रेणियाँ</h2>
        {loading ? (
          <Loading />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => navigate(`/?category=${cat.slug}`)}
                className="card p-5 flex flex-col items-center gap-2 active:scale-95 transition-transform"
              >
                <span className="text-4xl">{CATEGORY_EMOJI[cat.slug] || '🥦'}</span>
                <span className="font-bold text-gray-700 text-center text-sm">{cat.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
