// दो GPS बिंदुओं के बीच सीधी (हवाई) दूरी — Haversine। सड़क की असली दूरी इससे आमतौर पर 20–40% ज़्यादा होती है।
const EARTH_RADIUS_KM = 6371

const rad = (deg) => (deg * Math.PI) / 180

// a, b: { lat, lng } (संख्या या संख्या-जैसी string)। कोई बिंदु अधूरा/गलत हो तो null।
export function distanceKm(a, b) {
  const lat1 = Number(a?.lat), lng1 = Number(a?.lng), lat2 = Number(b?.lat), lng2 = Number(b?.lng)
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null || a.lat === '' || a.lng === '' || b.lat === '' || b.lng === '') return null
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

// 0.45 → "450 मी", 2.43 → "2.4 किमी", 15.8 → "16 किमी"
export function formatDistanceHi(km) {
  if (km == null || !Number.isFinite(km)) return ''
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} मी`
  if (km < 10) return `${(Math.round(km * 10) / 10).toString()} किमी`
  return `${Math.round(km)} किमी`
}

// refs में से point के सबसे पास वाला, अगर maxKm के अंदर हो: { ref, km } वरना null। (ref में lat, lng होने चाहिए)
export function nearestWithin(point, refs, maxKm) {
  let best = null
  for (const ref of refs || []) {
    const km = distanceKm(point, ref)
    if (km != null && km <= maxKm && (!best || km < best.km)) best = { ref, km }
  }
  return best
}
