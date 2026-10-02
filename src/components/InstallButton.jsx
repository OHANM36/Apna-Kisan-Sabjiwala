import { useState } from 'react'
import { usePwaInstall } from '../utils/pwa'
import { useLanguage } from '../context/LanguageContext'

export default function InstallButton() {
  const { canInstall, ios, install } = usePwaInstall()
  const { t } = useLanguage()
  const [showHelp, setShowHelp] = useState(false)

  if (!canInstall) return null

  async function onClick() {
    if (ios) setShowHelp(true)
    else await install()
  }

  return (
    <>
      <button
        onClick={onClick}
        className="bg-kisan-orange text-kisan-ink rounded-full px-3 py-1.5 text-[11px] font-bold flex items-center gap-1 active:scale-90 transition-transform"
        aria-label={t('install_app')}
      >
        <span aria-hidden>⬇️</span> {t('install_app')}
      </button>

      {showHelp && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={() => setShowHelp(false)}>
          <div className="bg-white text-kisan-ink w-full max-w-md rounded-t-3xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-extrabold text-lg mb-2">{t('install_app')}</h3>
            <p className="text-sm text-gray-600">{t('install_ios_help')}</p>
            <button onClick={() => setShowHelp(false)} className="btn-primary w-full mt-4">{t('install_ok')}</button>
          </div>
        </div>
      )}
    </>
  )
}
