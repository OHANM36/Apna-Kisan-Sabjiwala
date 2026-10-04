// लेबल छापने के दो सहायक: QR (vector SVG) बनाना और छिपे iframe से ब्राउज़र-प्रिंट खोलना।
// iframe इसलिए: ऐप का साइडबार/हेडर/Tailwind छपाई में घुस नहीं सकता, @page का आकार ऐप के CSS से नहीं टकराता,
// और पॉप-अप ब्लॉकर का झंझट नहीं (नई विंडो नहीं खुलती)।

let qrModule = null
async function loadQr() {
  if (!qrModule) {
    const m = await import('qrcode')
    qrModule = m.default || m
  }
  return qrModule
}

// text → SVG स्ट्रिंग (margin 0; शांत-क्षेत्र CSS से आता है)। विफल होने पर null — बाकी लेबल फिर भी बनते हैं।
export async function makeQrSvg(text) {
  try {
    const QR = await loadQr()
    return await QR.toString(text, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
  } catch {
    return null
  }
}

function absolutize(html) {
  // ऐप के हैश वाले लोगो (/assets/logo-xxxx.png) को iframe में भी चलने वाला पूरा URL बनाओ
  return html.replace(/(<img[^>]*\ssrc=")(\/[^"]*)"/g, (_m, a, p) => `${a}${window.location.origin}${p}"`)
}

/**
 * html: छपने वाला मार्कअप, css: print CSS (@page सहित)।
 * सफल होने पर Promise resolve; iframe न बन पाए/प्रिंट न खुले तो reject (Error.message हिंदी में)।
 * "प्रिंट रद्द" ब्राउज़र पता नहीं चलने देते — वह कोई गड़बड़ी नहीं मानी जाती।
 */
export function printHtml(html, css, title = 'AKS Labels') {
  return new Promise((resolve, reject) => {
    let iframe
    try {
      iframe = document.createElement('iframe')
      iframe.setAttribute('aria-hidden', 'true')
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
      document.body.appendChild(iframe)
      const doc = iframe.contentWindow.document
      doc.open()
      doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${css}</style></head><body>${absolutize(html)}</body></html>`)
      doc.close()
    } catch {
      iframe?.remove()
      reject(new Error('प्रिंट विंडो नहीं बन सकी। दोबारा कोशिश करें।'))
      return
    }

    const win = iframe.contentWindow
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      iframe.remove()
    }
    win.addEventListener('afterprint', () => setTimeout(cleanup, 500))
    setTimeout(cleanup, 5 * 60 * 1000) // मोबाइल पर afterprint हमेशा नहीं आता

    // लोगो आदि लोड हो जाएँ, फिर प्रिंट (ज़्यादा से ज़्यादा 2 सेकंड इंतज़ार)
    const imgs = Array.from(win.document.images || [])
    const ready = Promise.all(imgs.map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r }))))
    Promise.race([ready, new Promise((r) => setTimeout(r, 2000))]).then(() => {
      try {
        win.focus()
        win.print()
        resolve()
      } catch {
        cleanup()
        reject(new Error('ब्राउज़र ने प्रिंट नहीं खोला। पॉप-अप/प्रिंट की अनुमति जाँचें।'))
      }
    })
  })
}
