import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LayoutDashboard, Warehouse as WarehouseIc, Truck, Users, BellRing, FileSpreadsheet, Sparkles, Settings as SettingsIc,
  Search, Bell, HelpCircle, MessageCircle, Package, ChevronRight, X, Menu, Wrench, Landmark,
} from 'lucide-react'
import { useApp } from './store'
import { activeReminders, EXPIRY, relDays, hijriToday, TODAY, fmtDate } from './data'
import { cx, Pill } from './ui'
import logoDark from './logo_D.png'
import Home from './pages/Home'
import Warehouse from './pages/Warehouse'
import HandTools from './pages/HandTools'
import Assets from './pages/Assets'
import { Vehicles, Drivers } from './pages/Fleet'
import Reminders from './pages/Reminders'
import Reports from './pages/Reports'
import Smart from './pages/Smart'
import Settings from './pages/Settings'
import Overlays from './Overlays'
import Assistant from './Assistant'
import Tour from './Tour'

export const NAV = [
  { id: 'home', label: 'Home', ar: 'الرئيسية', icon: LayoutDashboard, hint: 'Your day at a glance' },
  { id: 'warehouse', label: 'Warehouse', ar: 'المستودع', icon: WarehouseIc, hint: 'Materials in & out' },
  { id: 'handtools', label: 'Hand tools', ar: 'العدد اليدوية', icon: Wrench, hint: 'Tools held by staff' },
  { id: 'assets', label: 'Total assets', ar: 'إجمالي الأصول', icon: Landmark, hint: 'Everything the company owns' },
  { id: 'vehicles', label: 'Vehicles', ar: 'المركبات', icon: Truck, hint: 'Cars & heavy vehicles' },
  { id: 'drivers', label: 'Drivers', ar: 'السائقون', icon: Users, hint: 'Licenses & driver cards' },
  { id: 'reminders', label: 'Reminders', ar: 'التنبيهات', icon: BellRing, hint: 'What expires soon' },
  { id: 'reports', label: 'Reports', ar: 'التقارير', icon: FileSpreadsheet, hint: 'Excel & PDF' },
  { id: 'smart', label: 'Smart features', ar: 'الذكاء الاصطناعي', icon: Sparkles, hint: 'What AI does for you' },
  { id: 'settings', label: 'Settings', ar: 'الإعدادات', icon: SettingsIc, hint: 'Make it yours' },
]
const PAGES = { home: Home, warehouse: Warehouse, handtools: HandTools, assets: Assets, vehicles: Vehicles, drivers: Drivers, reminders: Reminders, reports: Reports, smart: Smart, settings: Settings }

export default function App() {
  const { route, db, toasts } = useApp()
  const Page = PAGES[route.page] || Home
  const [menu, setMenu] = useState(false)
  useEffect(() => setMenu(false), [route.page])
  return (
    <div className="app">
      <Sidebar open={menu} onClose={() => setMenu(false)} />
      <div className="main">
        <Topbar onMenu={() => setMenu(true)} />
        <main className="content" key={route.page}>
          <Page />
        </main>
      </div>
      <Overlays />
      <Assistant />
      {!db.settings.tourDone && <Tour />}
      <DailyReminder />
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={cx('toast', 'toast-' + t.tone)}>{t.text}{t.action && <button className="toast-act" onClick={t.action.run}>{t.action.label}</button>}</div>)}</div>
    </div>
  )
}

