export default function CategoryChips({ categories, activeSlug, onSelect }) {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-3 no-scrollbar">
      <button
        onClick={() => onSelect(null)}
        className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold border-2 transition-colors ${
          !activeSlug ? 'bg-kisan-orange text-kisan-ink border-kisan-orange' : 'bg-white text-gray-600 border-kisan-crate'
        }`}
      >
        सभी सब्ज़ियाँ
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.slug)}
          className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold border-2 transition-colors ${
            activeSlug === cat.slug ? 'bg-kisan-orange text-kisan-ink border-kisan-orange' : 'bg-white text-gray-600 border-kisan-crate'
          }`}
        >
          {cat.name}
        </button>
      ))}
    </div>
  )
}
