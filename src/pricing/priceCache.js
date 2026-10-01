// ग्राहक: आख़िरी प्रकाशित कीमतों का लोकल कैश — कमज़ोर/बंद इंटरनेट में भी सब्ज़ी-सूची और कीमतें दिखें।
// यहां सिर्फ़ वही डेटा है जो ग्राहक को वैसे भी दिखता है (कोई लागत/मार्जिन नहीं)।
const KEY = 'aks_published_prices_v1'

export function cachePublished(vegetables, categories) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ savedAt: new Date().toISOString(), vegetables, categories }))
  } catch {
    /* स्टोरेज भरा/बंद — कैश वैकल्पिक है */
  }
}

export function readPublishedCache() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null')
    return c && Array.isArray(c.vegetables) ? c : null
  } catch {
    return null
  }
}
