import { useMemo, useState } from 'react'
import { Boxes, ArrowDownToLine, ArrowUpFromLine, Truck, Users, Wrench, BellRing, FileSpreadsheet, FileDown, CalendarRange, Hammer, Landmark } from 'lucide-react'
import { useApp } from '../store'
import { balances, stockStatus, STOCK_STATUS, KINDS, fmtDate, daysUntil, CONDITIONS, currentValue, allExpiries, EXPIRY, addDays, TODAY } from '../data'
import { PageHeader, Btn, cx } from '../ui'
import { exportExcel, exportPdf } from '../exporter'
import { assetReportData } from '../AssetOverlays'

const REPORTS = [
  { id: 'stock', label: 'Current stock', icon: Boxes, desc: 'Every material with what you have now', dated: false },
  { id: 'in', label: 'Stock in', icon: ArrowDownToLine, desc: 'Purchases and returns from sites', dated: true },
  { id: 'out', label: 'Stock out', icon: ArrowUpFromLine, desc: 'Materials sent to projects', dated: true },
  { id: 'vehicles', label: 'Vehicles', icon: Truck, desc: 'Full fleet list with expiry dates and value', dated: false },
  { id: 'drivers', label: 'Drivers', icon: Users, desc: 'Licenses and driver cards', dated: false },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench, desc: 'Workshop costs per vehicle', dated: true },
  { id: 'reminders', label: 'Expiry list', icon: BellRing, desc: 'Everything that expires in the next 90 days', dated: false },
  { id: 'tools', label: 'Monthly tools', icon: Hammer, desc: 'Tools in and out for one month', monthly: true },
  { id: 'assets', label: 'Total assets value', icon: Landmark, desc: 'Current value by asset type, with a grand total', dated: false },
]

