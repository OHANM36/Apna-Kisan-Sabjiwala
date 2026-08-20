import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const SEEN_KEY = 'aks_welcome_popup_seen_date'

export default function WelcomePopup() {
  const [popup, setPopup] = useState(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    loadPopup()
  }, [])

  async function loadPopup() {
    const { data } = await supabase.from('welcome_popup').select('*').eq('id', 1).maybeSingle()
    if (!data || !data.is_active) return

    const today = new Date().toISOString().slice(0, 10)
    const lastSeen = localStorage.getItem(SEEN_KEY)
    if (lastSeen === today) return // आज पहले ही दिख चुका है

    setPopup(data)
    setVisible(true)
  }

  function handleClose() {
    setVisible(false)
    localStorage.setItem(SEEN_KEY, new Date().toISOString().slice(0, 10))
  }

  if (!visible || !popup) return null

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-5" onClick={handleClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {popup.image_url && (
          <img src={popup.image_url} alt="" className="w-full h-40 object-cover" />
        )}
        <div className="p-6 text-center">
          {!popup.image_url && <span className="text-5xl block mb-3">🥬</span>}
          <h2 className="font-extrabold text-lg text-gray-800 mb-2">{popup.title}</h2>
          <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{popup.message}</p>
          <button onClick={handleClose} className="btn-primary w-full mt-5">
            {popup.button_text || 'ठीक है'}
          </button>
        </div>
      </div>
    </div>
  )
}
