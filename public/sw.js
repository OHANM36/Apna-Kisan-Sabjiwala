// सरल service worker: ऐप इंस्टॉल होने लायक बनाता है और ऑफ़लाइन होने पर होम-शेल दिखाता है।
// सिर्फ़ इसी साइट के GET अनुरोध छूता है — Supabase/Razorpay/API कॉल कभी cache नहीं होते।
const CACHE = 'aks-shell-v2'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/icon-192.png', '/badge-96.png'])).then(() => self.skipWaiting()))
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

// ---- Web Push: ऐप बंद होने पर भी सूचना (एडमिन: नया ऑर्डर; ग्राहक: ऑर्डर की स्थिति बदली) ----
self.addEventListener('push', (e) => {
  let data = {}
  try {
    data = e.data ? e.data.json() : {}
  } catch {
    data = { body: e.data ? e.data.text() : '' }
  }
  e.waitUntil(
    self.registration.showNotification(data.title || 'नया ऑर्डर आया', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/badge-96.png', // छोटा सफ़ेद-पारदर्शी आइकन (स्टेटस बार/सूचना के ऊपर); रंगीन लोगो यहाँ चौकोर दिखता है
      tag: data.tag || 'new-order',
      renotify: true,
      requireInteraction: data.sticky !== false, // एडमिन की सूचना टिकी रहती है; ग्राहक की (sticky:false) अपने-आप हट सकती है
      vibrate: [200, 100, 200, 100, 200],
      data: { url: data.url || '/admin/orders' }, // एडमिन payload में url नहीं भी हो तो यही खुलेगा
    }),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of list) {
        if ('focus' in c) {
          await c.focus()
          try { if ('navigate' in c) await c.navigate(url) } catch { /* ignore */ }
          return
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url)
    })(),
  )
})
