import { useEffect, useState, useCallback, useRef, useMemo, Suspense } from 'react'
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAdminAuth } from '../context/AdminAuthContext'
import { supabase } from '../supabaseClient'
import { playNewOrderSound, playStatusChangeSound, unlockSounds } from '../utils/sounds'
import AdminToastList from '../components/AdminToastList'
import AdminPushCard from './AdminPushCard'
import { useLanguage } from '../context/LanguageContext'
import { usePT } from '../pricing/strings'
import { PendingSyncBanner } from '../pricing/ui/common'
import logo from '../assets/logo.png'
import { AdminShellSkeleton, PageSkeleton } from '../components/Skeleton'
import Icon from './AdminIcons'

const L = (hi, en) => ({ hi, en })

// नेविगेशन समूह. ownerOnly और रूट पहले जैसे ही हैं — सिर्फ़ ग्रुपिंग/आइकन बदले हैं।
const GROUPS = [
  {
    id: 'main',
    title: L('मुख्य', 'Main'),
    items: [
      { to: '/admin', label: L('डैशबोर्ड', 'Dashboard'), icon: 'dashboard', end: true },
      { to: '/admin/orders', label: L('ऑर्डर', 'Orders'), icon: 'orders' },
    ],
  },
  {
    id: 'catalog',
    title: L('कैटलॉग', 'Catalog'),
    items: [
      { to: '/admin/vegetables', label: L('सब्ज़ियाँ', 'Vegetables'), icon: 'leaf' },
      { to: '/admin/categories', label: L('श्रेणियाँ', 'Categories'), icon: 'folder' },
      { to: '/admin/stock', labelKey: 'nav_stock', icon: 'stock' },
    ],
  },
  {
    id: 'pricing',
    title: L('कीमतें', 'Pricing'),
    items: [
      { to: '/admin/bulk-edit', label: L('कीमतें बदलें', 'Bulk Price Edit'), icon: 'rupee' },
      { to: '/admin/todays-prices', labelKey: 'nav_todays_prices', icon: 'calendar', ownerOnly: true },
      { to: '/admin/product-pricing', labelKey: 'nav_product_pricing', icon: 'tag', ownerOnly: true },
      { to: '/admin/pricing-dashboard', labelKey: 'nav_pricing_dashboard', icon: 'trend', ownerOnly: true },
    ],
  },
  {
    id: 'people',
    title: L('लोग', 'People'),
    items: [
      { to: '/admin/sellers', label: L('विक्रेता', 'Sellers'), icon: 'store' },
      { to: '/admin/delivery-boys', label: L('डिलीवरी बॉय', 'Delivery Boys'), icon: 'truck' },
      { to: '/admin/customers', label: L('ग्राहक', 'Customers'), icon: 'users' },
    ],
  },
  {
    id: 'marketing',
    title: L('मार्केटिंग', 'Marketing'),
    items: [
      { to: '/admin/offers', label: L('कूपन / ऑफर', 'Coupons / Offers'), icon: 'ticket', ownerOnly: true },
      { to: '/admin/welcome-popup', label: L('स्वागत पॉपअप', 'Welcome Popup'), icon: 'message' },
    ],
  },
  {
    id: 'analytics',
    title: L('विश्लेषण', 'Analytics'),
    items: [{ to: '/admin/reports', label: L('रिपोर्ट', 'Reports'), icon: 'chart' }],
  },
  {
    id: 'settings',
    title: L('सेटिंग', 'Settings'),
    items: [
      { to: '/admin/pricing-settings', labelKey: 'nav_pricing_settings', icon: 'percent', ownerOnly: true },
      { to: '/admin/payment-settings', label: L('भुगतान विकल्प (COD)', 'Payment Settings (COD)'), icon: 'card', ownerOnly: true },
    ],
  },
]

const DEFAULT_OPEN = ['main', 'catalog']

