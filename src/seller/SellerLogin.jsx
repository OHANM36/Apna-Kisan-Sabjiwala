import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useSellerAuth } from '../context/SellerAuthContext'
import logo from '../assets/logo.png'

export default function SellerLogin() {
  const { login, session, isSeller, loading } = useSellerAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  if (!loading && session && isSeller) {
    return <Navigate to="/seller" replace />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const res = await login(email, password)
    setSubmitting(false)
    if (res.error) {
      setError('लॉगिन असफल। ईमेल या पासवर्ड गलत है।')
    } else {
      navigate('/seller')
    }
  }

  return (
    <div className="min-h-screen bg-kisan-dark flex items-center justify-center px-6">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <img src={logo} alt="अपना किसान सब्ज़ीवाला" className="w-16 h-16 rounded-full object-cover mx-auto" />
          <h1 className="font-extrabold text-xl text-gray-800 mt-2">विक्रेता लॉगिन</h1>
          <p className="text-gray-500 text-sm">अपना किसान सब्ज़ीवाला</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1">ईमेल</label>
            <input type="email" required className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1">पासवर्ड</label>
            <input type="password" required className="input-field" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-red-500 text-sm font-semibold">{error}</p>}
          <button type="submit" disabled={submitting} className="btn-primary w-full mt-2">
            {submitting ? 'लॉगिन हो रहा है...' : 'लॉगिन करें'}
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-4">
          नए विक्रेता हैं? <Link to="/seller/signup" className="text-kisan font-bold">खाता बनाएं</Link>
        </p>
      </div>
    </div>
  )
}
