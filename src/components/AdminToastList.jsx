export default function AdminToastList({ toasts }) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-xs w-full px-4 md:px-0">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-xl shadow-lg px-4 py-3 text-sm font-semibold text-white animate-[fadeIn_0.2s_ease-out] ${
            t.type === 'new-order' ? 'bg-kisan' : 'bg-blue-600'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