// निचला नेविगेशन (मोबाइल) — सबसे ज़रूरी 4 + "और"
const BOTTOM = [
  { to: '/admin', end: true, icon: 'dashboard', label: L('डैशबोर्ड', 'Home') },
  { to: '/admin/orders', icon: 'orders', label: L('ऑर्डर', 'Orders') },
  { to: '/admin/vegetables', icon: 'leaf', label: L('सब्ज़ियाँ', 'Products') },
  { to: '/admin/stock', icon: 'stock', label: L('स्टॉक', 'Stock') },
]

const UI = {
  adminPanel: L('एडमिन पैनल', 'Admin Panel'),
  appName: L('अपना किसान सब्ज़ीवाला', 'Apna Kisan Sabjiwala'),
  openMenu: L('मेन्यू खोलें', 'Open menu'),
  closeMenu: L('मेन्यू बंद करें', 'Close menu'),
  toggleSidebar: L('साइडबार छोटा/बड़ा करें', 'Collapse or expand sidebar'),
  mainNav: L('मुख्य नेविगेशन', 'Main navigation'),
  quickNav: L('त्वरित नेविगेशन', 'Quick navigation'),
  more: L('और', 'More'),
  notifications: L('सूचनाएँ', 'Notifications'),
  noNotifications: L('अभी कोई सूचना नहीं', 'No notifications yet'),
  close: L('बंद करें', 'Close'),
  profile: L('प्रोफ़ाइल', 'Profile'),
  owner: L('मालिक', 'Owner'),
  switchLang: L('English', 'हिंदी'),
  logout: L('लॉगआउट करें', 'Log out'),
  audioPrompt: L(
    '🔔 नए ऑर्डर की आवाज़ चालू करने के लिए स्क्रीन पर कहीं भी एक बार टैप करें',
    '🔔 Tap anywhere on the screen once to enable the new-order sound'
  ),
}

const COLLAPSE_KEY = 'aks_admin_sidebar_collapsed'

