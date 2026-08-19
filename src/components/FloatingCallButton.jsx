import { useSettings } from '../context/SettingsContext'

export default function FloatingCallButton() {
  const { settings } = useSettings()
  const phone = (settings.business_whatsapp || '').replace(/\D/g, '').slice(-10)

  if (!phone) return null

  return (
    <a
      href={`tel:${phone}`}
      className="fixed right-4 bottom-20 z-40 bg-kisan-orange text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      aria-label="सहायता के लिए कॉल करें"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
      </svg>
    </a>
  )
}
