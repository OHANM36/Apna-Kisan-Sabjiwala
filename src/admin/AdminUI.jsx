// एडमिन के साझा, हल्के UI कंपोनेंट. स्टाइल index.css के .admin-* क्लासेस में हैं।
import { useEffect, useRef } from 'react'
import Icon from './AdminIcons'

/** पेज का शीर्षक. (ऐप बार में पेज का नाम पहले से दिखता है, इसलिए यहाँ उपशीर्षक + वैकल्पिक एक्शन) */
export function AdminPageHeader({ title, subtitle, action }) {
  return (
    <div className="admin-page-header">
      <div className="min-w-0">
        <h2 className="admin-page-title">{title}</h2>
        {subtitle && <p className="admin-page-sub">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function AdminCard({ as: Tag = 'div', className = '', children, ...rest }) {
  return (
    <Tag className={`admin-card ${className}`} {...rest}>
      {children}
    </Tag>
  )
}

const TONES = {
  green: 'admin-tone-green',
  blue: 'admin-tone-blue',
  red: 'admin-tone-red',
  amber: 'admin-tone-amber',
}

/** छोटा आँकड़ा-कार्ड: बड़ा मान, छोटा लेबल, हल्के रंग का आइकन */
export function AdminStatCard({ label, value, icon, tone = 'green', featured = false, className = '' }) {
  return (
    <div className={`admin-stat ${featured ? 'is-featured' : ''} ${className}`}>
      <span className={`admin-stat-ico ${TONES[tone] || TONES.green}`}>
        <Icon name={icon} size={featured ? 22 : 18} />
      </span>
      <div className="min-w-0">
        <p className="admin-stat-label">{label}</p>
        <p className="admin-stat-value">{value}</p>
      </div>
    </div>
  )
}

/** ऑर्डर की स्थिति का बैज — हमेशा टेक्स्ट के साथ (सिर्फ़ रंग पर निर्भर नहीं) */
export function AdminStatusBadge({ label, tone = '' }) {
  return <span className={`admin-status-badge border ${tone}`}>{label}</span>
}

export function AdminEmptyState({ icon = 'orders', text, action }) {
  return (
    <div className="admin-empty">
      <span className="admin-empty-ico"><Icon name={icon} size={22} /></span>
      <p>{text}</p>
      {action}
    </div>
  )
}

// स्थिति-वर्ग के छोटे नाम (चिप/टाइल पर)
export const STAGE_SHORT = {
  new: { hi: 'नए', en: 'New' },
  prep: { hi: 'तैयारी', en: 'Prep' },
  transit: { hi: 'रास्ते में', en: 'On way' },
  done: { hi: 'पूरे', en: 'Done' },
  cancelled: { hi: 'रद्द', en: 'Cancelled' },
}

/** एक जैसा सर्च बार: बायाँ आइकन, टेक्स्ट होने पर साफ़ करने का बटन */
export function AdminSearchBar({ value, onChange, placeholder, clearLabel = 'Clear', className = '' }) {
  return (
    <div className={`admin-search ${className}`}>
      <Icon name="search" size={19} className="admin-search-ico" />
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label={clearLabel} className="admin-search-clear">
          <Icon name="close" size={18} />
        </button>
      )}
    </div>
  )
}

/**
 * मोबाइल पर नीचे से खुलने वाली शीट (डेस्कटॉप पर बीच का डायलॉग).
 * parent इसे शर्त से रेंडर करता है (खुला हो तभी). footer हमेशा नीचे चिपका रहता है।
 * dismissible=false हो तो बाहर टैप/ESC से बंद नहीं होती (जैसे काम चलते समय).
 */
export function AdminBottomSheet({ title, onClose, children, footer, dismissible = true, labelId = 'admin-sheet-title', closeLabel = 'Close' }) {
  const ref = useRef(null)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
  useEffect(() => {
    if (!dismissible) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dismissible, onClose])

  return (
    <div className="ab-back" onClick={dismissible ? onClose : undefined}>
      <div
        ref={ref}
        tabIndex={-1}
        className="ab-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ab-grab" aria-hidden="true" />
        <div className="ab-head">
          <h2 id={labelId}>{title}</h2>
          <button type="button" className="admin-icon-btn" onClick={onClose} disabled={!dismissible} aria-label={closeLabel}>
            <Icon name="close" />
          </button>
        </div>
        <div className="ab-body">{children}</div>
        {footer && <div className="ab-foot">{footer}</div>}
      </div>
    </div>
  )
}
