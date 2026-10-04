import { A4 } from './labelLogic.js'

// लेबल का CSS — प्रीव्यू और असली प्रिंट (iframe) में एक ही। सारी माप mm/pt में (px नहीं), रंग सिर्फ़ काला/सफ़ेद।
// अंदर के सारे साइज़ em में हैं; हर वैरिएंट सिर्फ़ root font-size बदलता है, इसलिए एक ही बनावट हर आकार पर चलती है।
export function labelCss() {
  return `
.lbl-root{font-family:'Mukta','Noto Sans Devanagari','Noto Sans',system-ui,-apple-system,'Segoe UI',Arial,sans-serif;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.lbl-root *{box-sizing:border-box;margin:0;padding:0}
.lbl-sheet{position:relative;width:${A4.w}mm;height:${A4.sheetH}mm;overflow:hidden;background:#fff;break-after:page;page-break-after:always}
.lbl-sheet:last-child,.lbl-page:last-child{break-after:auto;page-break-after:auto}
.lbl-grid{display:grid}
.lbl-page{overflow:hidden;background:#fff;break-after:page;page-break-after:always}

.lbl{width:100%;height:100%;overflow:hidden;background:#fff;padding:2mm;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;row-gap:.5mm;line-height:1.2;break-inside:avoid;page-break-inside:avoid}
.lbl.cut{outline:.15mm solid #000}
.v-std{font-size:7.5pt}
.v-large{font-size:10pt}
.v-t80{font-size:9.5pt}

.lbl-head{display:flex;align-items:center;gap:1.2mm;min-width:0}
.lbl-logo{height:2.7em;width:2.7em;object-fit:cover;border-radius:50%;filter:grayscale(1) contrast(1.5);flex:none}
.lbl-brand{flex:1;min-width:0;font-weight:800;font-size:.95em;letter-spacing:.02em;line-height:1.1;text-transform:uppercase}
.lbl-bag{flex:none;border:.5mm solid #000;padding:.25em .6em;font-weight:900;font-size:1.5em;line-height:1.1;white-space:nowrap;text-align:center}

.lbl-orderrow{display:flex;align-items:baseline;justify-content:space-between;gap:1mm;border-bottom:.25mm solid #000;padding-bottom:.2mm}
.lbl-no{font-weight:900;font-size:2.4em;line-height:1;letter-spacing:.01em}
.lbl-full{font-size:.85em;font-weight:700;white-space:nowrap}

.lbl-body{display:flex;gap:1.5mm;min-height:0;overflow:hidden}
.lbl-info{flex:1;min-width:0;overflow:hidden}
.lbl-name{font-weight:800;font-size:1.3em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lbl-phone{font-weight:800;font-size:1.25em;letter-spacing:.02em;white-space:nowrap}
.lbl-area{font-weight:800;font-size:1.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lbl-addr{font-size:1em;overflow:hidden;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical}
.lbl-city{font-weight:800;font-size:1em;white-space:nowrap}
.lbl-miss{font-weight:700;font-style:italic}

.lbl-qr{flex:none;display:flex;flex-direction:column;align-items:center;justify-content:flex-start}
.lbl-qr .qr{width:7.55em;height:7.55em;background:#fff;padding:.25em;border:.2mm solid #000}
.lbl-qr .qr svg{display:block;width:100%;height:100%}
.lbl-qr .qr-fail{display:flex;align-items:center;justify-content:center;text-align:center;font-weight:800;font-size:.8em}
.lbl-qr small{font-size:.7em;font-weight:700;margin-top:.2em;text-align:center}

.lbl-pay{display:flex;align-items:center;justify-content:space-between;gap:1.5mm;padding:.35em .7em;min-height:2.6em}
.lbl-pay.cod{border:.6mm solid #000}
.lbl-pay.paid{border:.9mm double #000}
.lbl-pay.unpaid{border:.5mm dashed #000}
.lbl-payhead{font-weight:900;font-size:1.75em;line-height:1;white-space:nowrap}
.lbl-meta{text-align:right;font-size:.85em;font-weight:700;line-height:1.15;min-width:0;overflow:hidden;max-height:2.4em}

/* 58 mm: छोटा, सिर्फ़ ज़रूरी जानकारी, ऊपर से नीचे */
.v-t58{font-size:9pt;display:flex;flex-direction:column;gap:.4mm;padding:2mm 1.5mm}
.v-t58 .t-brand{text-align:center;font-weight:900;font-size:1em;letter-spacing:.03em;border-bottom:.3mm solid #000;padding-bottom:.4mm}
.v-t58 .t-no{text-align:center;font-weight:900;font-size:2.9em;line-height:1}
.v-t58 .t-full{text-align:center;font-size:.8em;font-weight:700}
.v-t58 .lbl-name{font-size:1.2em}
.v-t58 .lbl-phone{font-size:1.2em}
.v-t58 .lbl-addr{-webkit-line-clamp:3}
.v-t58 .lbl-pay{justify-content:center;text-align:center;margin-top:.4mm}
.v-t58 .lbl-payhead{font-size:1.8em}
.v-t58 .t-bagqr{display:flex;align-items:center;justify-content:space-between;gap:1.5mm;margin-top:.4mm}
.v-t58 .lbl-bag{font-size:1.6em}
.v-t58 .lbl-qr .qr{width:6.7em;height:6.7em}

/* स्क्रीन-प्रीव्यू: पन्ने की सीमा दिखे (प्रिंट में यह नहीं आता क्योंकि .lbl-preview सिर्फ़ ऐप में है) */
.lbl-preview .lbl-sheet,.lbl-preview .lbl-page{box-shadow:0 0 0 1px #cbd5e1,0 2px 8px rgba(0,0,0,.25);margin:0 auto 14px}
`
}

// असली प्रिंट-विंडो (iframe) का पूरा CSS: पन्ने का आकार + margin:0
export function pageCss(format, a4Template) {
  if (format.kind === 'sheet') return `@page{size:A4 portrait;margin:0}`
  return `@page{size:${format.w}mm ${format.h}mm;margin:0}`
}

export function printDocCss(format, a4Template) {
  return `${pageCss(format, a4Template)}
html,body{margin:0;padding:0;background:#fff}
${labelCss()}`
}
