import { useRef, useState } from 'react'
import { BellRing, TrendingDown, CalendarClock, Sparkles, User, RotateCcw, HelpCircle, X, Plus, ListChecks } from 'lucide-react'
import { useApp } from '../store'
import { EXPIRY, fmtSAR, DEP_TYPES, rateOf } from '../data'
import { PageHeader, Btn, cx } from '../ui'

export default function Settings() {
  const { db, update, toast, resetDemo } = useApp()
  const s = db.settings
  const set = (fn, msg) => { update((d) => fn(d.settings)); if (msg) toast(msg) }
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="page">
      <PageHeader title="Settings" ar="الإعدادات" desc="Make the app work the way you do. Changes apply straight away." />
      <div className="set-grid">
        <section className="card set">
          <header className="set-h"><span className="set-ic"><User size={18} /></span><div><h3>About you</h3><p className="muted small">Used in the greeting on the Home page</p></div></header>
          <label className="field"><span className="field-l">Your name</span><input defaultValue={s.managerName} onBlur={(e) => e.target.value.trim() && set((x) => { x.managerName = e.target.value.trim() }, 'Name saved')} /></label>
        </section>

        <section className="card set">
          <header className="set-h"><span className="set-ic"><BellRing size={18} /></span><div><h3>When to start reminding me</h3><p className="muted small">Reminders repeat daily until the new date is entered</p></div></header>
          <div className="slider">
            <input type="range" min="3" max="30" value={s.remindDays} onChange={(e) => set((x) => { x.remindDays = Number(e.target.value) })} />
            <b>{s.remindDays} days before</b>
          </div>
          <div className="presets">{[7, 10, 15, 30].map((n) => <button key={n} className={cx('chip', s.remindDays === n && 'on')} onClick={() => set((x) => { x.remindDays = n }, `Reminders now start ${n} days before`)}>{n} days</button>)}</div>
        </section>

        <section className="card set">
          <header className="set-h"><span className="set-ic"><TrendingDown size={18} /></span><div><h3>Depreciation</h3><p className="muted small">How much value each kind of asset loses every year</p></div></header>
          {Object.entries(DEP_TYPES).map(([k, t]) => <RateRow key={k} type={k} label={t.label} sub={t.sub} />)}
          <p className="muted small">The value drops by this percentage every year from the date of purchase, and never goes below zero. Example at {rateOf(s, 'vehicles')}%: a {fmtSAR(100000)} vehicle is worth {fmtSAR(100000 * Math.pow(1 - rateOf(s, 'vehicles') / 100, 3))} after 3 years. Changes update Vehicles, Hand tools and Total assets straight away.</p>
        </section>

        <section className="card set">
          <header className="set-h"><span className="set-ic"><CalendarClock size={18} /></span><div><h3>Renewal periods</h3><p className="muted small">Used to suggest the new date when you press Renew</p></div></header>
          <div className="periods">
            {Object.keys(EXPIRY).map((k) => (
              <label key={k} className="period"><span>{EXPIRY[k].label}<small className="ar">{EXPIRY[k].ar}</small></span>
                <select value={s.periods[k]} onChange={(e) => set((x) => { x.periods[k] = Number(e.target.value) }, 'Renewal period saved')}>
                  {[6, 12, 24, 36, 60, 120].map((m) => <option key={m} value={m}>{m < 12 ? `${m} months` : `${m / 12} year${m > 12 ? 's' : ''}`}</option>)}
                </select>
              </label>
            ))}
          </div>
        </section>

        <section className="card set">
          <header className="set-h"><span className="set-ic ai"><Sparkles size={18} /></span><div><h3>Smart help</h3><p className="muted small">Turn the helpers on or off</p></div></header>
          <Toggle on={s.smartChecks} onChange={(v) => set((x) => { x.smartChecks = v })} title="Warn me about unusual quantities" sub="For example, sending 10× more than usual" />
          <Toggle on={s.showHowTo} onChange={(v) => set((x) => { x.showHowTo = v })} title="Show “How this page works” tips" sub="Turn off once you know your way around" />
          <Toggle on={!s.introDismissed} onChange={(v) => set((x) => { x.introDismissed = !v })} title="Show “What this app does” on Home" sub="The three-step summary card" />
        </section>

        <section className="card set">
          <header className="set-h"><span className="set-ic"><ListChecks size={18} /></span><div><h3>Your lists</h3><p className="muted small">New names are added automatically when you type them in a form</p></div></header>
          <ListEdit label="Projects / sites" items={db.projects} onChange={(v) => update((d) => { d.projects = v })} />
          <ListEdit label="Suppliers" items={db.vendors} onChange={(v) => update((d) => { d.vendors = v })} />
          <ListEdit label="Site engineers" items={db.engineers} onChange={(v) => update((d) => { d.engineers = v })} />
        </section>

        <section className="card set">
          <header className="set-h"><span className="set-ic"><HelpCircle size={18} /></span><div><h3>Demo</h3><p className="muted small">This demo saves your changes in this browser only</p></div></header>
          <div className="row-gap wrap">
            <Btn kind="ghost" icon={HelpCircle} onClick={() => set((x) => { x.tourDone = false })}>Replay the welcome tour</Btn>
            {!confirm ? <Btn kind="ghost" icon={RotateCcw} onClick={() => setConfirm(true)}>Reset demo data</Btn>
              : <><Btn kind="danger" icon={RotateCcw} onClick={() => { resetDemo(); setConfirm(false) }}>Yes, reset everything</Btn><Btn kind="ghost" onClick={() => setConfirm(false)}>Cancel</Btn></>}
          </div>
        </section>
      </div>
    </div>
  )
}

