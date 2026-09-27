import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useDeliveryAuth } from '../context/DeliveryAuthContext'
import logo from '../assets/logo.png'

const PIN_LENGTH = 4
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

export default function DeliveryLogin() {
  const { loginWithPin, isLoggedIn, loading } = useDeliveryAuth()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  if (!loading && isLoggedIn) {
    return <Navigate to="/delivery" replace />
  }

  async function handlePress(digit) {
    if (checking || pin.length >= PIN_LENGTH) return
    const next = pin + digit
    setPin(next)
    setError('')
    if (next.length === PIN_LENGTH) {
      setChecking(true)
      const res = await loginWithPin(next)
      setChecking(false)
      if (res.error) {
        setError(res.error)
        setPin('')
      }
    }
  }

  function handleBackspace() {
    if (checking) return
    setError('')
    setPin((p) => p.slice(0, -1))
  }

  return (
    <div className="min-h-screen bg-kisan-dark flex items-center justify-center px-6">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <img src={logo} alt="अपना किसान सब्ज़ीवाला" className="w-16 h-16 rounded-full object-cover mx-auto" />
          <h1 className="font-extrabold text-xl text-gray-800 mt-2">डिलीवरी पैनल</h1>
          <p className="text-gray-500 text-sm">लॉगिन करने के लिए अपना 4 अंकों का पिन डालें</p>
        </div>

        <div className="flex justify-center gap-3 mb-5">
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <span
              key={i}
              className={`w-4 h-4 rounded-full border-2 border-kisan transition-colors ${
                i < pin.length ? 'bg-kisan' : 'bg-white'
              }`}
            />
          ))}
        </div>

        <div className="h-5 text-center mb-2">
          {error && <p className="text-red-500 text-sm font-semibold">{error}</p>}
          {checking && !error && <p className="text-gray-400 text-sm">जांच हो रही है...</p>}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {KEYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => handlePress(d)}
              className="py-4 rounded-2xl bg-kisan-crate/40 text-xl font-bold text-gray-800 active:scale-95 transition-transform"
            >
              {d}
            </button>
          ))}
          <div />
          <button
            type="button"
            onClick={() => handlePress('0')}
            className="py-4 rounded-2xl bg-kisan-crate/40 text-xl font-bold text-gray-800 active:scale-95 transition-transform"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className="py-4 rounded-2xl bg-gray-100 text-lg font-bold text-gray-500 active:scale-95 transition-transform"
          >
            ⌫
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          पिन नहीं मिला? दुकान के एडमिन से संपर्क करें।
        </p>
      </div>
    </div>
  )
}
