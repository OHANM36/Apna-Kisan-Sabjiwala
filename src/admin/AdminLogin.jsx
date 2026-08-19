import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../context/AdminAuthContext'

export default function AdminLogin() {
  const { login, session, isAdmin, loading } = useAdminAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  if (!loading && session && isAdmin) {
    return <Navigate to="/admin" replace />
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
      navigate('/admin')
    }
  }

  return (
    <div className="min-h-screen bg-kisan-dark flex items-center justify-center px-6">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <span className="text-5xl">🥬</span>
          <h1 className="font-extrabold text-xl text-gray-800 mt-2">एडमिन पैनल</h1>
          <p className="text-gray-500 text-sm">अपना किसान सब्ज़ीवाला</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1">ईमेल</label>
            <input type="email" required className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1">पासवर्ड</label>
            <input type="password" required className="input-field" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          {error && <p className="text-red-500 text-sm font-semibold">{error}</p>}
          <button type="submit" disabled={submitting} className="btn-primary w-full mt-2">
            {submitting ? 'लॉगिन हो रहा है...' : 'लॉगिन करें'}
          </button>
        </form>
      </div>
    </div>
  )
}
