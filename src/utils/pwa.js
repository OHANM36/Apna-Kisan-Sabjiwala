import { useEffect, useState } from 'react'

// beforeinstallprompt कई बार React माउंट होने से पहले ही आ जाता है, इसलिए यहीं मॉड्यूल-स्तर पर पकड़ते हैं।
let deferredPrompt = null
const listeners = new Set()
const notify = () => listeners.forEach((fn) => fn())

export function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

function isIos() {
  const ua = window.navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) || (ua.includes('Mac') && 'ontouchend' in document)
}

export function initPwa() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* ज़रूरी नहीं — ऐप बिना SW भी चलता है */ })
    })
  }
}

// returns { canInstall, ios, install }
export function usePwaInstall() {
  const [, force] = useState(0)
  useEffect(() => {
    const fn = () => force((n) => n + 1)
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])

  const installed = isStandalone()
  const ios = !installed && isIos()
  const canInstall = !installed && (deferredPrompt !== null || ios)

  async function install() {
    if (!deferredPrompt) return 'ios'
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    deferredPrompt = null
    notify()
    return outcome
  }

  return { canInstall, ios, install }
}
