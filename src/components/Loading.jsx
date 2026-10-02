import { useLanguage } from '../context/LanguageContext'

export default function Loading({ text }) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-10 h-10 border-4 border-kisan/20 border-t-kisan rounded-full animate-spin" />
      <p className="text-gray-500 text-sm">{text ?? t('loading')}</p>
    </div>
  )
}
