import { useMemo, useState } from 'react'
import { Boxes, ArrowDownToLine, ArrowUpFromLine, Truck, Users, Wrench, BellRing, FileSpreadsheet, FileDown, CalendarRange } from 'lucide-react'
import { useApp } from '../store'
import { balances, stockStatus, STOCK_STATUS, KINDS, fmtDate, daysUntil, CONDITIONS, currentValue, allExpiries, EXPIRY, addDays, TODAY } from '../data'
import { PageHeader, Btn, cx } from '../ui'
import logoLight from '../logo_L.png'

const REPORTS = [
  { id: 'stock', label: 'Current stock', icon: Boxes, desc: 'Every material with what you have now', dated: false },
  { id: 'in', label: 'Stock in', icon: ArrowDownToLine, desc: 'Purchases and returns from sites', dated: true },
  { id: 'out', label: 'Stock out', icon: ArrowUpFromLine, desc: 'Materials sent to projects', dated: true },
  { id: 'vehicles', label: 'Vehicles', icon: Truck, desc: 'Full fleet list with expiry dates and value', dated: false },
  { id: 'drivers', label: 'Drivers', icon: Users, desc: 'Licenses and driver cards', dated: false },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench, desc: 'Workshop costs per vehicle', dated: true },
  { id: 'reminders', label: 'Expiry list', icon: BellRing, desc: 'Everything that expires in the next 90 days', dated: false },
]

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
  if (id === 'maintenance') {
    const rows = []
    db.vehicles.forEach((v) => v.maintenance.filter((m) => inRange(m.date)).forEach((m) => rows.push([m.date, fmtDate(m.date), v.plate, `${v.brand} ${v.model}`, v.user, m.detail, Number(m.amount)])))
    rows.sort((a, b) => (a[0] < b[0] ? 1 : -1))
    return { columns: ['Date', 'Plate', 'Vehicle', 'User', 'Work done', 'Amount (SAR)'], rows: rows.map((r) => r.slice(1)), total: rows.reduce((a, r) => a + r[6], 0) }
  }
  const ex = allExpiries(db).filter((e) => e.days <= 90)
  return { columns: ['Vehicle / driver', 'Document', 'Expiry date', 'Days left', 'Status'], rows: ex.map((e) => [e.title, EXPIRY[e.key].label, fmtDate(e.date), e.days, e.days < 0 ? 'EXPIRED' : e.days <= s.remindDays ? 'Renew now' : 'Upcoming']) }
}

export default function Reports() {
  const { db, toast, update } = useApp()
  const [id, setId] = useState('stock')
  const [from, setFrom] = useState(addDays(TODAY, -30))
  const [to, setTo] = useState(TODAY)
  const R = REPORTS.find((r) => r.id === id)
  const data = useMemo(() => build(id, db, R.dated ? from : null, R.dated ? to : null), [id, db, from, to, R.dated])
  const title = `${R.label} report`
  const sub = R.dated ? `${fmtDate(from)} to ${fmtDate(to)}` : `As of ${fmtDate(TODAY)}`
  const fname = `TI_${R.label.replace(/\s+/g, '_')}_${TODAY}`

  const excel = async () => {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet([[`T&I Construction · ${title}`], [sub], [], data.columns, ...data.rows, ...(data.total != null ? [[], ['', '', '', '', 'Total', data.total]] : [])])
    ws['!cols'] = data.columns.map((c, i) => ({ wch: Math.min(40, Math.max(c.length, ...data.rows.map((r) => String(r[i] ?? '').length)) + 2) }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, R.label.slice(0, 30))
    XLSX.writeFile(wb, fname + '.xlsx')
    update(() => {}, `${title} downloaded as Excel`, 'add')
    toast('Excel file downloaded')
  }
  const pdf = async () => {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
    const doc = new jsPDF({ orientation: data.columns.length > 7 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
    const W = doc.internal.pageSize.getWidth()
    try { const img = await toDataUrl(logoLight); doc.addImage(img, 'PNG', 36, 26, 110, 49) } catch { /* logo optional */ }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(29, 31, 35); doc.text(title, W - 36, 46, { align: 'right' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(110, 115, 122); doc.text(sub, W - 36, 62, { align: 'right' })
    doc.setDrawColor(200, 16, 46); doc.setLineWidth(2); doc.line(36, 86, W - 36, 86)
    autoTable(doc, {
      startY: 98, head: [data.columns], body: data.rows.map((r) => r.map((c) => (c ?? '') + '')),
      foot: data.total != null ? [['', '', '', '', 'Total', 'SAR ' + Math.round(data.total).toLocaleString()]] : undefined,
      styles: { fontSize: 8.5, cellPadding: 5, lineColor: [230, 231, 234], lineWidth: 0.5 },
      headStyles: { fillColor: [31, 33, 37], textColor: 255, fontStyle: 'bold' }, footStyles: { fillColor: [245, 245, 246], textColor: [29, 31, 35], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [249, 249, 250] }, margin: { left: 36, right: 36 },
      didDrawPage: () => { doc.setFontSize(8); doc.setTextColor(150); doc.text(`T&I Construction · Generated ${fmtDate(TODAY)} · Page ${doc.getNumberOfPages()}`, 36, doc.internal.pageSize.getHeight() - 20) },
    })
    doc.save(fname + '.pdf')
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
          <div><h3>{title}</h3><span className="muted small">{sub} · {data.rows.length} rows</span></div>
          <span className="grow" />
          {R.dated && <div className="range"><CalendarRange size={16} /><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /><span>to</span><input type="date" value={to} min={from} max={TODAY} onChange={(e) => setTo(e.target.value)} /></div>}
          <Btn kind="excel" icon={FileSpreadsheet} onClick={excel} disabled={!data.rows.length}>Excel</Btn>
          <Btn kind="dark" icon={FileDown} onClick={pdf} disabled={!data.rows.length}>PDF</Btn>
        </div>
        <div className="tablewrap preview">
          <table className="tbl">
            <thead><tr>{data.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{data.rows.slice(0, 60).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={typeof c === 'number' ? 'num' : ''}>{typeof c === 'number' ? c.toLocaleString() : c}</td>)}</tr>)}</tbody>
          </table>
          {data.rows.length > 60 && <p className="muted small pad">Showing 60 of {data.rows.length} rows. The download has all of them.</p>}
          {!data.rows.length && <p className="muted pad">Nothing in this period. Try a wider date range.</p>}
        </div>
      </section>
    </div>
  )
}

function toDataUrl(src) {
  return new Promise((res, rej) => {
    if (src.startsWith('data:')) return res(src)
    const img = new Image()
    img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); res(c.toDataURL('image/png')) }
    img.onerror = rej
    img.src = src
  })
}