const monthRange = (ym) => { const [y, m] = ym.split('-').map(Number); return { from: `${ym}-01`, to: `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` } }
const monthLabel = (ym) => new Date(ym + '-15').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
const prevMonth = () => { const [y, m] = TODAY.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}` }

/** Monthly tools report. Every figure comes from the recorded movements, so any past month always regenerates the same. */
function buildTools(db, ym) {
  const { from, to } = monthRange(ym)
  const tools = db.materials.filter((m) => m.category === 'Tools')
  const ids = new Set(tools.map((m) => m.id))
  const mvs = db.movements.filter((mv) => !mv.cancelled && mv.date <= to)
  const sum = { opening: {}, in: {}, out: {} }
  tools.forEach((m) => { sum.opening[m.id] = m.opening; sum.in[m.id] = 0; sum.out[m.id] = 0 })
  const atSite = {} // project -> tool -> { q, last }
  const moves = []
  mvs.forEach((mv) => mv.lines.forEach((l) => {
    if (!ids.has(l.materialId)) return
    const q = Number(l.qty) || 0
    const isIn = KINDS[mv.kind].group === 'in'
    if (mv.date < from) sum.opening[l.materialId] += isIn ? q : -q
    else { sum[isIn ? 'in' : 'out'][l.materialId] += q; moves.push({ mv, l, q, isIn }) }
    if (mv.kind !== 'purchase' && mv.project) {
      const s = (atSite[mv.project] ||= {}); const t = (s[l.materialId] ||= { q: 0, last: null })
      t.q += mv.kind === 'issue' ? q : -q
      if (mv.kind === 'issue') t.last = mv.date
    }
  }))
  const name = (id) => tools.find((m) => m.id === id)
  const outstanding = []
  Object.entries(atSite).forEach(([project, t]) => Object.entries(t).forEach(([id, x]) => { if (x.q > 0) outstanding.push([project, name(id).name, x.q, name(id).unit, x.last ? fmtDate(x.last) : '—']) }))
  outstanding.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
  const stillOut = (id) => outstanding.filter((r) => r[1] === name(id).name).reduce((a, r) => a + r[2], 0)
  const summary = tools.map((m) => { const o = sum.opening[m.id], i = sum.in[m.id], u = sum.out[m.id]; return [m.name, m.unit, o, i, u, o + i - u, stillOut(m.id)] })
  const movements = moves.map(({ mv, l, q, isIn }) => [fmtDate(mv.date), mv.no, name(l.materialId).name, q, isIn ? 'In' : 'Out', KINDS[mv.kind].label, mv.kind === 'purchase' ? mv.vendor || '' : mv.project || '', mv.engineer || mv.reqName || '', mv.billNo || mv.mtn || mv.reqNo || ''])
  return {
    sections: [
      { title: 'Summary', columns: ['Tool', 'Unit', 'Opening', 'In', 'Out', 'Closing', 'Still out at sites'], rows: summary },
      { title: 'Movements', columns: ['Date', 'No.', 'Tool', 'Qty', 'In / Out', 'Type', 'Site / supplier', 'Person', 'Document no.'], rows: movements, empty: 'No tools went in or out this month.' },
      { title: 'Still out at sites at month end', columns: ['Site', 'Tool', 'Qty', 'Unit', 'Last sent'], rows: outstanding, empty: 'All tools were back in the store.' },
    ],
  }
}

function build(id, db, from, to) {
  const inRange = (d) => (!from || d >= from) && (!to || d <= to)
  const mat = (mid) => db.materials.find((m) => m.id === mid) || {}
  const s = db.settings
  if (id === 'stock') {
    const b = balances(db)
    return { columns: ['#', 'Material', 'Category', 'Unit', 'In stock', 'Minimum', 'Status'], rows: db.materials.map((m, i) => [i + 1, m.name, m.category, m.unit, b[m.id], m.min, STOCK_STATUS[stockStatus(b[m.id], m.min)].label]) }
  }
  if (id === 'in' || id === 'out') {
    const rows = []
    db.movements.filter((mv) => !mv.cancelled && (id === 'out' ? mv.kind === 'issue' : mv.kind !== 'issue') && inRange(mv.date)).forEach((mv) => mv.lines.forEach((l) => {
      const m = mat(l.materialId)
      rows.push(id === 'in' ? [mv.no, fmtDate(mv.date), KINDS[mv.kind].label, mv.vendor || mv.project || '', mv.billNo || '', mv.reqNo || '', mv.mtn || '', m.name, l.qty, m.unit]
        : [mv.no, fmtDate(mv.date), mv.project, mv.engineer || '', mv.reqNo || '', mv.mtn || '', m.name, l.qty, m.unit])
    }))
    return { columns: id === 'in' ? ['No.', 'Date', 'Type', 'Supplier / project', 'Bill no.', 'Req. no.', 'MTN', 'Material', 'Qty', 'Unit'] : ['No.', 'Date', 'Project', 'Site engineer', 'Req. no.', 'MTN', 'Material', 'Qty', 'Unit'], rows }
  }
  if (id === 'vehicles') {
    return {
      columns: ['#', 'Plate', 'Type', 'Vehicle', 'Ownership', 'User', 'Condition', 'FAHAS expiry', 'Registration expiry', 'Op. card expiry', 'Location', 'Value now (SAR)'],
      rows: db.vehicles.map((v, i) => [i + 1, v.plate, v.type === 'heavy' ? 'Heavy' : 'Car', `${v.brand} ${v.model} ${v.year}`, v.ownership, v.user, CONDITIONS[v.condition].label, fmtDate(v.fahas), fmtDate(v.registration), v.type === 'heavy' ? fmtDate(v.opCard) : '—', v.location, Math.round(currentValue(v, s.depreciation))]),
    }
  }
  if (id === 'drivers') {
    return { columns: ['#', 'Name', 'License no.', 'License expiry', 'Driver card expiry', 'Days left (card)', 'Profession', 'Phone'], rows: db.drivers.map((d, i) => [i + 1, d.name, d.licenseNo, fmtDate(d.license), fmtDate(d.driverCard), daysUntil(d.driverCard), d.profession, d.phone]) }
  }
  if (id === 'assets') return { sections: [assetReportData(db).section] }
  if (id === 'maintenance') {
    const rows = []
    db.vehicles.forEach((v) => v.maintenance.filter((m) => inRange(m.date)).forEach((m) => rows.push([m.date, fmtDate(m.date), v.plate, `${v.brand} ${v.model}`, v.user, m.detail, Number(m.amount)])))
    rows.sort((a, b) => (a[0] < b[0] ? 1 : -1))
    return { columns: ['Date', 'Plate', 'Vehicle', 'User', 'Work done', 'Amount (SAR)'], rows: rows.map((r) => r.slice(1)), totalRow: ['', '', '', '', 'Total', rows.reduce((a, r) => a + r[6], 0)] }
  }
  const ex = allExpiries(db).filter((e) => e.days <= 90)
  return { columns: ['Vehicle / driver', 'Document', 'Expiry date', 'Days left', 'Status'], rows: ex.map((e) => [e.title, EXPIRY[e.key].label, fmtDate(e.date), e.days, e.days < 0 ? 'EXPIRED' : e.days <= s.remindDays ? 'Renew now' : 'Upcoming']) }
}

export default function Reports() {
  const { db, toast, update } = useApp()
  const [id, setId] = useState('stock')
  const [from, setFrom] = useState(addDays(TODAY, -30))
  const [to, setTo] = useState(TODAY)
  const [month, setMonth] = useState(prevMonth)
  const R = REPORTS.find((r) => r.id === id)
  const data = useMemo(() => (R.monthly ? buildTools(db, month) : build(id, db, R.dated ? from : null, R.dated ? to : null)), [id, db, from, to, month, R.dated, R.monthly])
  const sections = data.sections || [{ columns: data.columns, rows: data.rows, totalRow: data.totalRow }]
  const rowCount = sections.reduce((a, s) => a + s.rows.length, 0)
  const title = `${R.label} report`
  const generated = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const sub = R.monthly ? monthLabel(month) : R.dated ? `${fmtDate(from)} to ${fmtDate(to)}` : `As of ${fmtDate(TODAY)}`
  const fname = `TI_${R.label.replace(/\s+/g, '_')}_${R.monthly ? month : TODAY}`

  const excel = async () => {
    await exportExcel({ title, sub: sub + (R.monthly || id === 'assets' ? ` · Generated ${generated}` : ''), sections, fname, sheet: R.label })
    update(() => {}, `${title} downloaded as Excel`, 'add')
    toast('Excel file downloaded')
  }
  const pdf = async () => {
    await exportPdf({ title, sub, sections, fname })
    update(() => {}, `${title} downloaded as PDF`, 'add')
    toast('PDF downloaded')
  }

  return (
    <div className="page">
      <PageHeader title="Reports" ar="التقارير" desc="Pick a report, check the preview, then download it as Excel or PDF to print, email or share on WhatsApp." />
      <div className="reppick">
        {REPORTS.map((r) => (
          <button key={r.id} className={cx('repcard', id === r.id && 'on')} onClick={() => setId(r.id)}>
            <span className="repcard-ic"><r.icon size={20} /></span><b>{r.label}</b><small>{r.desc}</small>
          </button>
        ))}
      </div>
      <section className="card flush">
        <div className="toolbar rep-bar">
          <div><h3>{title}</h3><span className="muted small">{sub} · {rowCount} rows</span></div>
          <span className="grow" />
          {R.dated && <div className="range"><CalendarRange size={16} /><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /><span>to</span><input type="date" value={to} min={from} max={TODAY} onChange={(e) => setTo(e.target.value)} /></div>}
          {R.monthly && <div className="range"><CalendarRange size={16} /><span>Month</span><input type="month" value={month} max={TODAY.slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Report month" /></div>}
          <Btn kind="excel" icon={FileSpreadsheet} onClick={excel} disabled={!rowCount}>Excel</Btn>
          <Btn kind="dark" icon={FileDown} onClick={pdf} disabled={!rowCount}>PDF</Btn>
        </div>
        <div className="tablewrap preview">
          {sections.map((s, k) => (
            <div key={k}>
              {s.title && <h4 className="rep-sec">{s.title}</h4>}
              <table className="tbl">
                <thead><tr>{s.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>{s.rows.slice(0, 60).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={typeof c === 'number' ? 'num' : ''}>{typeof c === 'number' ? c.toLocaleString() : c}</td>)}</tr>)}</tbody>
                {s.totalRow && s.rows.length > 0 && <tfoot><tr>{s.totalRow.map((c, j) => <td key={j} className={typeof c === 'number' ? 'num' : ''}><b>{typeof c === 'number' ? c.toLocaleString() : c}</b></td>)}</tr></tfoot>}
              </table>
              {s.rows.length > 60 && <p className="muted small pad">Showing 60 of {s.rows.length} rows. The download has all of them.</p>}
              {!s.rows.length && <p className="muted pad">{s.empty || 'Nothing in this period. Try a wider date range.'}</p>}
              {s.note && <p className="muted small pad">{s.note}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
