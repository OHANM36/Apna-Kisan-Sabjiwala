import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import logo from '../assets/logo.png'

export default function Header({ showSearch, searchValue, onSearchChange }) {
  const { totalItems } = useCart()

  return (
    <header className="sticky top-0 z-30 bg-kisan text-white shadow-md">
      <div className="flex items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="अपना किसान सब्ज़ीवाला" className="w-10 h-10 rounded-full object-cover shrink-0" />
          <div>
            <h1 className="font-extrabold text-lg leading-tight">अपना किसान सब्ज़ीवाला</h1>
            <p className="text-[11px] text-green-100 leading-tight">ताज़ी सब्ज़ियाँ — सीधे आपके घर तक</p>
          </div>
        </Link>
        <Link to="/cart" className="relative bg-white/15 rounded-full p-2.5 active:scale-95 transition-transform">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 1.94-4.693 2.443-7.152.083-.401-.218-.788-.628-.788H5.25M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
          </svg>
          {totalItems > 0 && (
            <span className="absolute -top-1 -right-1 bg-kisan-orange text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {totalItems}
            </span>
          )}
        </Link>
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
              placeholder="सब्ज़ी खोजें... जैसे आलू, टमाटर"
              className="w-full bg-white rounded-xl pl-10 pr-4 py-2.5 text-gray-800 text-base focus:outline-none"
            />
          </div>
        </div>
      )}
    </header>
  )
}
