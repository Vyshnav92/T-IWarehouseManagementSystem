/* Excel and PDF downloads shared by every page. A report is a list of sections:
   { title?, columns, rows, totalRow?, empty? }. PDFs carry the company name and logo. */
import logoLight from './logo_L.png'
import { fmt2, round2, issueValue } from './data'

const stamp = () => new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export async function exportExcel({ title, sub, sections, fname, sheet }) {
  const XLSX = await import('xlsx')
  const aoa = [[`T&I Construction · ${title}`], [sub]]
  sections.forEach((s) => {
    aoa.push([])
    if (s.title) aoa.push([s.title.toUpperCase()])
    aoa.push(s.columns, ...s.rows)
    if (!s.rows.length && s.empty) aoa.push([s.empty])
    if (s.totalRow) aoa.push([], s.totalRow)
    if (s.note) aoa.push([], [s.note])
  })
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const widest = Math.max(...sections.map((s) => s.columns.length))
  ws['!cols'] = Array.from({ length: widest }, (_, i) => ({ wch: Math.min(40, Math.max(10, ...sections.flatMap((s) => [s.columns[i] || '', ...s.rows.map((r) => r[i] ?? '')]).map((c) => String(c).length)) + 2) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, (sheet || title).slice(0, 30))
  XLSX.writeFile(wb, fname + '.xlsx')
}

/** Builds the PDF. With print: true it opens the browser's print dialog instead of downloading. */
export async function exportPdf({ title, sub, sections, fname, print = false, money = true }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const generated = stamp()
  const doc = new jsPDF({ orientation: Math.max(...sections.map((s) => s.columns.length)) > 7 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  try { const img = await toDataUrl(logoLight); doc.addImage(img, 'PNG', 36, 26, 110, 49) } catch { /* logo optional */ }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(29, 31, 35); doc.text(title, W - 36, 46, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(110, 115, 122); doc.text(sub, W - 36, 62, { align: 'right' })
  doc.setDrawColor(200, 16, 46); doc.setLineWidth(2); doc.line(36, 86, W - 36, 86)
  let y = 98
  sections.forEach((s) => {
    if (s.title) {
      if (y > doc.internal.pageSize.getHeight() - 90) { doc.addPage(); y = 50 }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(29, 31, 35); doc.text(s.title, 36, y + 8); y += 18
    }
    const body = s.rows.length ? s.rows.map((r) => r.map((c) => (c ?? '') + '')) : [[{ content: s.empty || 'Nothing to show', colSpan: s.columns.length, styles: { textColor: [130, 130, 130] } }]]
    autoTable(doc, {
      startY: y, head: [s.columns], body,
      foot: s.totalRow ? [s.totalRow.map((c) => (typeof c === 'number' && money ? 'SAR ' + Math.round(c).toLocaleString('en-US') : c))] : undefined,
      styles: { fontSize: 8.5, cellPadding: 5, lineColor: [230, 231, 234], lineWidth: 0.5 },
      headStyles: { fillColor: [31, 33, 37], textColor: 255, fontStyle: 'bold' }, footStyles: { fillColor: [245, 245, 246], textColor: [29, 31, 35], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [249, 249, 250] }, margin: { left: 36, right: 36, bottom: 40 },
      didDrawPage: () => { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150); doc.text(`T&I Construction · Generated ${generated} · Page ${doc.getNumberOfPages()}`, 36, doc.internal.pageSize.getHeight() - 20) },
    })
    y = doc.lastAutoTable.finalY + 18
    if (s.note) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110, 115, 122); doc.text(s.note, 36, y); y += 14 }
    y += 8
  })
  if (print) {
    doc.autoPrint()
    const w = window.open(doc.output('bloburl'), '_blank')
    if (!w) doc.save(fname + '.pdf') // pop-up blocked: download instead
  } else doc.save(fname + '.pdf')
}

/** Stock out voucher (items only, never a price or value, R6) or, with invoice: true, the stock out invoice with the saved unit costs (R1). */
export async function exportVoucher(mv, materials, invoice = false) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight()
  const date = new Date(mv.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  try { doc.addImage(await toDataUrl(logoLight), 'PNG', 36, 26, 110, 49) } catch { /* logo optional */ }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(29, 31, 35); doc.text(invoice ? 'STOCK OUT INVOICE' : 'STOCK OUT VOUCHER', W - 36, 46, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(110, 115, 122); doc.text(`No. ${mv.no}     Date ${date}`, W - 36, 62, { align: 'right' })
  if (mv.cancelled) { doc.setFont('helvetica', 'bold'); doc.setTextColor(200, 16, 46); doc.text('CANCELLED', W - 36, 76, { align: 'right' }) }
  doc.setDrawColor(200, 16, 46); doc.setLineWidth(2); doc.line(36, 86, W - 36, 86)
  const meta = [['Project', mv.project], ['Request no.', mv.reqNo], ['Requested by', mv.reqName], ['Site engineer', mv.engineer], ['MTN', mv.mtn]]
  let y = 108
  doc.setFontSize(10)
  meta.forEach(([k, v], i) => {
    const x = i % 2 ? W / 2 + 10 : 36
    doc.setFont('helvetica', 'bold'); doc.setTextColor(110, 115, 122); doc.text(k + ':', x, y)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(29, 31, 35); doc.text(String(v || '—'), x + 80, y)
    if (i % 2) y += 16
  })
  y += 16
  if (mv.note) { doc.setTextColor(110, 115, 122); doc.text(doc.splitTextToSize('Note: ' + mv.note, W - 72), 36, y); y += 18 }
  const mat = (id) => materials.find((m) => m.id === id) || {}
  const val = issueValue(mv)
  autoTable(doc, {
    startY: y, head: [['#', 'Material', 'Unit', 'Qty', ...(invoice ? ['Unit price', 'Value (SAR)'] : [])]],
    body: mv.lines.map((l, i) => [i + 1, mat(l.materialId).name || '', mat(l.materialId).unit || '', String(l.qty),
      ...(invoice ? (l.unitCost == null ? ['Price not set', '—'] : [fmt2(l.unitCost), fmt2(round2(l.qty * l.unitCost))]) : [])]),
    foot: invoice ? [['', '', '', '', 'Total value', 'SAR ' + fmt2(val.total)]] : undefined,
    styles: { fontSize: 9.5, cellPadding: 6, lineColor: [230, 231, 234], lineWidth: 0.5 },
    headStyles: { fillColor: [31, 33, 37], textColor: 255, fontStyle: 'bold' }, alternateRowStyles: { fillColor: [249, 249, 250] },
    footStyles: { fillColor: [245, 245, 246], textColor: [29, 31, 35], fontStyle: 'bold', halign: 'right' },
    columnStyles: { 0: { cellWidth: 30 }, 2: { cellWidth: 50 }, 3: { cellWidth: 50, halign: 'right' }, 4: { cellWidth: 75, halign: 'right' }, 5: { cellWidth: 85, halign: 'right' } },
    margin: { left: 36, right: 36, top: 50, bottom: 50 },
  })
  y = doc.lastAutoTable.finalY + 18
  if (invoice && val.missing) { doc.setFontSize(9); doc.setTextColor(110, 115, 122); doc.text(`Total excludes ${val.missing} item${val.missing > 1 ? 's' : ''} without a price.`, 36, y) }
  if (!invoice) {
    y += 42
    if (y > H - 70) { doc.addPage(); y = 90 }
    doc.setFontSize(10); doc.setTextColor(29, 31, 35)
    doc.text('Issued by: ______________________', 36, y); doc.text('Received by: ______________________', W / 2 + 10, y)
  }
  const produced = `Produced on ${stamp()}`, n = doc.getNumberOfPages()
  for (let p = 1; p <= n; p++) {
    doc.setPage(p); doc.setFontSize(8); doc.setTextColor(150)
    doc.text(`T&I Construction · ${mv.no} · ${produced}`, 36, H - 20); doc.text(`Page ${p} of ${n}`, W - 36, H - 20, { align: 'right' })
  }
  doc.save(`${mv.no} ${invoice ? 'Invoice' : 'Voucher'} - ${mv.project || 'No project'}`.replace(/[\\/:*?"<>|]/g, '-') + '.pdf')
}
/** Download with a message either way, for every place that offers the voucher. */
export const downloadVoucher = (mv, db, toast, invoice = false) => exportVoucher(mv, db.materials, invoice)
  .then(() => toast(`${mv.no} ${invoice ? 'invoice' : 'voucher'} downloaded`))
  .catch(() => toast(`Couldn't make the ${mv.no} ${invoice ? 'invoice' : 'voucher'} PDF. Please try again.`, 'bad'))

function toDataUrl(src) {
  return new Promise((res, rej) => {
    if (src.startsWith('data:')) return res(src)
    const img = new Image()
    img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); res(c.toDataURL('image/png')) }
    img.onerror = rej
    img.src = src
  })
}
