import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import Loading from '../components/Loading'

export default function AdminWelcomePopup() {
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  useEffect(() => {
    loadPopup()
  }, [])

  async function loadPopup() {
    setLoading(true)
    const { data } = await supabase.from('welcome_popup').select('*').eq('id', 1).maybeSingle()
    setForm(
      data || {
        is_active: false,
        title: 'स्वागत है!',
        message: 'अपना किसान सब्ज़ीवाला में आपका स्वागत है — ताज़ी सब्ज़ियाँ अब सीधे आपके घर तक!',
        image_url: '',
        button_text: 'ठीक है',
      }
    )
    setLoading(false)
  }

  async function handleImageUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    const fileName = `popup-${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('vegetable-images').upload(fileName, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('vegetable-images').getPublicUrl(fileName)
      setForm((f) => ({ ...f, image_url: data.publicUrl }))
    } else {
      alert('फोटो अपलोड नहीं हो सकी। कृपया "vegetable-images" नाम का Storage bucket बनाएं (देखें README)।')
    }
    setUploading(false)
  }

  async function handleSave() {
    setSaving(true)
    setSavedMsg('')
    await supabase
      .from('welcome_popup')
      .update({
        is_active: form.is_active,
        title: form.title,
        message: form.message,
        image_url: form.image_url || null,
        button_text: form.button_text || 'ठीक है',
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
    setSaving(false)
    setSavedMsg('✅ सेव हो गया — ग्राहकों को अगली बार ऐप खोलने पर नया संदेश दिखेगा')
  }

  if (loading || !form) return <Loading />

  return (
    <div>
      <h1 className="font-extrabold text-xl text-gray-800 mb-5">स्वागत पॉपअप (Welcome Popup)</h1>
      <p className="text-sm text-gray-500 mb-5">
        यह संदेश ग्राहक जब पहली बार दिन में ऐप खोलेगा तो एक पॉपअप के रूप में दिखेगा। जब चाहें यहां से बदल सकते हैं।
      </p>

      <div className="bg-white rounded-2xl shadow-sm p-5 max-w-lg flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <label className="font-semibold text-gray-700 text-sm">पॉपअप चालू रखें</label>
          <button
            onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
            className={`w-12 h-7 rounded-full transition-colors relative ${form.is_active ? 'bg-kisan' : 'bg-gray-300'}`}
          >
            <span
              className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                form.is_active ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-600 mb-1">शीर्षक (Title)</label>
          <input
            className="input-field"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="जैसे: स्वागत है!"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-600 mb-1">संदेश (Message)</label>
          <textarea
            className="input-field"
            rows={4}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder="ग्राहकों को दिखाने वाला संदेश यहां लिखें"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-600 mb-1">बटन का टेक्स्ट</label>
          <input
            className="input-field"
            value={form.button_text}
            onChange={(e) => setForm({ ...form, button_text: e.target.value })}
            placeholder="ठीक है"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-600 mb-1">फोटो (वैकल्पिक)</label>
          <input type="file" accept="image/*" onChange={handleImageUpload} className="text-sm" />
          {uploading && <p className="text-xs text-gray-500 mt-1">अपलोड हो रहा है...</p>}
          {form.image_url && (
            <div className="flex items-center gap-2 mt-2">
              <img src={form.image_url} alt="" className="w-20 h-14 rounded-lg object-cover" />
              <button
                onClick={() => setForm((f) => ({ ...f, image_url: '' }))}
                className="text-red-500 text-xs font-semibold"
              >
                फोटो हटाएं
              </button>
            </div>
          )}
        </div>

        <button onClick={handleSave} disabled={saving} className="btn-primary w-full mt-2">
          {saving ? 'सेव हो रहा है...' : 'सेव करें'}
        </button>
        {savedMsg && <p className="text-kisan font-bold text-sm text-center">{savedMsg}</p>}
      </div>

      <div className="mt-6 max-w-lg">
        <p className="text-xs font-semibold text-gray-500 mb-2">पूर्वावलोकन (Preview)</p>
        <div className="bg-gray-100 rounded-2xl p-6 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-lg w-full max-w-xs overflow-hidden">
            {form.image_url && <img src={form.image_url} alt="" className="w-full h-28 object-cover" />}
            <div className="p-5 text-center">
              {!form.image_url && <span className="text-4xl block mb-2">🥬</span>}
              <h3 className="font-extrabold text-gray-800 mb-1">{form.title}</h3>
              <p className="text-gray-600 text-xs whitespace-pre-line">{form.message}</p>
              <div className="btn-primary w-full mt-3 !py-2 !text-sm">{form.button_text || 'ठीक है'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
