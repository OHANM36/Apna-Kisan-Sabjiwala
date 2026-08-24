import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useLanguage } from '../context/LanguageContext'
import logo from '../assets/logo.png'

export default function Header({ showSearch, searchValue, onSearchChange }) {
  const { totalItems } = useCart()
  const { language, toggleLanguage, t } = useLanguage()

  return (
    <header className="sticky top-0 z-30 bg-kisan-dark text-white shadow-sm vine-pattern">
      <div className="flex items-center justify-between px-4 py-3 gap-2">
        <Link to="/" className="flex items-center gap-2 min-w-0">
          <img src={logo} alt={t('app_name')} className="w-10 h-10 rounded-full object-cover shrink-0 ring-2 ring-white/20" />
          <div className="min-w-0">
            <h1 className="font-display font-bold text-lg leading-tight truncate">{t('app_name')}</h1>
            <p className="text-[11px] text-kisan-orange/90 leading-tight font-semibold truncate">{t('app_tagline')}</p>
          </div>
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={toggleLanguage}
            className="bg-white/10 rounded-full px-2.5 py-1.5 text-[11px] font-bold active:scale-90 transition-transform"
            aria-label="भाषा बदलें / Change language"
          >
            {language === 'hi' ? 'EN' : 'हिं'}
          </button>
          <Link to="/cart" className="relative bg-white/10 rounded-full p-2.5 active:scale-90 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 1.94-4.693 2.443-7.152.083-.401-.218-.788-.628-.788H5.25M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
            </svg>
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 bg-kisan-orange text-kisan-ink text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-bump">
                {totalItems}
              </span>
            )}
          </Link>
        </div>
      </div>

      {showSearch && (
        <div className="px-4 pb-3">
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('search_placeholder')}
              className="w-full bg-white rounded-2xl pl-10 pr-4 py-2.5 text-kisan-ink text-base focus:outline-none"
            />
          </div>
        </div>
      )}
    </header>
  )
}
