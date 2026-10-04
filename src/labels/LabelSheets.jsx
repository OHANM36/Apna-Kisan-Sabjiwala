import { Fragment } from 'react'
import {
  addressParts, deliveryText, paginate, paymentBadge, shortNumber, templateLayout,
} from './labelLogic.js'

// QR का SVG (vector — प्रिंट में तीखा रहता है)। qrSvg: स्ट्रिंग | null (बनाने में गड़बड़ी)
function Qr({ svg, show }) {
  if (!show) return null
  return (
    <div className="lbl-qr">
      {svg ? <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="qr qr-fail">QR ✕</div>}
      <small>SCAN</small>
    </div>
  )
}

function Info({ order, clamp }) {
  const { area, street, cityPin } = addressParts(order)
  const name = String(order.customer_name || '').trim()
  const phone = String(order.customer_phone || '').trim()
  return (
    <div className="lbl-info">
      <div className="lbl-name">{name || <span className="lbl-miss">— नाम नहीं —</span>}</div>
      <div className="lbl-phone">{phone || <span className="lbl-miss">— मोबाइल नहीं —</span>}</div>
      {area && <div className="lbl-area">{area}</div>}
      <div className="lbl-addr" style={{ WebkitLineClamp: area ? clamp : clamp + 1 }}>
        {street || <span className="lbl-miss">— पता नहीं —</span>}
      </div>
      <div className="lbl-city">{cityPin || <span className="lbl-miss">— शहर/पिनकोड नहीं —</span>}</div>
    </div>
  )
}

function Pay({ order, withMeta = true }) {
  const b = paymentBadge(order)
  return (
    <div className={`lbl-pay ${b.kind}`}>
      <span className="lbl-payhead">{b.headline}</span>
      {withMeta && <span className="lbl-meta">{b.note}</span>}
    </div>
  )
}

// आइटम और डिलीवरी का समय — भुगतान-बॉक्स के बाहर एक अलग पतली लाइन में (कटता नहीं)
function MetaLine({ order }) {
  const items = order.order_items?.length
  const when = deliveryText(order)
  const parts = [items != null ? `Items: ${items}` : null, when || null].filter(Boolean)
  if (!parts.length) return null
  return <div className="lbl-metaline">{parts.join('  •  ')}</div>
}

// 75×50 / 100×75 / 80 mm — लोगो, ऑर्डर नंबर, ग्राहक, बैग, QR, भुगतान
function LabelStd({ label, variant, qrSvg, showQr, cut, logoSrc }) {
  const { order, bag, bags } = label
  return (
    <div className={`lbl v-${variant}${cut ? ' cut' : ''}`}>
      <div className="lbl-head">
        {logoSrc && <img className="lbl-logo" src={logoSrc} alt="" />}
        <div className="lbl-brand">Apna Kisan Sabjiwala</div>
        <div className="lbl-bag">BAG {bag}/{bags}</div>
      </div>
      <div className="lbl-orderrow">
        <span className="lbl-no">{shortNumber(order.order_number)}</span>
        <span className="lbl-full">{order.order_number}</span>
      </div>
      <div className="lbl-body">
        <Info order={order} clamp={variant === 'std' ? 2 : 3} />
        <Qr svg={qrSvg} show={showQr} />
      </div>
      <MetaLine order={order} />
      <Pay order={order} />
    </div>
  )
}

// 58 mm थर्मल — छोटा और सीधा: नाम, मोबाइल, इलाका, भुगतान, बैग, QR
function LabelT58({ label, qrSvg, showQr, cut }) {
  const { order, bag, bags } = label
  const { area, street, cityPin } = addressParts(order)
  const name = String(order.customer_name || '').trim()
  const phone = String(order.customer_phone || '').trim()
  return (
    <div className={`lbl v-t58${cut ? ' cut' : ''}`}>
      <div className="t-brand">APNA KISAN SABJIWALA</div>
      <div className="t-no">{shortNumber(order.order_number)}</div>
      <div className="t-full">{order.order_number}</div>
      <div className="lbl-name">{name || <span className="lbl-miss">— नाम नहीं —</span>}</div>
      <div className="lbl-phone">{phone || <span className="lbl-miss">— मोबाइल नहीं —</span>}</div>
      {area && <div className="lbl-area">{area}</div>}
      <div className="lbl-addr" style={{ WebkitLineClamp: area ? 2 : 3 }}>{street}</div>
      <div className="lbl-city">{cityPin}</div>
      <Pay order={order} withMeta={false} />
      <div className="t-bagqr">
        <div className="lbl-bag">BAG {bag}/{bags}</div>
        <Qr svg={qrSvg} show={showQr} />
      </div>
    </div>
  )
}

function OneLabel({ variant, ...rest }) {
  return variant === 't58' ? <LabelT58 {...rest} /> : <LabelStd variant={variant} {...rest} />
}

/**
 * format: FORMATS का एक आइटम; a4Template: A4_TEMPLATES का एक आइटम (सिर्फ़ format.kind === 'sheet' में)
 * labels: buildLabels() की सूची; qrMap: { [orderId]: svgString | null }
 */
export default function LabelSheets({ format, a4Template, labels, qrMap, cutLines, showQr, logoSrc }) {
  const common = (l) => ({ label: l, qrSvg: qrMap[l.order.id] ?? null, showQr, cut: cutLines, logoSrc })

  if (format.kind === 'sheet') {
    const t = a4Template
    const lay = templateLayout(t)
    const pages = paginate(labels, lay.perSheet)
    return (
      <div className="lbl-root">
        {pages.map((page, pi) => (
          <div className="lbl-sheet" key={pi} style={{ paddingLeft: `${lay.offsetX}mm`, paddingTop: `${lay.offsetY}mm` }}>
            <div
              className="lbl-grid"
              style={{
                gridTemplateColumns: `repeat(${t.cols}, ${t.labelW}mm)`,
                gridAutoRows: `${t.labelH}mm`,
                columnGap: `${t.gapX || 0}mm`,
                rowGap: `${t.gapY || 0}mm`,
              }}
            >
              {page.map((l) => (
                <Fragment key={l.key}>
                  <div style={{ width: `${t.labelW}mm`, height: `${t.labelH}mm` }}>
                    <OneLabel variant={t.variant} {...common(l)} />
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // थर्मल / सिंगल-स्टिकर: हर लेबल = एक पन्ना (पन्ने से 0.3mm छोटा, ताकि कोई खाली एक्स्ट्रा पन्ना न बने)
  return (
    <div className="lbl-root">
      {labels.map((l) => (
        <div className="lbl-page" key={l.key} style={{ width: `${format.w}mm`, height: `${format.h - 0.3}mm` }}>
          <OneLabel variant={format.variant} {...common(l)} />
        </div>
      ))}
    </div>
  )
}
