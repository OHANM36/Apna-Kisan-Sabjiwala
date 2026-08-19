/**
 * ब्राउज़र की GPS लोकेशन लेकर पते में बदलता है (OpenStreetMap Nominatim - मुफ़्त, बिना API key)
 */
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject('इस डिवाइस/ब्राउज़र में लोकेशन सुविधा उपलब्ध नहीं है।')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject('लोकेशन की अनुमति नहीं दी गई। कृपया ब्राउज़र सेटिंग में लोकेशन को अनुमति दें।')
        } else {
          reject('आपकी लोकेशन नहीं मिल सकी। कृपया दोबारा प्रयास करें।')
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  })
}

export async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'hi,en' },
  })
  if (!res.ok) throw new Error('पता नहीं मिल सका')
  const data = await res.json()
  const a = data.address || {}

  const addressParts = [a.house_number, a.road || a.neighbourhood].filter(Boolean)
  const mohalla = a.suburb || a.neighbourhood || a.city_district || ''
  const city = a.city || a.town || a.village || a.county || ''
  const pincode = a.postcode || ''

  return {
    fullAddress: addressParts.join(', ') || data.display_name || '',
    mohalla,
    city,
    pincode,
  }
}

/**
 * एक ही फंक्शन में: लोकेशन लें + पता निकालें
 */
export async function getCurrentLocationAddress() {
  const { lat, lng } = await getCurrentPosition()
  const address = await reverseGeocode(lat, lng)
  return { ...address, lat, lng }
}
