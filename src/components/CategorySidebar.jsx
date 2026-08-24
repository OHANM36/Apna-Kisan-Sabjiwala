import { useLanguage } from '../context/LanguageContext'

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

export default function CategorySidebar({ categories, activeSlug, onSelect }) {
  const { t } = useLanguage()
  return (
    <aside className="w-[76px] shrink-0 bg-kisan-crate/30 border-r border-kisan-crate">
      <button
        onClick={() => onSelect(null)}
        className={`w-full flex flex-col items-center gap-1 py-3 px-1 transition-colors ${
          !activeSlug ? 'bg-white border-l-4 border-kisan-orange' : 'border-l-4 border-transparent'
        }`}
      >
        <span className={`text-2xl w-11 h-11 rounded-full flex items-center justify-center ${!activeSlug ? 'bg-kisan-orange/15' : 'bg-white'}`}>
          🧺
        </span>
        <span className={`text-[10px] font-bold leading-tight text-center ${!activeSlug ? 'text-kisan-ink' : 'text-gray-500'}`}>
          {t('category_all')}
        </span>
      </button>

      {categories.map((cat) => {
        const isActive = activeSlug === cat.slug
        return (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.slug)}
            className={`w-full flex flex-col items-center gap-1 py-3 px-1 transition-colors ${
              isActive ? 'bg-white border-l-4 border-kisan-orange' : 'border-l-4 border-transparent'
            }`}
          >
            <span className={`text-2xl w-11 h-11 rounded-full flex items-center justify-center ${isActive ? 'bg-kisan-orange/15' : 'bg-white'}`}>
              {CATEGORY_EMOJI[cat.slug] || '🥦'}
            </span>
            <span className={`text-[10px] font-bold leading-tight text-center line-clamp-2 ${isActive ? 'text-kisan-ink' : 'text-gray-500'}`}>
              {cat.name}
            </span>
          </button>
        )
      })}
    </aside>
  )
}