function isItemActive(item, pathname) {
  if (item.end) return pathname === item.to || pathname === `${item.to}/`
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

function NavList({ groups, pathname, openMap, onToggle, getLabel, groupTitle, rail }) {
  return (
    <>
      {groups.map((g) => {
        const collapsible = g.id !== 'main' && g.items.length > 1
        const hasActive = g.items.some((i) => isItemActive(i, pathname))
        const open = !collapsible || (openMap[g.id] ?? (DEFAULT_OPEN.includes(g.id) || hasActive))
        return (
          <section key={g.id} className="admin-group" aria-label={groupTitle(g)}>
            {collapsible ? (
              <button
                type="button"
                className="admin-group-btn"
                aria-expanded={open}
                aria-controls={`admin-grp-${g.id}`}
                onClick={() => onToggle(g.id, open)}
              >
                <span>{groupTitle(g)}</span>
                <Icon name="chevronDown" size={16} />
              </button>
            ) : (
              <div className="admin-group-static">{groupTitle(g)}</div>
            )}
            <div id={`admin-grp-${g.id}`} className={`admin-collapse ${open ? 'is-open' : ''}`}>
              <div>
                {g.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    title={rail ? getLabel(item) : undefined}
                    aria-label={rail ? getLabel(item) : undefined}
                    className={({ isActive }) => `admin-nav-item ${isActive ? 'is-active' : ''}`}
                  >
                    <Icon name={item.icon} size={21} />
                    <span className="admin-nav-label">{getLabel(item)}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          </section>
        )
      })}
    </>
  )
}

export default function AdminLayout() {
  const { session, isAdmin, isOwner, loading, logout, adminProfile } = useAdminAuth()
  const pt = usePT()
  const { language, toggleLanguage } = useLanguage()
  const lang = language === 'en' ? 'en' : 'hi'
  const tr = (o) => o[lang]

  const [toasts, setToasts] = useState([])
  const toastIdRef = useRef(0)
  const { pathname } = useLocation()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifs, setNotifs] = useState([])
  const [unread, setUnread] = useState(0)
  const [openMap, setOpenMap] = useState({})
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })
  const drawerCloseRef = useRef(null)
  const lastFocusRef = useRef(null)

  const groups = useMemo(
    () => GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.ownerOnly || isOwner) })).filter((g) => g.items.length > 0),
    [isOwner]
  )
  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups])
  const getLabel = useCallback((item) => (item.labelKey ? pt(item.labelKey) : tr(item.label)), [pt, lang]) // eslint-disable-line react-hooks/exhaustive-deps
  const groupTitle = useCallback((g) => g.title[lang], [lang])

  const activeItem = allItems.find((i) => isItemActive(i, pathname))
  const pageTitle = activeItem ? getLabel(activeItem) : tr(UI.adminPanel)
  const activeGroupId = groups.find((g) => g.items.some((i) => isItemActive(i, pathname)))?.id
  const bottomActive = BOTTOM.some((b) => isItemActive(b, pathname))

  // सक्रिय रूट वाला ग्रुप अपने-आप खुला रहे
  useEffect(() => {
    if (activeGroupId) setOpenMap((m) => (m[activeGroupId] ? m : { ...m, [activeGroupId]: true }))
  }, [activeGroupId])

  // रूट बदलते ही ड्रॉअर/मेन्यू बंद
  useEffect(() => {
    setDrawerOpen(false)
    setProfileOpen(false)
    setNotifOpen(false)
  }, [pathname])

  const toggleGroup = useCallback((id, currentlyOpen) => setOpenMap((m) => ({ ...m, [id]: !currentlyOpen })), [])

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      } catch {
        /* निजी मोड में localStorage बंद हो सकता है */
      }
      return next
    })
  }

  // ड्रॉअर/शीट खुलने पर बैकग्राउंड स्क्रॉल बंद
  const lockScroll = drawerOpen || notifOpen
  useEffect(() => {
    if (!lockScroll) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [lockScroll])

  // ESC से बंद करें
  useEffect(() => {
    if (!drawerOpen && !profileOpen && !notifOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setDrawerOpen(false)
        setProfileOpen(false)
        setNotifOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen, profileOpen, notifOpen])

  // फ़ोकस: ड्रॉअर खुलने पर बंद-बटन पर, बंद होने पर वापस पुराने बटन पर
  useEffect(() => {
    if (drawerOpen) {
      lastFocusRef.current = document.activeElement
      const id = requestAnimationFrame(() => drawerCloseRef.current?.focus())
      return () => cancelAnimationFrame(id)
    }
    lastFocusRef.current?.focus?.()
    lastFocusRef.current = null
  }, [drawerOpen])

  // ब्राउज़र पेज खुलते ही आवाज़ नहीं बजने देता — पहले एक टैप/क्लिक चाहिए। पहले टैप पर आवाज़ें अनलॉक कर देते हैं।
  const [audioReady, setAudioReady] = useState(() =>
    typeof navigator !== 'undefined' && navigator.userActivation ? navigator.userActivation.hasBeenActive : false
  )
  useEffect(() => {
    if (audioReady) {
      unlockSounds()
      return
    }
    const unlock = () => {
      unlockSounds()
      setAudioReady(true)
    }
    const events = ['pointerdown', 'touchstart', 'keydown']
    events.forEach((e) => window.addEventListener(e, unlock, { once: true, capture: true }))
    return () => events.forEach((e) => window.removeEventListener(e, unlock, { capture: true }))
  }, [audioReady])

  const pushToast = useCallback((message, type) => {
    const id = ++toastIdRef.current
    setToasts((prev) => [...prev, { id, message, type }])
    // घंटी (सूचनाएँ) सूची के लिए पिछले 20 संदेश रखते हैं
    setNotifs((prev) => [{ id, message, type, at: Date.now() }, ...prev].slice(0, 20))
    setUnread((n) => n + 1)
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }, [])

  useEffect(() => {
    if (!session || !isAdmin) return

    const channel = supabase
      .channel('admin-orders-watch')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          playNewOrderSound()
          pushToast(
            `🆕 नया ऑर्डर आया: ${payload.new.order_number} — ${payload.new.customer_name}${payload.new.payment_method === 'COD' ? ' • 💵 COD' : ''}`,
            'new-order'
          )
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const oldStatus = payload.old?.order_status
          const newStatus = payload.new?.order_status
          const oldPayment = payload.old?.payment_status
          const newPayment = payload.new?.payment_status
          if (oldStatus !== newStatus || oldPayment !== newPayment) {
            playStatusChangeSound()
            pushToast(
              `🔄 ऑर्डर ${payload.new.order_number}: ${newStatus}${
                oldPayment !== newPayment ? ` • भुगतान: ${newPayment}` : ''
              }`,
              'status-change'
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session, isAdmin, pushToast])

  if (loading) {
    return <AdminShellSkeleton />
  }

  if (!session || !isAdmin) {
    return <Navigate to="/admin/login" replace />
  }

  const displayName = adminProfile?.full_name || tr(UI.adminPanel)
  const roleText = isOwner ? tr(UI.owner) : adminProfile?.role || ''
  const initial = (adminProfile?.full_name || 'A').trim().charAt(0).toUpperCase()

  const openNotifs = () => {
    setProfileOpen(false)
    setNotifOpen(true)
    setUnread(0)
  }

  const navProps = { groups, pathname, openMap, onToggle: toggleGroup, getLabel, groupTitle }

  const brandHead = (extra) => (
    <div className="admin-nav-head">
      <img src={logo} alt="" />
      <div className="txt min-w-0">
        <p className="t1">{tr(UI.appName)}</p>
        <p className="t2">
          {tr(UI.adminPanel)}
          {adminProfile?.full_name ? ` • ${adminProfile.full_name}` : ''}
        </p>
      </div>
      {extra}
    </div>
  )

  const footer = (rail) => (
    <div className="admin-nav-foot">
      {!rail && (
        <div className="who">
          <b>{displayName}</b>
          {roleText}
        </div>
      )}
      <button
        type="button"
        onClick={toggleLanguage}
        className="admin-nav-item admin-foot-btn"
        title={rail ? tr(UI.switchLang) : undefined}
        aria-label={tr(UI.switchLang)}
      >
        <Icon name="globe" size={21} />
        <span className="admin-nav-label">{tr(UI.switchLang)}</span>
      </button>
      <button
        type="button"
        onClick={logout}
        className="admin-nav-item admin-foot-btn danger"
        title={rail ? tr(UI.logout) : undefined}
        aria-label={tr(UI.logout)}
      >
        <Icon name="logout" size={21} />
        <span className="admin-nav-label">{tr(UI.logout)}</span>
      </button>
    </div>
  )

  return (
    <div className={`admin-shell ${collapsed ? 'is-rail' : ''}`}>
      <AdminToastList toasts={toasts} />

      {/* डेस्कटॉप/टैबलेट: स्थायी साइडबार */}
      <aside className="admin-sidebar" aria-label={tr(UI.mainNav)}>
        {brandHead(null)}
        <nav className="admin-nav-scroll" aria-label={tr(UI.mainNav)}>
          <NavList {...navProps} rail={collapsed} />
        </nav>
        {footer(collapsed)}
      </aside>

      {/* मोबाइल: बाईं ओर से खुलने वाला ड्रॉअर */}
      <div className="admin-drawer-backdrop" data-open={drawerOpen} onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      <aside
        className="admin-drawer"
        data-open={drawerOpen}
        role="dialog"
        aria-modal="true"
        aria-label={tr(UI.mainNav)}
        aria-hidden={!drawerOpen}
      >
        {brandHead(
          <button
            ref={drawerCloseRef}
            type="button"
            className="admin-icon-btn"
            onClick={() => setDrawerOpen(false)}
            aria-label={tr(UI.closeMenu)}
          >
            <Icon name="close" />
          </button>
        )}
        <nav className="admin-nav-scroll" aria-label={tr(UI.mainNav)}>
          <NavList {...navProps} rail={false} />
        </nav>
        {footer(false)}
      </aside>

      <div className="admin-body">
        <header className="admin-header">
          <button
            type="button"
            className="admin-icon-btn"
            onClick={() => {
              if (window.matchMedia('(min-width: 768px)').matches) toggleCollapsed()
              else setDrawerOpen(true)
            }}
            aria-label={tr(UI.openMenu)}
            title={tr(UI.toggleSidebar)}
          >
            <Icon name="menu" />
          </button>
          <div className="admin-header-title">
            <h1>{pageTitle}</h1>
          </div>
          <button type="button" className="admin-icon-btn" onClick={openNotifs} aria-label={tr(UI.notifications)}>
            <Icon name="bell" />
            {unread > 0 && <span className="admin-badge-dot">{unread > 9 ? '9+' : unread}</span>}
          </button>
          <button
            type="button"
            className="admin-icon-btn"
            onClick={() => setProfileOpen((o) => !o)}
            aria-label={tr(UI.profile)}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
          >
            <span className="admin-avatar">{initial}</span>
          </button>

          {profileOpen && (
            <>
              <div className="admin-popover-back" onClick={() => setProfileOpen(false)} aria-hidden="true" />
              <div className="admin-popover" role="menu">
                <div className="px-3 py-2">
                  <p className="font-bold text-[15px] leading-tight">{displayName}</p>
                  {roleText && <p className="text-xs text-gray-500">{roleText}</p>}
                </div>
                <button type="button" role="menuitem" className="admin-nav-item admin-foot-btn" onClick={() => { toggleLanguage(); setProfileOpen(false) }}>
                  <Icon name="globe" size={20} /> {tr(UI.switchLang)}
                </button>
                <button type="button" role="menuitem" className="admin-nav-item admin-foot-btn danger" onClick={logout}>
                  <Icon name="logout" size={20} /> {tr(UI.logout)}
                </button>
              </div>
            </>
          )}
        </header>

        <main className="admin-main">
          <div className="admin-main-inner">
            <AdminPushCard />
            {!audioReady && (
              <div className="mb-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-sm font-semibold px-3 py-2">
                {tr(UI.audioPrompt)}
              </div>
            )}
            {isOwner && <PendingSyncBanner />}
            <div key={pathname} className="admin-page-enter">
              <Suspense fallback={<PageSkeleton />}>
                <Outlet />
              </Suspense>
            </div>
          </div>
        </main>
      </div>

      {/* मोबाइल: निचला नेविगेशन */}
      <nav className="admin-bottom-nav" aria-label={tr(UI.quickNav)}>
        {BOTTOM.map((b) => (
          <NavLink key={b.to} to={b.to} end={b.end} className={({ isActive }) => `admin-bn-item ${isActive ? 'is-active' : ''}`}>
            <span className="admin-bn-pill"><Icon name={b.icon} size={22} /></span>
            <span>{tr(b.label)}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`admin-bn-item ${drawerOpen || !bottomActive ? 'is-active' : ''}`}
          onClick={() => setDrawerOpen(true)}
          aria-label={tr(UI.openMenu)}
          aria-haspopup="dialog"
        >
          <span className="admin-bn-pill"><Icon name="more" size={22} /></span>
          <span>{tr(UI.more)}</span>
        </button>
      </nav>

      {/* सूचनाएँ */}
      {notifOpen && (
        <div className="admin-sheet-back" onClick={() => setNotifOpen(false)}>
          <div className="admin-sheet" role="dialog" aria-modal="true" aria-label={tr(UI.notifications)} onClick={(e) => e.stopPropagation()}>
            <div className="admin-sheet-head">
              <h2>{tr(UI.notifications)}</h2>
              <button type="button" className="admin-icon-btn" onClick={() => setNotifOpen(false)} aria-label={tr(UI.close)}>
                <Icon name="close" />
              </button>
            </div>
            <div className="admin-sheet-body">
              {notifs.length === 0 ? (
                <p className="admin-empty-note">{tr(UI.noNotifications)}</p>
              ) : (
                notifs.map((n) => (
                  <div key={n.id} className="admin-notif">
                    {n.message}
                    <time dateTime={new Date(n.at).toISOString()}>
                      {new Date(n.at).toLocaleTimeString(lang === 'hi' ? 'hi-IN' : 'en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </time>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