/** One depreciation rate. The change is logged once, with the old and new rate, when the user lets go of the slider. */
function RateRow({ type, label, sub }) {
  const { db, update, toast } = useApp()
  const rate = rateOf(db.settings, type)
  const startRef = useRef(null)
  const setRate = (n) => update((d) => { if (type === 'vehicles') d.settings.depreciation = n; else d.settings.depRates = { ...(d.settings.depRates || {}), [type]: n } })
  const begin = () => { if (startRef.current === null) startRef.current = rate }
  const commit = () => {
    const from = startRef.current
    startRef.current = null
    if (from === null || from === rate) return
    update(() => {}, `Depreciation for ${label} changed from ${from}% to ${rate}% by ${db.settings.managerName || 'Manager'}`, 'edit')
    toast(`${label}: ${rate}% per year`)
  }
  return (
    <div className="raterow">
      <span className="grow"><b>{label}</b><small>{sub}</small></span>
      <input type="range" min="0" max="50" value={rate} aria-label={`${label} depreciation per year`} onPointerDown={begin} onKeyDown={begin} onFocus={begin}
        onChange={(e) => { begin(); setRate(Number(e.target.value)) }} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
      <b className="num rate-v">{rate}%</b>
    </div>
  )
}

function Toggle({ on, onChange, title, sub }) {
  return (
    <button className="toggle-row" onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span className="grow"><b>{title}</b><small>{sub}</small></span>
      <span className={cx('switch', on && 'on')}><i /></span>
    </button>
  )
}
function ListEdit({ label, items, onChange }) {
  const [v, setV] = useState('')
  const add = () => { const t = v.trim(); if (t && !items.includes(t)) onChange([...items, t]); setV('') }
  return (
    <div className="listedit">
      <span className="field-l">{label}</span>
      <div className="chips">{items.map((x) => <span key={x} className="chip on">{x}<button onClick={() => onChange(items.filter((y) => y !== x))} aria-label={`Remove ${x}`}><X size={12} /></button></span>)}</div>
      <div className="try-in"><input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder={`Add ${label.toLowerCase().split(' ')[0].replace(/s$/, '')}…`} /><Btn kind="ghost" size="sm" icon={Plus} onClick={add}>Add</Btn></div>
    </div>
  )
}
