import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useSellerAuth } from '../context/SellerAuthContext'
import logo from '../assets/logo.png'

export default function SellerSignup() {
  const { signup, session, isSeller, loading } = useSellerAuth()
  const [form, setForm] = useState({
    businessName: '',
    ownerName: '',
    phone: '',
    email: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  if (!loading && session && isSeller) {
    return <Navigate to="/seller" replace />
  }

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!/^[6-9]\d{9}$/.test(form.phone.trim())) {
      setError('सही मोबाइल नंबर डालें (10 अंक)')
      return
    }
    if (form.password.length < 6) {
      setError('पासवर्ड कम से कम 6 अक्षर का होना चाहिए')
      return
    }
    setSubmitting(true)
    const res = await signup({
      email: form.email.trim(),
      password: form.password,
      businessName: form.businessName.trim(),
      ownerName: form.ownerName.trim(),
      phone: form.phone.trim(),
    })
    setSubmitting(false)
    if (res.error) {
      setError(res.error)
    } else {
      navigate('/seller')
    }
  }

  return (
    <div className="min-h-screen bg-kisan-dark flex items-center justify-center px-6 py-10">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <img src={logo} alt="अपना किसान सब्ज़ीवाला" className="w-16 h-16 rounded-full object-cover mx-auto" />
          <h1 className="font-extrabold text-xl text-gray-800 mt-2">विक्रेता बनें</h1>
          <p className="text-gray-500 text-sm">अपनी सब्ज़ियाँ बेचना शुरू करें</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1">दुकान/व्यवसाय का नाम</label>
            <input required className="input-field" value={form.businessName} onChange={(e) => updateField('businessName', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1">आपका नाम</label>
            <input required className="input-field" value={form.ownerName} onChange={(e) => updateField('ownerName', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1">मोबाइल नंबर</label>
            <input required className="input-field" value={form.phone} inputMode="numeric" onChange={(e) => updateField('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1">ईमेल</label>
            <input required type="email" className="input-field" value={form.email} onChange={(e) => updateField('email', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1">पासवर्ड</label>
            <input required type="password" className="input-field" value={form.password} onChange={(e) => updateField('password', e.target.value)} />
          </div>
          {error && <p className="text-red-500 text-sm font-semibold">{error}</p>}
          <button type="submit" disabled={submitting} className="btn-primary w-full mt-2">
            {submitting ? 'खाता बन रहा है...' : 'विक्रेता खाता बनाएं'}
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-4">
          पहले से खाता है? <Link to="/seller/login" className="text-kisan font-bold">लॉगिन करें</Link>
        </p>
      </div>
    </div>
  )
}
