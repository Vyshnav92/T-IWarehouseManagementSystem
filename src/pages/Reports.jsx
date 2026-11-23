import { useMemo, useState } from 'react'
import { Boxes, ArrowDownToLine, ArrowUpFromLine, Truck, Users, Wrench, BellRing, FileSpreadsheet, FileDown, CalendarRange, Landmark, Receipt, Search, Download } from 'lucide-react'
import { useApp } from '../store'
import { balances, stockStatus, STOCK_STATUS, KINDS, fmtDate, daysUntil, CONDITIONS, currentValue, allExpiries, EXPIRY, addDays, TODAY, stockMaterials, lowLimit, issueValue, fmt2, fmtNum, round2 } from '../data'
import { PageHeader, Btn, cx } from '../ui'
import { exportExcel, exportPdf, downloadVoucher } from '../exporter'
import { assetReportData } from '../AssetOverlays'

const REPORTS = [
  { id: 'stock', label: 'Current stock', icon: Boxes, desc: 'Every material with what you have now', dated: false },
  { id: 'in', label: 'Stock in', icon: ArrowDownToLine, desc: 'Purchases and returns from sites', dated: true },
  { id: 'out', label: 'Stock out', icon: ArrowUpFromLine, desc: 'Materials sent to projects', dated: true },
  { id: 'invoice', label: 'Stock out invoice', icon: Receipt, desc: 'Each stock out with its value, and an invoice PDF', dated: true },
  { id: 'vehicles', label: 'Vehicles', icon: Truck, desc: 'Full fleet list with expiry dates and value', dated: false },
  { id: 'drivers', label: 'Drivers', icon: Users, desc: 'Licenses and driver cards', dated: false },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench, desc: 'Workshop costs per vehicle', dated: true },
  { id: 'reminders', label: 'Expiry list', icon: BellRing, desc: 'Everything that expires in the next 90 days', dated: false },
  { id: 'assets', label: 'Total assets value', icon: Landmark, desc: 'Current value by asset type, with a grand total', dated: false },
]

function build(id, db, from, to, { q = '', project = '' } = {}) {
  const inRange = (d) => (!from || d >= from) && (!to || d <= to)
  const mat = (mid) => db.materials.find((m) => m.id === mid) || {}
  const s = db.settings
  if (id === 'stock') {
    const b = balances(db)
    return { columns: ['#', 'Material', 'Category', 'Unit', 'In stock', 'Status'], rows: stockMaterials(db).map((m, i) => [i + 1, m.name, m.category, m.unit, b[m.id], STOCK_STATUS[stockStatus(b[m.id], lowLimit(db))].label]) }
  }
  if (id === 'invoice') {
    const s = q.trim().toLowerCase()
    const list = db.movements.filter((mv) => !mv.cancelled && mv.kind === 'issue' && inRange(mv.date) && (!project || mv.project === project) && (!s || [mv.no, mv.project, mv.reqName, mv.engineer].join(' ').toLowerCase().includes(s))).reverse()
    let total = 0, missing = 0
    const rows = list.map((mv) => {
      const v = issueValue(mv)
      total += v.total; missing += v.missing
      return [mv.no, fmtDate(mv.date), mv.project, mv.reqName || '—', mv.engineer || '—', mv.lines.map((l) => `${fmtNum(l.qty)} x ${mat(l.materialId).name}`).join(', '),
        v.missing === mv.lines.length ? 'Price not set' : v.missing ? `${fmt2(v.total)} *` : v.total]
    })
    return {
      columns: ['No.', 'Date', 'Project', 'Requested by', 'Site engineer', 'Details', 'Value (SAR)'], rows, invoices: list,
      totalRow: ['', '', '', '', '', 'Total', round2(total)],
      note: missing ? `* and "Price not set": the total excludes ${missing} item${missing > 1 ? 's' : ''} without a price.` : undefined,
    }
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
  const [q, setQ] = useState('')
  const [project, setProject] = useState('')
  const R = REPORTS.find((r) => r.id === id)
  const data = useMemo(() => build(id, db, R.dated ? from : null, R.dated ? to : null, { q, project }), [id, db, from, to, R.dated, q, project])
  const sections = data.sections || [{ columns: data.columns, rows: data.rows, totalRow: data.totalRow, note: data.note, invoices: data.invoices }]
  const pick = (r) => { setId(r.id); if (r.id === 'invoice') { setFrom(TODAY.slice(0, 8) + '01'); setTo(TODAY) } } // the invoice report opens on this month
  const rowCount = sections.reduce((a, s) => a + s.rows.length, 0)
  const title = `${R.label} report`
  const generated = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const sub = (R.dated ? `${fmtDate(from)} to ${fmtDate(to)}` : `As of ${fmtDate(TODAY)}`) + (id === 'invoice' && project ? ` · ${project}` : '')
  const fname = `TI_${R.label.replace(/\s+/g, '_')}_${TODAY}`

  const excel = async () => {
    await exportExcel({ title, sub: sub + (id === 'assets' ? ` · Generated ${generated}` : ''), sections, fname, sheet: R.label })
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
          <button key={r.id} className={cx('repcard', id === r.id && 'on')} onClick={() => pick(r)}>
            <span className="repcard-ic"><r.icon size={20} /></span><b>{r.label}</b><small>{r.desc}</small>
          </button>
        ))}
      </div>
      <section className="card flush">
        <div className="toolbar rep-bar">
          <div><h3>{title}</h3><span className="muted small">{sub} · {rowCount} rows</span></div>
          <span className="grow" />
          {R.dated && <div className="range"><CalendarRange size={16} /><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /><span>to</span><input type="date" value={to} min={from} max={TODAY} onChange={(e) => setTo(e.target.value)} /></div>}
          {id === 'invoice' && <>
            <div className="search sm"><Search size={16} className="search-ic" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search no., project, requester…" /></div>
            <select className="sel" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project"><option value="">All projects</option>{db.projects.map((p) => <option key={p}>{p}</option>)}</select>
          </>}
          <Btn kind="excel" icon={FileSpreadsheet} onClick={excel} disabled={!rowCount}>Excel</Btn>
          <Btn kind="dark" icon={FileDown} onClick={pdf} disabled={!rowCount}>PDF</Btn>
        </div>
        <div className="tablewrap preview">
          {sections.map((s, k) => (
            <div key={k}>
              {s.title && <h4 className="rep-sec">{s.title}</h4>}
              <table className="tbl">
                <thead><tr>{s.columns.map((c) => <th key={c}>{c}</th>)}{s.invoices && <th>Invoice</th>}</tr></thead>
                <tbody>{s.rows.slice(0, 60).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={typeof c === 'number' ? 'num' : ''}>{typeof c === 'number' ? c.toLocaleString() : c}</td>)}
                  {s.invoices && <td><button className="iconbtn sm" title="Download invoice" aria-label={`Download invoice ${s.invoices[i].no}`} onClick={() => downloadVoucher(s.invoices[i], db, toast, true)}><Download size={17} /></button></td>}</tr>)}</tbody>
                {s.totalRow && s.rows.length > 0 && <tfoot><tr>{s.totalRow.map((c, j) => <td key={j} className={typeof c === 'number' ? 'num' : ''}><b>{typeof c === 'number' ? c.toLocaleString() : c}</b></td>)}{s.invoices && <td />}</tr></tfoot>}
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
