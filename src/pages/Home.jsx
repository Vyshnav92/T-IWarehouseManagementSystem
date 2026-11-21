import { useMemo } from 'react'
import {
  PackagePlus, PackageMinus, Truck, Users, BellRing, Warehouse, Sparkles, ChevronRight, ArrowRight, Plus, Package, CalendarClock,
  Wrench, Undo2, Ban, Upload, Pencil, CalendarCheck, X, Boxes, ShieldCheck,
} from 'lucide-react'
import { useApp } from '../store'
import { activeReminders, EXPIRY, relDays, fmtNum, fmtSARk, addDays, TODAY, KINDS, STOCK_STATUS, currentValue, fmtShort } from '../data'
import { morningBrief, insights } from '../ai'
import { Rich, Pill, Ring, MiniBars, cx, AiTag } from '../ui'

const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }
const ACT_ICON = { issue: PackageMinus, purchase: PackagePlus, return: Undo2, cancel: Ban, upload: Upload, renew: CalendarCheck, wrench: Wrench, add: Plus, spark: Sparkles, edit: Pencil }

export default function Home() {
  const { db, go, open, openAssistant, update } = useApp()
  const brief = useMemo(() => morningBrief(db), [db])
  const ins = useMemo(() => insights(db), [db])
  const rem = activeReminders(db)
  const low = ins.fc.filter((f) => f.status !== 'ok')
  const fleetValue = ins.fleet.reduce((a, f) => a + f.value, 0)
  const repairs = db.vehicles.filter((v) => v.condition === 'repair').length

  const chart = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const d = addDays(TODAY, i - 13)
    let a = 0, b = 0
    db.movements.forEach((mv) => { if (mv.date === d && !mv.cancelled) (KINDS[mv.kind].group === 'in' ? (a += 1) : (b += 1)) })
    return { label: fmtShort(d), a, b }
  }), [db])

  const attention = [
    ...rem.map((r) => ({ id: r.id, tone: r.days < 0 ? 'bad' : 'warn', icon: r.entity === 'vehicle' ? Truck : Users, title: `${r.title} · ${EXPIRY[r.key].short}`, meta: r.days < 0 ? `Expired ${-r.days} days ago` : `Expires ${relDays(r.days)}`, pill: r.days < 0 ? 'Expired' : r.days === 0 ? 'Today' : `${r.days} days`, act: () => open('renew', { entity: r.entity, id: r.entityId, expKey: r.key }), actLabel: 'Renew', row: () => open(r.entity, { id: r.entityId }), sort: r.days })),
    ...low.map((f) => ({ id: f.m.id, tone: f.status === 'out' ? 'bad' : 'warn', icon: Package, title: f.m.name, meta: `${fmtNum(f.bal)} ${f.m.unit} left · minimum ${f.m.min}`, pill: STOCK_STATUS[f.status].label, act: () => open('entry', { kind: 'purchase', prefill: { kind: 'purchase', lines: [{ materialId: f.m.id, qty: f.suggest || '' }] } }), actLabel: 'Order', row: () => open('material', { id: f.m.id }), sort: f.status === 'out' ? -0.5 : 5 })),
  ].sort((a, b) => a.sort - b.sort)

  return (
    <div className="page home">
      <section className="hero">
        <div className="hero-main">
          <span className="hero-kicker"><Sparkles size={14} /> Today's summary <AiTag>written by AI</AiTag></span>
          <h1>{greet()}, {db.settings.managerName}.</h1>
          <p className="hero-brief"><Rich text={brief.text} /></p>
          <div className="hero-chips">
            {rem.slice(0, 3).map((r) => (
              <button key={r.id} className={cx('hchip', r.days < 0 ? 'bad' : 'warn')} onClick={() => open(r.entity, { id: r.entityId })}>
                <i />{r.title} · {EXPIRY[r.key].short}<b>{r.days < 0 ? 'expired' : relDays(r.days)}</b>
              </button>
            ))}
            <button className="hchip ghost" onClick={() => openAssistant()}><Sparkles size={14} /> Ask a question</button>
          </div>
        </div>
        <div className="hero-side">
          <Ring value={brief.count} total={Math.max(brief.count, 12)} size={148} label="need you today" />
          <button className="hero-link" onClick={() => go('reminders')}>See what to do <ArrowRight size={16} /></button>
        </div>
      </section>

      {!db.settings.introDismissed && (
        <section className="intro">
          <div className="intro-h"><b>What this app does for you</b><button className="iconbtn sm" onClick={() => update((d) => { d.settings.introDismissed = true })} aria-label="Hide"><X size={16} /></button></div>
          <div className="intro-steps">
            <div><span className="n">1</span><Boxes size={22} /><b>Knows your stock</b><p>Record materials coming in and going out. Stock is counted for you. No more Excel.</p></div>
            <div><span className="n">2</span><ShieldCheck size={22} /><b>Keeps every document</b><p>Istimara, FAHAS, insurance, licenses, bills. All in one place, ready to view or download.</p></div>
            <div><span className="n">3</span><CalendarClock size={22} /><b>Reminds you in time</b><p>Starts {db.settings.remindDays} days before anything expires and reminds you every day until it's renewed.</p></div>
          </div>
        </section>
      )}

      <section className="tiles">
        <Tile icon={Warehouse} tone="red" title="Warehouse" ar="المستودع" big={db.materials.length} unit="materials" line={low.length ? `${low.length} running low or finished` : 'All stock levels healthy'} alert={low.length > 0} onClick={() => go('warehouse')} />
        <Tile icon={Truck} tone="dark" title="Vehicles" ar="المركبات" big={db.vehicles.length} unit="vehicles" line={`Worth ${fmtSARk(fleetValue)}${repairs ? ` · ${repairs} need repair` : ''}`} alert={repairs > 0} onClick={() => go('vehicles')} />
        <Tile icon={Users} tone="blue" title="Drivers" ar="السائقون" big={db.drivers.length} unit="drivers" line={(() => { const n = rem.filter((r) => r.entity === 'driver').length; return n ? `${n} card${n > 1 ? 's' : ''} or license${n > 1 ? 's' : ''} to renew` : 'All documents valid' })()} alert={rem.some((r) => r.entity === 'driver')} onClick={() => go('drivers')} />
        <Tile icon={BellRing} tone="amber" title="Reminders" ar="التنبيهات" big={rem.length} unit="active" line={brief.expired.length ? `${brief.expired.length} already expired` : 'Nothing expired'} alert={brief.expired.length > 0} onClick={() => go('reminders')} />
      </section>

      <section className="quick-actions">
        <span className="qa-label">What do you want to do?</span>
        <button className="qa in" onClick={() => open('entry', { kind: 'purchase' })}><PackagePlus size={22} /><span><b>Stock in</b><small>Materials received</small></span></button>
        <button className="qa out" onClick={() => open('entry', { kind: 'issue' })}><PackageMinus size={22} /><span><b>Stock out</b><small>Send to a site</small></span></button>
        <button className="qa" onClick={() => open('vehicleForm', { type: 'car' })}><Truck size={22} /><span><b>Add vehicle</b><small>Car or heavy</small></span></button>
        <button className="qa" onClick={() => open('driverForm')}><Users size={22} /><span><b>Add driver</b><small>With documents</small></span></button>
        <button className="qa ai" onClick={() => openAssistant()}><Sparkles size={22} /><span><b>Ask AI</b><small>In plain words</small></span></button>
      </section>

      <div className="grid-2">
        <section className="card">
          <header className="card-h"><div><h3>Needs your attention</h3><p className="muted small">Most urgent first. Tap a row for details.</p></div><Pill tone={attention.length ? 'bad' : 'ok'}>{attention.length}</Pill></header>
          <div className="att-list">
            {attention.slice(0, 7).map((a) => (
              <div key={a.id} className="att" onClick={a.row} role="button" tabIndex={0}>
                <span className={cx('att-ic', a.tone)}><a.icon size={18} /></span>
                <span className="grow"><b>{a.title}</b><small>{a.meta}</small></span>
                <Pill tone={a.tone}>{a.pill}</Pill>
                <button className="btn btn-soft btn-sm" onClick={(e) => { e.stopPropagation(); a.act() }}>{a.actLabel}</button>
              </div>
            ))}
            {attention.length > 7 && <button className="more" onClick={() => go('reminders')}>+ {attention.length - 7} more <ChevronRight size={15} /></button>}
          </div>
        </section>

        <div className="col">
          <section className="card">
            <header className="card-h"><div><h3>Warehouse activity</h3><p className="muted small">Entries per day, last 14 days</p></div>
              <div className="legend"><span><i className="lg-in" />In</span><span><i className="lg-out" />Out</span></div></header>
            <MiniBars data={chart} height={140} />
            <div className="chart-x"><span>{chart[0].label}</span><span>Today</span></div>
          </section>
          <section className="card">
            <header className="card-h"><div><h3>Recent activity</h3><p className="muted small">Everything that changed, automatically logged</p></div></header>
            <ul className="feed">
              {db.activity.slice(0, 5).map((a) => { const I = ACT_ICON[a.icon] || Pencil; return <li key={a.id}><span className="feed-ic"><I size={14} /></span><span className="grow">{a.text}</span><time>{timeAgo(a.at)}</time></li> })}
              {(() => { const recent = [...db.movements].reverse().slice(0, Math.max(0, 5 - db.activity.length)); return recent.map((mv) => { const I = ACT_ICON[mv.kind]; return <li key={mv.id} className="click" onClick={() => open('movement', { id: mv.id })}><span className="feed-ic"><I size={14} /></span><span className="grow">{KINDS[mv.kind].label} <b className="mono">{mv.no}</b> · {mv.project || mv.vendor}</span><time>{fmtShort(mv.date)}</time></li> }) })()}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}

function Tile({ icon: I, tone, title, ar, big, unit, line, alert, onClick }) {
  return (
    <button className={cx('tile', 'tile-' + tone)} onClick={onClick}>
      <div className="tile-top"><span className="tile-ic"><I size={22} /></span><span className="tile-ar">{ar}</span></div>
      <div className="tile-t">{title}</div>
      <div className="tile-big">{big}<small>{unit}</small></div>
      <div className={cx('tile-line', alert && 'alert')}>{alert && <i />}{line}</div>
      <span className="tile-go">Open <ArrowRight size={15} /></span>
    </button>
  )
}
function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}
