export default function AdminToastList({ toasts }) {
  if (toasts.length === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-16 md:top-4 right-0 md:right-4 z-[70] flex flex-col gap-2 w-full max-w-sm px-3 md:px-0 pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-xl shadow-lg px-4 py-3 text-sm font-semibold text-white animate-[fadeIn_0.2s_ease-out] pointer-events-auto ${
            t.type === 'new-order' ? 'bg-kisan' : 'bg-blue-600'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
