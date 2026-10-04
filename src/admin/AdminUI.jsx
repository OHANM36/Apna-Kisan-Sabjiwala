// एडमिन के साझा, हल्के UI कंपोनेंट. स्टाइल index.css के .admin-* क्लासेस में हैं।
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
