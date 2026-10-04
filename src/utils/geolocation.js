import { bi, currentLanguage } from './translations.js'
/**
 * ब्राउज़र की GPS लोकेशन लेकर पते में बदलता है (OpenStreetMap Nominatim - मुफ़्त, बिना API key)
 */
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(bi('इस डिवाइस/ब्राउज़र में लोकेशन सुविधा उपलब्ध नहीं है।', 'Location is not available on this device/browser.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(bi('लोकेशन की अनुमति नहीं दी गई। कृपया ब्राउज़र सेटिंग में लोकेशन को अनुमति दें।', 'Location permission was denied. Please allow location in your browser settings.'))
        } else {
          reject(bi('आपकी लोकेशन नहीं मिल सकी। कृपया दोबारा प्रयास करें।', 'Could not get your location. Please try again.'))
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  })
}

export async function reverseGeocode(lat, lng) {
  // पता ग्राहक की चुनी भाषा में मांगें (English मोड में English नाम, वरना हिंदी; जहाँ नाम उपलब्ध न हो वहाँ दूसरी भाषा)
  const lang = currentLanguage() === 'en' ? 'en' : 'hi,en'
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=${encodeURIComponent(lang)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('पता नहीं मिल सका')
  const data = await res.json()
  const a = data.address || {}

  const mohalla = a.suburb || a.neighbourhood || a.city_district || ''
  const city = a.city || a.town || a.village || a.county || ''
  const pincode = a.postcode || ''

  let fullAddress = [a.house_number, a.road || a.neighbourhood].filter(Boolean).join(', ')
  if (!fullAddress && data.display_name) {
    // सड़क/मकान का नाम न मिलने पर पूरा display_name लौटता है — उसमें राज्य/देश/पिन और वे हिस्से हटाएँ
    // जो मोहल्ला/शहर/पिनकोड के अलग खानों में पहले से भरे हैं (दोहराव और भाषा-मिलावट कम)
    const drop = new Set([a.state, a.country, a.postcode, mohalla, city].filter(Boolean))
    fullAddress = data.display_name.split(', ').filter((part) => !drop.has(part)).join(', ')
  }

  return { fullAddress, mohalla, city, pincode }
}

/**
 * एक ही फंक्शन में: लोकेशन लें + पता निकालें
 */
export async function getCurrentLocationAddress() {
  const { lat, lng } = await getCurrentPosition()
  const address = await reverseGeocode(lat, lng)
  return { ...address, lat, lng }
}

/**
 * क्या यह एक असली GPS निर्देशांक है? (checkout में लोकेशन अनिवार्य है)
 * null/खाली/टेक्स्ट/सीमा से बाहर/(0,0) — सब अमान्य। ध्यान: Number(null) === 0 होता है, इसलिए सिर्फ़ असली संख्या मानी जाती है।
 */
export function hasValidLocation(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false
  if (lat === 0 && lng === 0) return false
  return true
}