function Sidebar({ open, onClose }) {
  const { route, go, db, openAssistant, update } = useApp()
  const rem = activeReminders(db).length
  return (
    <>
      {open && <div className="side-scrim" onClick={onClose} />}
      <aside className={cx('side', open && 'open')}>
        <div className="side-logo"><img src={logoDark} alt="T&I Construction" /><span>Control Room</span></div>
        <nav className="side-nav" aria-label="Sections">
          {NAV.map((n) => (
            <button key={n.id} className={cx('nav-i', route.page === n.id && 'on')} onClick={() => go(n.id)} aria-current={route.page === n.id ? 'page' : undefined}>
              <n.icon size={19} strokeWidth={2} />
              <span className="nav-t"><b>{n.label}</b><small>{n.hint}</small></span>
              {n.id === 'reminders' && rem > 0 && <em className="nav-badge">{rem}</em>}
              <span className="nav-ar">{n.ar}</span>
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <button className="side-ai" onClick={() => openAssistant()}>
            <span className="side-ai-ic"><Sparkles size={18} /></span>
            <span><b>Ask the assistant</b><small>Type a question in plain words</small></span>
          </button>
          <button className="side-link" onClick={() => update((d) => { d.settings.tourDone = false })}><HelpCircle size={16} /> Show me around again</button>
        </div>
      </aside>
    </>
  )
}

function Topbar({ onMenu }) {
  const { db, go, open, openAssistant } = useApp()
  const [q, setQ] = useState('')
  const [focus, setFocus] = useState(false)
  const [bell, setBell] = useState(false)
  const box = useRef()
  const rem = activeReminders(db)
  useEffect(() => {
    const on = (e) => { if (box.current && !box.current.contains(e.target)) { setFocus(false); setBell(false) } }
    document.addEventListener('mousedown', on); return () => document.removeEventListener('mousedown', on)
  }, [])
  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (s.length < 2) return []
    const r = []
    db.materials.filter((m) => m.name.toLowerCase().includes(s)).slice(0, 5).forEach((m) => r.push({ icon: Package, label: m.name, meta: 'Material · ' + m.category, open: { type: 'material', id: m.id } }))
    db.vehicles.filter((v) => (v.plate + ' ' + v.brand + ' ' + v.model + ' ' + v.user).toLowerCase().includes(s)).slice(0, 4).forEach((v) => r.push({ icon: Truck, label: v.plate, meta: `${v.brand} ${v.model} · ${v.user}`, open: { type: 'vehicle', id: v.id } }))
    db.drivers.filter((d) => d.name.toLowerCase().includes(s)).slice(0, 4).forEach((d) => r.push({ icon: Users, label: d.name, meta: 'Driver · ' + d.profession, open: { type: 'driver', id: d.id } }))
    return r
  }, [q, db])
  const today = new Date(TODAY + 'T00:00:00')
  return (
    <header className="top" ref={box}>
      <button className="iconbtn menu-btn" onClick={onMenu} aria-label="Open menu"><Menu size={22} /></button>
      <div className="search">
        <Search size={18} className="search-ic" />
        <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setFocus(true)} placeholder="Search a material, plate number or driver…"
          onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) { if (results[0]) { open(results[0].open.type, { id: results[0].open.id }) } else openAssistant(q); setQ(''); setFocus(false) } }} />
        {q && <button className="iconbtn sm" onClick={() => setQ('')} aria-label="Clear"><X size={16} /></button>}
        {focus && q.trim().length >= 2 && (
          <div className="pop search-pop">
            {results.map((r, i) => (
              <button key={i} className="pop-row" onClick={() => { open(r.open.type, { id: r.open.id }); setQ(''); setFocus(false) }}>
                <r.icon size={17} /><span className="grow"><b>{r.label}</b><small>{r.meta}</small></span><ChevronRight size={16} />
              </button>
            ))}
            <button className="pop-row ai" onClick={() => { openAssistant(q); setQ(''); setFocus(false) }}>
              <Sparkles size={17} /><span className="grow"><b>Ask the assistant</b><small>“{q}”</small></span><ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
      <div className="top-date">
        <b>{today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</b>
        <small>{hijriToday()}</small>
      </div>
      <button className="iconbtn bell" onClick={() => setBell(!bell)} aria-label={`${rem.length} reminders`}>
        <Bell size={21} />{rem.length > 0 && <em>{rem.length}</em>}
      </button>
      {bell && (
        <div className="pop bell-pop">
          <div className="pop-h"><b>Reminders</b><span className="muted">You get these every day until the new date is entered</span></div>
          {rem.slice(0, 6).map((r) => (
            <button key={r.id} className="pop-row" onClick={() => { open(r.entity, { id: r.entityId }); setBell(false) }}>
              <span className={cx('dotlg', r.days < 0 ? 'bad' : 'warn')} />
              <span className="grow"><b>{r.title} · {EXPIRY[r.key].short}</b><small>{r.days < 0 ? `Expired ${-r.days} days ago` : `Expires ${relDays(r.days)}`} · {fmtDate(r.date)}</small></span>
            </button>
          ))}
          <button className="pop-all" onClick={() => { go('reminders'); setBell(false) }}>See all reminders <ChevronRight size={15} /></button>
        </div>
      )}
      <button className="avatar" onClick={() => go('settings')} title="Settings"><span>{(db.settings.managerName || 'M')[0].toUpperCase()}</span></button>
      <button className="fab" onClick={() => openAssistant()} aria-label="Ask the assistant"><MessageCircle size={24} /><span>Ask</span></button>
    </header>
  )
}

/** Once a day, greet the manager with today's reminders (the "every day reminder" from the brief). */
function DailyReminder() {
  const { db, open, go } = useApp()
  const [show, setShow] = useState(false)
  const rem = activeReminders(db)
  useEffect(() => {
    if (!db.settings.tourDone || !rem.length) return
    let seen = null
    try { seen = localStorage.getItem('ti-daily') } catch { /* ignore */ }
    if (seen !== TODAY) { const t = setTimeout(() => setShow(true), 900); return () => clearTimeout(t) }
  }, [db.settings.tourDone]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!show) return null
  const dismiss = () => { setShow(false); try { localStorage.setItem('ti-daily', TODAY) } catch { /* ignore */ } }
  return (
    <div className="daily" role="status">
      <div className="daily-h"><span className="daily-ic"><BellRing size={18} /></span><div className="grow"><b>Today's reminder</b><small>{rem.length} item{rem.length > 1 ? 's' : ''} need{rem.length > 1 ? '' : 's'} renewing</small></div><button className="iconbtn sm" onClick={dismiss} aria-label="Dismiss"><X size={16} /></button></div>
      {rem.slice(0, 3).map((r) => (
        <button key={r.id} className="daily-row" onClick={() => { open(r.entity, { id: r.entityId }); dismiss() }}>
          <Pill tone={r.days < 0 ? 'bad' : 'warn'} dot>{r.days < 0 ? 'Expired' : r.days === 0 ? 'Today' : `${r.days}d`}</Pill>
          <span className="grow">{r.title} · {EXPIRY[r.key].short}</span><ChevronRight size={15} />
        </button>
      ))}
      <button className="btn btn-primary btn-sm daily-all" onClick={() => { go('reminders'); dismiss() }}>Open all reminders</button>
    </div>
  )
}
