import { useEffect, useMemo, useRef, useState } from 'react'
import logo from '../assets/logo.png'
import { supabase } from '../supabaseClient'
import LabelSheets from './LabelSheets'
import { labelCss, printDocCss } from './labelCss'
import { makeQrSvg, printHtml } from './printHtml'
import {
  A4_TEMPLATES, DEFAULT_A4_TEMPLATE, DEFAULT_FORMAT, FORMATS, MAX_BAGS, A4,
  bagsOf, buildLabels, getA4Template, getFormat, labelProblems, normalizeBags, sheetsRequired, templateLayout, trackUrl,
} from './labelLogic'

const MM_PX = 96 / 25.4

// सच्चे आकार का प्रीव्यू (mm) — स्क्रीन की चौड़ाई के हिसाब से सिर्फ़ दिखाने के लिए छोटा किया जाता है (zoom); छपाई का आकार नहीं बदलता
function ScaledPreview({ pageWmm, children }) {
  const ref = useRef(null)
  const [scale, setScale] = useState(0.5)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const calc = () => setScale(Math.min(1, Math.max(0.2, (el.clientWidth - 8) / (pageWmm * MM_PX))))
    calc()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(calc)
    ro.observe(el)
    return () => ro.disconnect()
  }, [pageWmm])
  return (
    <div ref={ref} className="w-full overflow-hidden">
      <div style={{ zoom: scale }}>{children}</div>
    </div>
  )
}

