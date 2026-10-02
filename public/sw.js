// सरल service worker: ऐप इंस्टॉल होने लायक बनाता है और ऑफ़लाइन होने पर होम-शेल दिखाता है।
// सिर्फ़ इसी साइट के GET अनुरोध छूता है — Supabase/Razorpay/API कॉल कभी cache नहीं होते।
const CACHE = 'aks-shell-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/icon-192.png'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  // पेज खोलना: पहले नेटवर्क, न चले तो सेव किया हुआ शेल
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/')))
    return
  }

  // स्थिर फ़ाइलें (hash वाली JS/CSS, आइकन): cache से दिखाओ, पीछे अपडेट करो
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
        return res
      }).catch(() => hit)
      return hit || net
    }),
  )
})
