import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useCart } from '../context/CartContext'
import { formatRupee } from '../utils/format'
import { safeSet } from '../utils/safeStorage'
import { useLanguage } from '../context/LanguageContext'
import { translateUnitText } from '../utils/translations'

// तय संदेश key से रखे जाते हैं (text से नहीं), ताकि भाषा बदलते ही वे नई भाषा में दिखें
const GREETING = { role: 'ai', key: 'ai_greeting' }

export default function AIOrderAssistant() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([GREETING])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [draftItems, setDraftItems] = useState([]) // अब तक कन्फर्म हुए (पर कार्ट में अभी नहीं डाले) आइटम
  const [listening, setListening] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const scrollRef = useRef(null)
  const { addToCart } = useCart()
  const { t, language } = useLanguage()
  const navigate = useNavigate()

  useEffect(() => {
    // Google Cloud Speech-to-Text के लिए ब्राउज़र की माइक रिकॉर्डिंग सुविधा (MediaRecorder) चाहिए
    setVoiceSupported(!!(navigator.mediaDevices && window.MediaRecorder))
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  async function handleMicClick() {
    if (listening) {
      mediaRecorderRef.current?.stop()
      setListening(false)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' })
        await transcribeAudio(blob)
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setListening(true)
    } catch (err) {
      console.error(err)
      setMessages((prev) => [
        ...prev,
        { role: 'ai', key: 'ai_err_mic' },
      ])
    }
  }

  async function transcribeAudio(blob) {
    setTranscribing(true)
    try {
      const base64 = await blobToBase64(blob)
      const { data, error } = await supabase.functions.invoke('speech-to-text', {
        body: { audio_base64: base64, language },
      })
      if (error) throw error
      if (data.error) {
        setMessages((prev) => [...prev, { role: 'ai', text: data.error }])
      } else if (data.transcript) {
        setInput(data.transcript)
      }
    } catch (err) {
      console.error(err)
      setMessages((prev) => [...prev, { role: 'ai', key: 'ai_err_voice' }])
    } finally {
      setTranscribing(false)
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        // data:audio/webm;base64,XXXX  में से सिर्फ base64 हिस्सा चाहिए
        const base64 = reader.result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  async function handleSend(e) {
    e?.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    setMessages((prev) => [...prev, { role: 'user', text }])
    setInput('')
    setLoading(true)

    try {
      const { data, error } = await supabase.functions.invoke('parse-order', {
        body: { message: text, language },
      })

      if (error) throw error
      if (data.error) {
        setMessages((prev) => [...prev, { role: 'ai', text: data.error }])
        setLoading(false)
        return
      }

      if (data.items && data.items.length > 0) {
        setDraftItems((prev) => mergeItems(prev, data.items))
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: data.reply_hindi,
          clarification: data.clarification_needed,
          unmatched: data.unmatched,
        },
      ])
    } catch (err) {
      console.error(err)
      setMessages((prev) => [
        ...prev,
        { role: 'ai', key: 'ai_err_generic' },
      ])
    } finally {
      setLoading(false)
    }
  }

  function mergeItems(existing, incoming) {
    const merged = [...existing]
    incoming.forEach((newItem) => {
      const idx = merged.findIndex((i) => i.vegetable_id === newItem.vegetable_id)
      if (idx >= 0) {
        merged[idx] = newItem // वही सब्ज़ी दोबारा बोली गई — नई मात्रा से बदल दें
      } else {
        merged.push(newItem)
      }
    })
    return merged
  }

  function removeDraftItem(vegId) {
    setDraftItems((prev) => prev.filter((i) => i.vegetable_id !== vegId))
  }

  function handleConfirmOrder() {
    if (draftItems.length === 0) return
    draftItems.forEach((item) => {
      // कार्ट-मॉडल = प्रति-इकाई कीमत × मात्रा (वही जो नॉर्मल कार्ट में है), इसलिए cartSync कीमत "सुधारकर"
      // 5 किलो को 1 इकाई की कीमत पर नहीं गिराता (पहले ₹150 का कार्ट खुलते ही ₹30 हो जाता था)।
      // tier मेल खाए तो वही id-फ़ॉर्मैट जो VegetableCard इस्तेमाल करता है: <vegId>::<qty>-<unit>
      const isTier = item.tier_qty != null && item.tier_unit
      addToCart(
        {
          id: isTier ? `${item.vegetable_id}::${item.tier_qty}-${item.tier_unit}` : item.vegetable_id,
          vegetableId: item.vegetable_id,
          sellerId: item.seller_id || null,
          sellerName: item.seller_name || null,
          name: item.name,
          name_en: item.name_en || null,
          price: item.unit_price,
          unit: item.unit,
          emoji: '🥬',
        },
        item.base_quantity
      )
    })
    safeSet('aks_order_source', 'AI सहायक', 'session')
    setOpen(false)
    navigate('/cart')
  }

  function handleCancel() {
    setDraftItems([])
    setMessages((prev) => [...prev, { role: 'ai', key: 'ai_cancelled' }])
  }

  const draftTotal = draftItems.reduce((s, i) => s + i.item_total, 0)

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-36 z-40 bg-kisan-dark text-white pl-3 pr-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 active:scale-95 transition-transform"
        >
          <span className="text-lg">🤖</span>
          <span className="text-xs font-bold">{t('ai_btn')}</span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center md:justify-center">
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md h-[85vh] md:h-[600px] flex flex-col">
            {/* हेडर */}
            <div className="bg-kisan-dark text-white px-4 py-3 rounded-t-2xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🤖</span>
                <div>
                  <p className="font-display font-bold text-sm leading-tight">{t('ai_title')}</p>
                  <p className="text-[10px] text-green-200">{t('ai_subtitle')}</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="text-white text-2xl leading-none">×</button>
            </div>

            {/* चैट मैसेज */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2 bg-kisan-bg">
              {messages.map((m, idx) => (
                <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      m.role === 'user' ? 'bg-kisan text-white' : 'bg-white text-kisan-ink border border-kisan-crate'
                    }`}
                  >
                    {m.key ? t(m.key) : m.text}
                    {m.unmatched && m.unmatched.length > 0 && (
                      <div className="mt-1 text-xs text-kisan-tomato">
                        {m.unmatched.map((u, i) => (
                          <p key={i}>⚠️ {u.spoken_text}: {u.reason}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-kisan-crate rounded-2xl px-3 py-2 text-sm text-gray-400">
                    {t('ai_thinking')}
                  </div>
                </div>
              )}
            </div>

            {/* ड्राफ्ट ऑर्डर सारांश */}
            {draftItems.length > 0 && (
              <div className="border-t border-kisan-crate bg-white px-3 py-2 max-h-40 overflow-y-auto">
                <p className="text-xs font-bold text-gray-500 mb-1">{t('ai_your_order')}</p>
                {draftItems.map((item) => (
                  <div key={item.vegetable_id} className="flex justify-between items-center text-xs py-1">
                    <span className="text-gray-700">{language === 'en' && item.name_en ? item.name_en : item.name} — {translateUnitText(item.rate_label, language)}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-bold text-kisan">{formatRupee(item.item_total)}</span>
                      <button onClick={() => removeDraftItem(item.vegetable_id)} className="text-red-400 font-bold">×</button>
                    </span>
                  </div>
                ))}
                <div className="flex justify-between items-center text-sm font-bold border-t border-dashed border-kisan-crate mt-1 pt-1">
                  <span>{t('ai_total')}</span>
                  <span className="text-kisan">{formatRupee(draftTotal)}</span>
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={handleCancel} className="flex-1 text-xs font-bold text-red-500 border-2 border-red-200 rounded-xl py-1.5">
                    {t('ai_cancel')}
                  </button>
                  <button onClick={handleConfirmOrder} className="flex-1 text-xs font-bold bg-kisan text-white rounded-xl py-1.5">
                    {t('ai_confirm')}
                  </button>
                </div>
              </div>
            )}

            {/* इनपुट */}
            <form onSubmit={handleSend} className="border-t border-kisan-crate p-2.5 flex items-center gap-2 safe-bottom">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={listening ? t('ai_ph_listening') : transcribing ? t('ai_ph_transcribing') : t('ai_ph_idle')}
                disabled={transcribing}
                className="flex-1 border-2 border-kisan-crate rounded-full px-4 py-2 text-sm focus:border-kisan focus:outline-none disabled:opacity-60"
              />
              {voiceSupported && (
                <button
                  type="button"
                  onClick={handleMicClick}
                  disabled={transcribing}
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 disabled:opacity-50 ${
                    listening ? 'bg-kisan-tomato text-white animate-pulse' : 'bg-kisan-crate text-kisan-ink'
                  }`}
                >
                  {transcribing ? '⏳' : '🎤'}
                </button>
              )}
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="w-10 h-10 rounded-full bg-kisan text-white flex items-center justify-center shrink-0 disabled:opacity-40"
              >
                ➤
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
