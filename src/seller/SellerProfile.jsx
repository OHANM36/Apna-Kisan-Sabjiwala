import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useSellerAuth } from '../context/SellerAuthContext'

export default function SellerProfile() {
  const { session, sellerProfile } = useSellerAuth()
  const [form, setForm] = useState({
    business_name: sellerProfile.business_name || '',
    owner_name: sellerProfile.owner_name || '',
    phone: sellerProfile.phone || '',
    photo_url: sellerProfile.photo_url || '',
  })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  async function handlePhotoUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    const fileName = `seller-${session.user.id}-${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('vegetable-images').upload(fileName, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('vegetable-images').getPublicUrl(fileName)
      setForm((f) => ({ ...f, photo_url: data.publicUrl }))
    } else {
      alert('फोटो अपलोड नहीं हो सकी। कृपया एडमिन से "vegetable-images" Storage bucket जांचने को कहें।')
    }
    setUploading(false)
  }

  async function handleSave() {
    setSaving(true)
    setSavedMsg('')
    const { error } = await supabase
      .from('sellers')
      .update({
        business_name: form.business_name,
        owner_name: form.owner_name,
        phone: form.phone,
        photo_url: form.photo_url || null,
      })
      .eq('id', session.user.id)
    setSaving(false)
    if (!error) {
      setSavedMsg('✅ प्रोफाइल सेव हो गई')
    } else {
      setSavedMsg('❌ कुछ गड़बड़ी हुई, दोबारा प्रयास करें')
    }
  }

  return (
    <div>
      <h1 className="font-extrabold text-xl text-gray-800 mb-5">मेरी दुकान / प्रोफाइल</h1>

      <div className="bg-white rounded-2xl shadow-sm p-5 max-w-lg flex flex-col gap-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-24 h-24 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center border-2 border-gray-200">
            {form.photo_url ? (
              <img src={form.photo_url} alt="दुकान की फोटो" className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl">🧑‍🌾</span>
            )}
          </div>
          <label className="text-kisan text-sm font-bold cursor-pointer">
            {uploading ? 'अपलोड हो रहा है...' : 'फोटो बदलें'}
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
          </label>
          {form.photo_url && (
            <button
              onClick={() => setForm((f) => ({ ...f, photo_url: '' }))}
              className="text-red-500 text-xs font-semibold"
            >
              फोटो हटाएं
            </button>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-600 mb-1">दुकान/व्यवसाय का नाम</label>
          <input
            className="input-field"
            value={form.business_name}
            onChange={(e) => setForm({ ...form, business_name: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-600 mb-1">आपका नाम</label>
          <input
            className="input-field"
            value={form.owner_name}
            onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-600 mb-1">मोबाइल नंबर</label>
          <input
            className="input-field"
            value={form.phone}
            inputMode="numeric"
            onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
          />
        </div>

        <button onClick={handleSave} disabled={saving} className="btn-primary w-full mt-2">
          {saving ? 'सेव हो रहा है...' : 'सेव करें'}
        </button>
        {savedMsg && <p className="text-center text-sm font-bold text-kisan">{savedMsg}</p>}
      </div>
    </div>
  )
}