export default function LabelPrintDialog({ orders, onClose, onPrinted }) {
  const [formatId, setFormatId] = useState(DEFAULT_FORMAT)
  const [tplId, setTplId] = useState(DEFAULT_A4_TEMPLATE)
  const [bagMap, setBagMap] = useState({})
  const [cutLines, setCutLines] = useState(true)
  const [showQr, setShowQr] = useState(true)
  const [qrMap, setQrMap] = useState({})
  const [printing, setPrinting] = useState(false)
  const [error, setError] = useState('')
  const [savedNote, setSavedNote] = useState('')
  const printRef = useRef(null)

  const format = getFormat(formatId)
  const tpl = getA4Template(tplId)
  const lay = templateLayout(tpl)
  const isSheet = format.kind === 'sheet'

  const labels = useMemo(() => buildLabels(orders, bagMap), [orders, bagMap])
  const perSheet = isSheet ? lay.perSheet : 1
  const sheets = sheetsRequired(labels.length, perSheet)
  const withProblems = useMemo(
    () => orders.map((o) => ({ o, miss: labelProblems(o) })).filter((x) => x.miss.length > 0),
    [orders]
  )
  const qrFailed = showQr && orders.some((o) => o.id in qrMap && qrMap[o.id] === null)

  // हर ऑर्डर का QR एक बार बनता है (उसके सारे बैग-लेबल वही QR दिखाते हैं)
  useEffect(() => {
    if (!showQr) return undefined
    let alive = true
    ;(async () => {
      const todo = orders.filter((o) => !(o.id in qrMap))
      if (!todo.length) return
      const next = {}
      for (const o of todo) next[o.id] = await makeQrSvg(trackUrl(window.location.origin, o))
      if (alive) setQrMap((m) => ({ ...m, ...next }))
    })()
    return () => {
      alive = false
    }
  }, [orders, showQr]) // eslint-disable-line react-hooks/exhaustive-deps

  function setBags(order, v) {
    setBagMap((m) => ({ ...m, [order.id]: normalizeBags(v) }))
  }

  async function doPrint() {
    if (!labels.length || printing) return
    setError('')
    setSavedNote('')
    setPrinting(true)
    try {
      const html = printRef.current?.innerHTML
      if (!html) throw new Error('प्रीव्यू तैयार नहीं है। थोड़ा रुककर दोबारा कोशिश करें।')
      await printHtml(html, printDocCss(format, tpl), 'AKS Labels')
      // सिर्फ़ गिनती/समय (bag_count, label_print_count) सहेजते हैं — ऑर्डर/भुगतान/डिलीवरी की स्थिति को कभी नहीं छूते।
      // विफल हो (जैसे SQL अभी चलाई नहीं गई) तो चुपचाप छोड़ दें: छपाई पर इसका असर नहीं।
      const bagsJson = Object.fromEntries(orders.map((o) => [o.id, bagsOf(o, bagMap)]))
      const { error: e } = await supabase.rpc('admin_record_label_print', { p_order_ids: orders.map((o) => o.id), p_bag_counts: bagsJson })
      if (e) setSavedNote('प्रिंट खुल गया। (बैग/प्रिंट-गिनती सहेजी नहीं जा सकी — shipping_labels.sql चलाई गई है?)')
      else onPrinted?.()
    } catch (e) {
      setError(e?.message || 'प्रिंट शुरू नहीं हो सका।')
    } finally {
      setPrinting(false)
    }
  }

  const btn = 'min-h-[44px] px-4 rounded-xl text-sm font-bold active:scale-95 transition-transform'
  const chip = (on) =>
    `min-h-[44px] px-3 rounded-xl text-sm font-bold border-2 ${on ? 'bg-kisan text-white border-kisan' : 'bg-white text-gray-600 border-gray-200'}`
  const pageWmm = isSheet ? A4.w : format.w

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="लेबल प्रिंट">
      <style>{labelCss()}</style>
      <div className="bg-white w-full sm:max-w-3xl h-[100dvh] sm:h-[92vh] sm:rounded-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="font-extrabold text-lg text-gray-800">🖨 लेबल प्रिंट (Print Shipping Labels)</h2>
          <button type="button" onClick={onClose} className="text-3xl leading-none text-gray-500 px-2" aria-label="बंद करें">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
          {/* फ़ॉर्मेट */}
          <section>
            <p className="text-xs font-bold text-gray-500 mb-2">प्रिंट फ़ॉर्मेट (Print Format)</p>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map((f) => (
                <button key={f.id} type="button" onClick={() => setFormatId(f.id)} className={chip(formatId === f.id)}>{f.name}</button>
              ))}
            </div>
            {isSheet && A4_TEMPLATES.length > 1 && (
              <label className="block mt-3 text-xs font-bold text-gray-500">
                A4 शीट का टेम्पलेट
                <select value={tplId} onChange={(e) => setTplId(e.target.value)} className="mt-1 w-full min-h-[44px] border-2 border-gray-200 rounded-xl px-3 text-sm font-semibold text-gray-700 bg-white">
                  {A4_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
            )}
            <div className="flex flex-wrap gap-4 mt-3">
              {isSheet && (
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 min-h-[44px]">
                  <input type="checkbox" checked={cutLines} onChange={(e) => setCutLines(e.target.checked)} className="w-5 h-5" />
                  कट-लाइन दिखाएँ (Show cut lines)
                </label>
              )}
              {!isSheet && (
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 min-h-[44px]">
                  <input type="checkbox" checked={cutLines} onChange={(e) => setCutLines(e.target.checked)} className="w-5 h-5" />
                  लेबल का बॉर्डर छापें
                </label>
              )}
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 min-h-[44px]">
                <input type="checkbox" checked={showQr} onChange={(e) => setShowQr(e.target.checked)} className="w-5 h-5" />
                QR कोड दिखाएँ (Show QR codes)
              </label>
            </div>
          </section>

          {/* गिनती */}
          <section className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-gray-50 rounded-xl py-2"><p className="text-xl font-extrabold text-gray-800">{orders.length}</p><p className="text-[11px] font-bold text-gray-500">ऑर्डर चुने</p></div>
            <div className="bg-gray-50 rounded-xl py-2"><p className="text-xl font-extrabold text-gray-800">{labels.length}</p><p className="text-[11px] font-bold text-gray-500">कुल लेबल (बैग)</p></div>
            <div className="bg-gray-50 rounded-xl py-2">
              <p className="text-xl font-extrabold text-gray-800">{isSheet ? sheets : labels.length}</p>
              <p className="text-[11px] font-bold text-gray-500">{isSheet ? `A4 शीट (प्रति शीट ${perSheet})` : 'पन्ने (हर लेबल 1)'}</p>
            </div>
          </section>

          {/* बैग */}
          <section>
            <p className="text-xs font-bold text-gray-500 mb-2">बैग की संख्या (Number of Bags) — हर बैग का अलग लेबल</p>
            <div className="border border-gray-100 rounded-xl divide-y divide-gray-100 max-h-56 overflow-y-auto">
              {orders.map((o) => {
                const n = bagsOf(o, bagMap)
                return (
                  <div key={o.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-800 truncate">{o.order_number}</p>
                      <p className="text-xs text-gray-500 truncate">{o.customer_name || '—'}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" aria-label="बैग घटाएँ" disabled={n <= 1} onClick={() => setBags(o, n - 1)} className="w-11 h-11 rounded-xl border-2 border-gray-200 text-xl font-bold disabled:opacity-30">−</button>
                      <input
                        type="number" inputMode="numeric" min={1} max={MAX_BAGS} value={n}
                        onChange={(e) => setBags(o, e.target.value)}
                        aria-label={`${o.order_number} बैग`}
                        className="w-14 h-11 text-center border-2 border-gray-200 rounded-xl font-bold"
                      />
                      <button type="button" aria-label="बैग बढ़ाएँ" disabled={n >= MAX_BAGS} onClick={() => setBags(o, n + 1)} className="w-11 h-11 rounded-xl border-2 border-gray-200 text-xl font-bold disabled:opacity-30">+</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {withProblems.length > 0 && (
            <div role="alert" className="text-xs font-semibold rounded-xl border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2">
              ⚠️ कुछ ऑर्डर में जानकारी खाली है — लेबल पर "नहीं" लिखा आएगा, कुछ नकली नहीं भरा जाएगा:
              <ul className="mt-1 list-disc pl-5">
                {withProblems.slice(0, 6).map(({ o, miss }) => <li key={o.id}>{o.order_number}: {miss.join(', ')}</li>)}
                {withProblems.length > 6 && <li>… और {withProblems.length - 6} ऑर्डर</li>}
              </ul>
            </div>
          )}
          {qrFailed && (
            <div role="alert" className="text-xs font-semibold rounded-xl border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2">
              ⚠️ कुछ ऑर्डर का QR नहीं बन सका — उन लेबलों पर "QR ✕" छपेगा। बाकी लेबल ठीक हैं।
            </div>
          )}

          {/* प्रिंटर सेटिंग */}
          <section className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
            <p className="font-extrabold mb-1">प्रिंट से पहले ब्राउज़र की सेटिंग</p>
            {isSheet ? (
              <ul className="list-disc pl-5 leading-relaxed">
                <li>Paper size: <b>A4</b> • Orientation: <b>Portrait</b></li>
                <li>Scale: <b>100% / Actual size</b> — "Fit to page" कभी नहीं (लेबल का नाप बदल जाता है)</li>
                <li>Margins: <b>None</b> या Default (पन्ना अपना margin खुद तय करता है) • Headers/footers: बंद</li>
                <li>Paper: लेज़र-योग्य A4 सेल्फ़-एडहेसिव स्टिकर शीट • पहले सादे कागज़ पर एक टेस्ट-प्रिंट करें</li>
              </ul>
            ) : (
              <ul className="list-disc pl-5 leading-relaxed">
                <li>Paper size: <b>{format.w} × {format.h} mm</b> (प्रिंटर ड्राइवर में कस्टम साइज़) • Margins: <b>None</b></li>
                <li>Scale: <b>100% / Actual size</b> • Headers/footers: बंद</li>
                <li>हर लेबल एक अलग पन्ना है; थर्मल रोल की लंबाई ड्राइवर में इसी साइज़ पर रखें</li>
              </ul>
            )}
          </section>

          {/* प्रीव्यू */}
          <section>
            <p className="text-xs font-bold text-gray-500 mb-2">
              प्रीव्यू{isSheet ? ` — A4 (${sheets} शीट)` : ` — ${format.name} (${labels.length} लेबल)`}
            </p>
            <div className="bg-gray-100 rounded-xl p-2 lbl-preview">
              <ScaledPreview pageWmm={pageWmm}>
                {/* यही मार्कअप iframe में छपता है — प्रीव्यू और प्रिंट एक जैसे */}
                <div ref={printRef}>
                  <LabelSheets
                    format={format}
                    a4Template={tpl}
                    labels={labels}
                    qrMap={qrMap}
                    cutLines={cutLines}
                    showQr={showQr}
                    logoSrc={logo}
                  />
                </div>
              </ScaledPreview>
            </div>
          </section>

          {error && <p role="alert" className="text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
          {savedNote && <p className="text-xs font-semibold text-gray-600 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">{savedNote}</p>}
        </div>

        <div className="flex gap-3 px-4 py-3 border-t border-gray-100 bg-white" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <button type="button" onClick={onClose} className={`${btn} flex-1 border-2 border-gray-300 text-gray-600`}>बंद करें (Cancel)</button>
          <button type="button" onClick={doPrint} disabled={!labels.length || printing} className={`${btn} flex-[2] bg-kisan text-white disabled:opacity-50`}>
            {printing ? 'खुल रहा है…' : `🖨 प्रिंट करें (${labels.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}
