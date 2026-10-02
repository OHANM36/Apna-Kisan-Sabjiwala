import { useEffect, useState } from 'react'

// दुकान के UPI ID का QR (राशि और ऑर्डर नंबर पहले से भरे हुए) — ग्राहक किसी भी UPI ऐप से स्कैन करके दे सकता है।
// QR बनाने वाली लाइब्रेरी सिर्फ़ तभी डाउनलोड होती है जब QR सच में दिखाना हो।
export function buildUpiLink({ upiId, name, amount, note }) {
  // pa (UPI ID) में सिर्फ़ अक्षर/अंक/. _ - @ होते हैं, इसलिए वैसे ही; pn/tn में %20 (कई UPI ऐप '+' को स्पेस नहीं मानते)
  const enc = (v, max) => encodeURIComponent(String(v).slice(0, max))
  let link = `upi://pay?pa=${upiId}&pn=${enc(name || 'Apna Kisan Sabjiwala', 40)}&am=${Number(amount).toFixed(2)}&cu=INR`
  if (note) link += `&tn=${enc(note, 40)}`
  return link
}

export default function UpiQr({ link, size = 240 }) {
  const [src, setSrc] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setSrc('')
    setFailed(false)
    import('qrcode')
      .then((m) => (m.default || m).toDataURL(link, { width: size * 2, margin: 1, errorCorrectionLevel: 'M' }))
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [link, size])

  if (failed) return <p className="text-sm text-red-600 font-semibold text-center">QR नहीं बन सका — UPI ID से सीधे पेमेंट लें।</p>
  if (!src) return <div className="bg-gray-200 rounded-xl animate-pulse mx-auto" style={{ width: size, height: size }} aria-label="QR बन रहा है" />
  return <img src={src} alt="UPI QR कोड" width={size} height={size} className="mx-auto rounded-xl border border-gray-200" />
}
