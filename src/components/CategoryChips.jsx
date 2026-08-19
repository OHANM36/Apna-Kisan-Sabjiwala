export default function CategoryChips({ categories, activeSlug, onSelect }) {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-3 no-scrollbar">
      <button
        onClick={() => onSelect(null)}
        className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold border-2 ${
          !activeSlug ? 'bg-kisan text-white border-kisan' : 'bg-white text-gray-600 border-gray-200'
        }`}
      >
        सभी सब्ज़ियाँ
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.slug)}
          className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold border-2 ${
            activeSlug === cat.slug ? 'bg-kisan text-white border-kisan' : 'bg-white text-gray-600 border-gray-200'
          }`}
        >
          {cat.name}
        </button>
      ))}
    </div>
  )
}
