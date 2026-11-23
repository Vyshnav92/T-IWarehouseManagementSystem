import { useMemo, useState, useEffect, useRef } from 'react'
import {
  PackagePlus, PackageMinus, Undo2, Plus, Trash2, Sparkles, AlertTriangle, ScanLine, CheckCircle2, Wand2, CalendarCheck, Wrench,
  Truck, Users, Pencil, MapPin, User, Gauge, Phone, Ban, Package, FileText, Lightbulb, ShieldCheck, Eye, Download, Upload, Printer,
} from 'lucide-react'
import { useApp } from './store'
import {
  KINDS, balances, nextNo, TODAY, fmtDate, fmtNum, fmtSAR, uid, EXPIRY, addMonths, daysUntil, currentValue, maintSpend,
  CONDITIONS, OWNERSHIP, VEHICLE_DOCS, DRIVER_DOCS, vehicleExpiryKeys, DRIVER_EXPIRY_KEYS, STOCK_STATUS, stockStatus, usageRate, lowLimit, isTool, stockMaterials, normName, unitCost, returnCost, round2, fmt2,
} from './data'
import { parseEntry, typicalIssue, simulateReadExpiry, simulateReadBill } from './ai'
import { Modal, Drawer, Btn, Pill, Field, FileSlot, ExpiryPill, AiTag, Empty, DocViewer, cx, fileUrl, downloadRef } from './ui'
import { ASSET_OVERLAYS, useFromAssets } from './AssetOverlays'
import { downloadVoucher } from './exporter'

export default function Overlays() {
  const { stack, close } = useApp()
  return stack.map(({ key, overlay, props }) => {
    const C = MAP[overlay]
    if (!C) { console.error(`Unknown overlay "${overlay}"`); return null }
    return <C key={key} {...props} onClose={close} />
  })
}

// ======================= stock entry (in / out) =======================
const blankLine = () => ({ key: uid('l'), materialId: '', qty: '', price: '', newName: '', unit: 'NOS', category: '' })

const ENTRY_FIELDS = { date: 'Date', vendor: 'Supplier', billNo: 'Bill no.', reqNo: 'Request no.', reqName: 'Requested by', project: 'Project', engineer: 'Site engineer', mtn: 'MTN', note: 'Note' }

function EntryForm({ kind: k0 = 'issue', prefill, editId, onClose }) {
  const { db, update, toast, saveFile } = useApp()
  const orig = editId ? db.movements.find((x) => x.id === editId) : null
  // when editing, the entry's own quantities are given back first, so the stock checks see the stock without it
  const bal = useMemo(() => { const b = balances(db); if (orig && !orig.cancelled) orig.lines.forEach((l) => { b[l.materialId] -= KINDS[orig.kind].sign * l.qty }); return b }, [db, orig])
  const [kind, setKind] = useState(orig?.kind || prefill?.kind || k0)
  const [f, setF] = useState(() => {
    const src = orig || prefill || {}
    return Object.fromEntries(Object.keys(ENTRY_FIELDS).map((k) => [k, src[k] || (k === 'date' ? TODAY : '')]))
  })
  const [lines, setLines] = useState(() => (orig ? orig.lines.map((l) => ({ ...blankLine(), materialId: l.materialId, qty: String(l.qty), price: l.unitPrice == null ? '' : String(l.unitPrice) }))
    : prefill?.lines?.length ? prefill.lines.map((l) => ({ ...blankLine(), ...l })) : [blankLine()]))
  const [files, setFiles] = useState([])
  const [sentence, setSentence] = useState('')
  const [scanning, setScanning] = useState(false)
  const [err, setErr] = useState('')
  const K = KINDS[kind]
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  // quick picks: most-used materials for this kind (the app learns what you use)
  const quick = useMemo(() => {
    const c = {}
    db.movements.forEach((mv) => { if (mv.kind === kind && !mv.cancelled) mv.lines.forEach((l) => { c[l.materialId] = (c[l.materialId] || 0) + 1 }) })
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => db.materials.find((m) => m.id === id)).filter((m) => m && !isTool(m))
  }, [db, kind])

  const addMaterial = (id) => setLines((ls) => {
    if (ls.some((l) => l.materialId === id)) return ls
    const empty = ls.find((l) => !l.materialId)
    return empty ? ls.map((l) => (l === empty ? { ...l, materialId: id } : l)) : [...ls, { ...blankLine(), materialId: id }]
  })

  const fillFromSentence = () => {
    const p = parseEntry(sentence, db)
    if (!p.lines.length) { toast("I couldn't find any materials in that sentence. Try “20 cement bags to Wagamama”.", 'warn'); return }
    setKind(p.kind)
    setF((x) => ({ ...x, reqNo: p.reqNo || x.reqNo, reqName: p.reqName || x.reqName, project: p.project || x.project, engineer: p.engineer || x.engineer, vendor: p.vendor || x.vendor, mtn: p.mtn || x.mtn, billNo: p.billNo || x.billNo }))
    setLines(p.lines.map((l) => ({ ...blankLine(), ...l })))
    toast(`Filled ${p.lines.length} line${p.lines.length > 1 ? 's' : ''} from your sentence. Check them, then save.`)
  }
  const scanBill = async (file) => {
    const ref = await saveFile(file)
    setFiles((x) => [...x, ref])
    setScanning(true)
    setTimeout(() => {
      const r = simulateReadBill(db)
      setF((x) => ({ ...x, vendor: x.vendor || r.vendor, billNo: x.billNo || r.billNo }))
      setLines(r.lines.map((l) => ({ ...blankLine(), ...l })))
      setScanning(false)
      toast('Bill read: supplier, bill number and 3 lines filled in. Please check them.')
    }, 1800)
  }

  const limit = lowLimit(db)
  const mats = stockMaterials(db)
  const cats = [...new Set(mats.map((m) => m.category))]
  const units = [...new Set(['NOS', ...db.materials.map((m) => m.unit)])]
  // typing a name: an existing material (any capitals or spacing) is picked, anything else becomes a new material (purchases only)
  const pickByName = (key, v) => { const hit = mats.find((x) => normName(x.name) === normName(v)); setLine(key, hit ? { materialId: hit.id, newName: '' } : { materialId: '', newName: v }) }
  const similarTo = (v) => { const n = normName(v); return n.length < 3 ? null : mats.find((x) => { const m = normName(x.name); return m.includes(n) || n.includes(m) }) }
  const isNew = (l) => kind === 'purchase' && !l.materialId && l.newName.trim()
  const valid = lines.filter((l) => (l.materialId || isNew(l)) && Number(l.qty) > 0)
  const lineValue = (l) => (l.price === '' || l.qty === '' ? null : round2(Number(l.qty) * Number(l.price)))
  const buyTotal = round2(valid.reduce((a, l) => a + (lineValue(l) || 0), 0))
  const problems = valid.map((l) => {
    const m = db.materials.find((x) => x.id === l.materialId)
    if (!m) return null
    const q = Number(l.qty)
    if (kind === 'issue' && q > bal[l.materialId]) return { key: l.key, tone: 'bad', text: `Only ${fmtNum(bal[l.materialId])} ${m.unit} in stock. You can't send more than that.` }
    const typ = db.settings.smartChecks && kind === 'issue' ? typicalIssue(db, l.materialId) : null
    if (typ && q > typ * 3) return { key: l.key, tone: 'warn', text: `Unusual amount: you normally send about ${fmtNum(Math.round(typ))} at a time. Please double-check.`, ai: true }
    const after = bal[l.materialId] - q
    if (kind === 'issue' && after < limit) return { key: l.key, tone: 'warn', text: `After this, ${m.name} will have ${fmtNum(after)} ${m.unit} left (below ${limit}).` }
    return null
  }).filter(Boolean)
  const blocking = problems.some((p) => p.tone === 'bad')

  const save = () => {
    if (!valid.length) return setErr('Add at least one material with a quantity.')
    if (kind === 'purchase' && !f.vendor.trim()) return setErr('Who did you buy from? Enter the supplier.')
    if (kind !== 'purchase' && !f.project.trim()) return setErr('Which project or site? Enter the project name.')
    if (blocking) return setErr('Fix the red line first: there is not enough stock.')
    if (kind === 'purchase' && valid.some((l) => l.price === '' || !(Number(l.price) >= 0))) return setErr('Enter the unit price (SAR) for every material.')
    const created = {} // normalised name -> new material, so the same name on two rows is created once
    for (const l of valid.filter(isNew)) {
      const name = l.newName.trim().replace(/\s+/g, ' ')
      if (name.length < 2 || name.length > 120) return setErr('A new material name must be 2 to 120 characters.')
      const dup = db.materials.find((x) => normName(x.name) === normName(name))
      if (dup) return setErr(`“${dup.name}” is a tool. Tools are managed in Hand tools, not the Warehouse.`)
      if (!l.category) return setErr(`Choose a category for the new material “${name}”.`)
      created[normName(name)] ||= { id: uid('m'), name, category: l.category, unit: l.unit || 'NOS', opening: 0, min: 0, createdAt: new Date().toISOString(), createdBy: db.settings.managerName || 'Manager' }
    }
    const newMats = Object.values(created)
    const by = db.settings.managerName || 'Manager'
    const newLines = valid.map((l) => {
      const materialId = l.materialId || created[normName(l.newName)].id, qty = Number(l.qty)
      const was = orig?.lines.find((o) => o.materialId === materialId)
      if (kind === 'purchase') return { materialId, qty, unitPrice: round2(Number(l.price)) }
      // a stock out keeps the cost saved when it was made; only a missing cost is filled in
      if (kind === 'issue') return { materialId, qty, unitCost: was?.unitCost ?? unitCost(db, materialId) }
      return { materialId, qty, unitCost: was?.unitCost ?? returnCost(db, f.project, materialId) }
    })
    if (orig) return saveEdit(newLines, newMats, by)
    const no = nextNo(db, kind)
    const mv = { id: uid('mv'), no, kind, ...f, attachments: files, cancelled: false, createdAt: new Date().toISOString(), createdBy: by, lines: newLines }
    update((d) => {
      d.materials.push(...newMats)
      d.movements.push(mv)
      if (f.project && !d.projects.includes(f.project)) d.projects.push(f.project)
      if (f.vendor && !d.vendors.includes(f.vendor)) d.vendors.push(f.vendor)
      if (f.engineer && !d.engineers.includes(f.engineer)) d.engineers.push(f.engineer)
    }, `${K.label} ${no} saved, ${valid.length} material${valid.length > 1 ? 's' : ''}${f.project ? ' · ' + f.project : f.vendor ? ' · ' + f.vendor : ''}${newMats.length ? ` · new: ${newMats.map((m) => m.name).join(', ')}` : ''}`, kind)
    toast(`${no} saved. Stock ${K.group === 'in' ? 'increased' : 'reduced'} for ${valid.length} material${valid.length > 1 ? 's' : ''}.${newMats.length ? ` ${newMats.length} new material${newMats.length > 1 ? 's' : ''} added.` : ''}`, 'ok',
      kind === 'issue' ? { label: 'Download voucher', run: () => downloadVoucher(mv, db, toast) } : undefined)
    onClose()
  }
  const saveEdit = (newLines, newMats, by) => {
    const nm = (id) => db.materials.find((m) => m.id === id)?.name || newMats.find((m) => m.id === id)?.name
    const price = (x) => (x == null ? 'not set' : 'SAR ' + fmt2(x))
    const changes = Object.entries(ENTRY_FIELDS).filter(([k]) => (orig[k] || '') !== (f[k] || '')).map(([k, label]) => `${label}: ${orig[k] || '—'} → ${f[k] || '—'}`)
    newLines.forEach((l) => {
      const o = orig.lines.find((x) => x.materialId === l.materialId)
      if (!o) return changes.push(`Added ${fmtNum(l.qty)} × ${nm(l.materialId)}${kind === 'purchase' ? ` at ${price(l.unitPrice)}` : ''}`)
      if (o.qty !== l.qty) changes.push(`${nm(l.materialId)}: quantity ${fmtNum(o.qty)} → ${fmtNum(l.qty)}`)
      if (kind === 'purchase' && o.unitPrice !== l.unitPrice) changes.push(`${nm(l.materialId)}: unit price ${price(o.unitPrice)} → ${price(l.unitPrice)}`)
      if (kind === 'issue' && o.unitCost == null && l.unitCost != null) changes.push(`${nm(l.materialId)}: unit cost set to ${price(l.unitCost)}`)
    })
    orig.lines.filter((o) => !newLines.some((l) => l.materialId === o.materialId)).forEach((o) => changes.push(`Removed ${nm(o.materialId)}`))
    if (!changes.length) { toast('Nothing was changed.'); return onClose() }
    update((d) => {
      d.materials.push(...newMats)
      const x = d.movements.find((y) => y.id === orig.id)
      Object.assign(x, f, { lines: newLines, history: [...(x.history || []), { at: new Date().toISOString(), by, changes }] })
      if (f.project && !d.projects.includes(f.project)) d.projects.push(f.project)
      if (f.vendor && !d.vendors.includes(f.vendor)) d.vendors.push(f.vendor)
      if (f.engineer && !d.engineers.includes(f.engineer)) d.engineers.push(f.engineer)
    }, `${orig.no} edited: ${changes.join('; ')}`, 'edit')
    toast(`${orig.no} updated. ${changes.length} change${changes.length > 1 ? 's' : ''} saved in its history.`)
    onClose()
  }

  const Icon = kind === 'purchase' ? PackagePlus : kind === 'return' ? Undo2 : PackageMinus
  return (
    <Modal title={orig ? `Edit ${K.group === 'in' ? 'stock in' : 'stock out'}` : K.group === 'in' ? 'Stock in' : 'Stock out'} sub={orig ? `${orig.no} · ${K.label}. Every change is kept in the entry's history.` : K.group === 'in' ? 'Materials coming INTO the warehouse. Stock goes up.' : 'Materials going OUT to a site. Stock goes down.'} icon={Icon} tone={K.group === 'in' ? 'ok' : 'warn'} onClose={onClose} width={820}
      footer={<><span className="grow muted small">{orig ? <>Editing <b className="mono">{orig.no}</b></> : <>Number <b className="mono">{nextNo(db, kind)}</b> will be given automatically</>}</span><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={blocking}>{orig ? 'Save changes' : `Save ${K.group === 'in' ? 'stock in' : 'stock out'}`}</Btn></>}>
      {!orig && <><div className="seg3">
        {['purchase', 'return', 'issue'].map((x) => {
          const I = x === 'purchase' ? PackagePlus : x === 'return' ? Undo2 : PackageMinus
          return <button key={x} className={cx('seg3-b', kind === x && 'on', 'k-' + x)} onClick={() => setKind(x)}><I size={18} /><span><b>{KINDS[x].label}</b><small>{x === 'purchase' ? 'From a supplier' : x === 'return' ? 'Back from a site' : 'To a project / site'}</small></span></button>
        })}
      </div>

      <div className="aibox">
        <div className="aibox-h"><Wand2 size={16} /><b>Type it like a message, and the form fills itself</b><AiTag /></div>
        <div className="aibox-row">
          <input value={sentence} onChange={(e) => setSentence(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sentence.trim() && fillFromSentence()}
            placeholder={kind === 'purchase' ? 'e.g. Bought 40 cement bags and 20 gypsum boards from Masdar, bill 48211' : kind === 'return' ? 'e.g. Wagamama returned 4 scaffolding and 2 ladders, mtn 1502' : 'e.g. Sent 20 PVC bends and 5 cable trays to Wagamama, engineer Azeem, req 512'} />
          <Btn kind="dark" size="sm" icon={Sparkles} onClick={fillFromSentence} disabled={!sentence.trim()}>Fill form</Btn>
        </div>
        {kind === 'purchase' && (
          <label className={cx('scanbill', scanning && 'busy')}>
            <ScanLine size={16} /> {scanning ? 'Reading the bill…' : 'Or upload a photo of the supplier bill. AI reads it for you'}
            <input type="file" accept="image/*,application/pdf" hidden disabled={scanning} onChange={(e) => { const x = e.target.files[0]; e.target.value = ''; if (x) scanBill(x) }} />
            {scanning && <span className="scanline" />}
          </label>
        )}
      </div></>}

      <div className="fgrid">
        <Field label="Date"><input type="date" value={f.date} max={TODAY} onChange={(e) => set('date', e.target.value)} /></Field>
        {kind === 'purchase' && <>
          <Field label="Supplier / vendor"><input list="dl-vendors" value={f.vendor} onChange={(e) => set('vendor', e.target.value)} placeholder="Who did you buy from?" /></Field>
          <Field label="Vendor bill no."><input value={f.billNo} onChange={(e) => set('billNo', e.target.value)} placeholder="e.g. INV-48211" /></Field>
          <Field label="Request no."><input value={f.reqNo} onChange={(e) => set('reqNo', e.target.value)} placeholder="e.g. 512" /></Field>
          <Field label="Requested by"><input list="dl-eng" value={f.reqName} onChange={(e) => set('reqName', e.target.value)} placeholder="Name" /></Field>
        </>}
        {kind !== 'purchase' && <>
          <Field label="Project / site"><input list="dl-projects" value={f.project} onChange={(e) => set('project', e.target.value)} placeholder="Which site?" /></Field>
          <Field label="Site engineer"><input list="dl-eng" value={f.engineer} onChange={(e) => set('engineer', e.target.value)} placeholder="Name" /></Field>
          {kind === 'issue' && <>
            <Field label="Request no."><input value={f.reqNo} onChange={(e) => set('reqNo', e.target.value)} placeholder="e.g. 512" /></Field>
            <Field label="Requested by"><input list="dl-eng" value={f.reqName} onChange={(e) => set('reqName', e.target.value)} placeholder="Name" /></Field>
          </>}
          <Field label="Material transfer no. (MTN)"><input value={f.mtn} onChange={(e) => set('mtn', e.target.value)} placeholder="e.g. 1502" /></Field>
        </>}
      </div>
      <datalist id="dl-vendors">{db.vendors.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-projects">{db.projects.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-eng">{db.engineers.map((v) => <option key={v} value={v} />)}</datalist>

      <div className="lines-h"><b>Materials</b><span className="muted small">{kind === 'purchase' ? 'Type or pick a material. A name that is not in the list is added as a new material when you save.' : 'Pick from the list. The unit and current stock show up on their own.'}</span></div>
      {quick.length > 0 && (
        <div className="quick"><span className="muted small"><Sparkles size={13} /> You use these most:</span>{quick.map((m) => <button key={m.id} className="chip" onClick={() => addMaterial(m.id)}><Plus size={13} />{m.name}</button>)}</div>
      )}
      <div className="lines">
        {lines.map((l) => {
          const m = db.materials.find((x) => x.id === l.materialId)
          const b = m ? bal[m.id] : null
          const after = m && l.qty !== '' ? b + K.sign * Number(l.qty) : null
          const p = problems.find((x) => x.key === l.key)
          const similar = isNew(l) ? similarTo(l.newName) : null
          const v = lineValue(l)
          return (
            <div key={l.key} className={cx('line', kind === 'purchase' && 'buy', p && 'has-' + p.tone)}>
              {kind === 'purchase' ? <input list="dl-mats" value={m ? m.name : l.newName} onChange={(e) => pickByName(l.key, e.target.value)} placeholder="Type or choose a material…" aria-label="Material" />
                : <select value={l.materialId} onChange={(e) => setLine(l.key, { materialId: e.target.value })}>
                  <option value="">Choose material…</option>
                  {m && !mats.includes(m) && <option value={m.id}>{m.name}</option>}
                  {cats.map((c) => (
                    <optgroup key={c} label={c}>{mats.filter((x) => x.category === c).map((x) => <option key={x.id} value={x.id} disabled={x.id !== l.materialId && lines.some((y) => y.materialId === x.id)}>{x.name}</option>)}</optgroup>
                  ))}
                </select>}
              <div className="qty"><input type="number" min="0" step="any" inputMode="decimal" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} placeholder="Qty" /><span>{m?.unit || (isNew(l) ? l.unit : '')}</span></div>
              {kind === 'purchase' && <div className="qty"><input type="number" min="0" step="0.01" inputMode="decimal" value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })} placeholder="Unit price" aria-label="Unit price in SAR" aria-invalid={l.price === '' && Number(l.qty) > 0} /><span>SAR</span></div>}
              <div className="line-info">{m ? <>In stock <b>{fmtNum(b)}</b>{after !== null && <> → <b className={after < 0 ? 'bad' : ''}>{fmtNum(after)}</b></>}</> : isNew(l) ? <Pill tone="info">New material</Pill> : <span className="muted">—</span>}{kind === 'purchase' && v !== null && <small className="block">Value <b>SAR {fmt2(v)}</b></small>}</div>
              <button className="iconbtn sm" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blankLine()]))} aria-label="Remove line"><Trash2 size={16} /></button>
              {p && <div className={cx('line-note', p.tone)}>{p.ai ? <Sparkles size={14} /> : <AlertTriangle size={14} />}{p.text}</div>}
              {isNew(l) && (
                <div className="line-new">
                  {similar && <span className="warnc">Did you mean <button type="button" className="linkish" onClick={() => setLine(l.key, { materialId: similar.id, newName: '' })}>{similar.name}</button>?</span>}
                  <span>New material “<b>{l.newName.trim()}</b>”:</span>
                  <select value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value })} aria-label="Unit">{units.map((u) => <option key={u}>{u}</option>)}</select>
                  <select value={l.category} onChange={(e) => setLine(l.key, { category: e.target.value })} aria-label="Category" aria-invalid={!l.category}><option value="">Category…</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <datalist id="dl-mats">{mats.map((x) => <option key={x.id} value={x.name} />)}</datalist>
      {kind === 'purchase' && valid.length > 0 && <div className="buy-total">Total <b>SAR {fmt2(buyTotal)}</b></div>}
      <Btn kind="soft" size="sm" icon={Plus} onClick={() => setLines((ls) => [...ls, blankLine()])}>Add another material</Btn>
      <Field label="Note (optional)"><input value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="Anything to remember about this entry" /></Field>
      {files.length > 0 && <div className="attached">{files.map((x) => <Pill key={x.id} tone="info"><FileText size={12} /> {x.name}</Pill>)}</div>}
      {err && <div className="formerr"><AlertTriangle size={16} />{err}</div>}
    </Modal>
  )
}

// ======================= movement detail =======================
function MovementDrawer({ id, onClose }) {
  const { db, update, toast, open } = useApp()
  const mv = db.movements.find((x) => x.id === id)
  const [reason, setReason] = useState('')
  const [asking, setAsking] = useState(false)
  if (!mv) return null
  const K = KINDS[mv.kind]
  const cancel = () => {
    update((d) => { const x = d.movements.find((y) => y.id === id); x.cancelled = true; x.cancelReason = reason || 'No reason given'; x.cancelledAt = new Date().toISOString() }, `${mv.no} cancelled — stock reversed`, 'cancel')
    toast(`${mv.no} cancelled. Stock has been put back.`, 'warn'); setAsking(false)
  }
  const rows = [
    ['Date', fmtDate(mv.date)], mv.vendor && ['Supplier', mv.vendor], mv.billNo && ['Vendor bill no.', mv.billNo], mv.project && ['Project / site', mv.project],
    mv.engineer && ['Site engineer', mv.engineer], mv.reqNo && ['Request no.', mv.reqNo], mv.reqName && ['Requested by', mv.reqName], mv.mtn && ['MTN', mv.mtn], mv.note && ['Note', mv.note],
  ].filter(Boolean)
  return (
    <Drawer title={mv.no} sub={K.label} badge={mv.cancelled ? <Pill tone="bad">Cancelled</Pill> : <Pill tone={K.tone}>{K.group === 'in' ? 'Stock in' : 'Stock out'}</Pill>} onClose={onClose}>
      {mv.cancelled && <div className="banner bad"><Ban size={18} /><div><b>This entry was cancelled.</b> Reason: {mv.cancelReason}. It no longer counts in stock.</div></div>}
      <dl className="kv">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <h4 className="sec">Materials</h4>
      <table className="tbl"><thead><tr><th>Material</th><th className="r">Quantity</th>{mv.kind === 'purchase' && <th className="r">Unit price</th>}</tr></thead>
        <tbody>{mv.lines.map((l, i) => { const m = db.materials.find((x) => x.id === l.materialId); return <tr key={i} className="click" onClick={() => open('material', { id: m.id })}><td>{m?.name}</td><td className="r num"><b>{K.sign > 0 ? '+' : '−'}{fmtNum(l.qty)}</b> {m?.unit}</td>
          {mv.kind === 'purchase' && <td className="r num">{l.unitPrice == null ? <Pill tone="warn">Price missing</Pill> : `SAR ${fmt2(l.unitPrice)}`}</td>}</tr> })}</tbody></table>
      <div className="row-gap">
        {!mv.cancelled && <Btn kind="ghost" size="sm" icon={Pencil} onClick={() => open('entry', { editId: mv.id })}>Edit</Btn>}
        {mv.kind === 'issue' && <><Btn kind="dark" size="sm" icon={Download} onClick={() => downloadVoucher(mv, db, toast)}>Download voucher</Btn><Btn kind="ghost" size="sm" icon={Printer} onClick={() => downloadVoucher(mv, db, toast, false, true)}>Print voucher</Btn></>}
      </div>
      {mv.history?.length > 0 && <><h4 className="sec">Changes</h4>
        <ul className="condlog">{[...mv.history].reverse().map((h, i) => (
          <li key={i}><div className="row"><span className="muted small num">{new Date(h.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span><span className="grow" /><span className="muted small">{h.by}</span></div>
            {h.changes.map((c, j) => <span key={j}>{c}</span>)}</li>
        ))}</ul></>}
      {mv.attachments?.length > 0 && <><h4 className="sec">Attachments</h4>{mv.attachments.map((a) => <FileSlot key={a.id} label="Vendor bill" fileRef={a} onUpload={() => {}} />)}</>}
      {!mv.cancelled && (
        <div className="danger-zone">
          {!asking ? <Btn kind="ghost" size="sm" icon={Ban} onClick={() => setAsking(true)}>Cancel this entry</Btn> : (
            <div className="stack-sm">
              <b>Cancel {mv.no}?</b><span className="muted small">The quantities are reversed. The entry stays in the history, marked as cancelled.</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. entered twice by mistake" />
              <div className="row-gap"><Btn kind="danger" size="sm" onClick={cancel}>Yes, cancel it</Btn><Btn kind="ghost" size="sm" onClick={() => setAsking(false)}>Keep it</Btn></div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  )
}

// ======================= material ledger =======================
function MaterialDrawer({ id, onClose }) {
  const { db, update, open, toast } = useApp()
  const m = db.materials.find((x) => x.id === id)
  const bal = useMemo(() => balances(db), [db])
  if (!m) return null
  const st = stockStatus(bal[m.id], lowLimit(db))
  const rate = usageRate(db, m.id)
  let run = m.opening
  const ledger = db.movements.filter((mv) => mv.lines.some((l) => l.materialId === id)).map((mv) => {
    const q = mv.lines.filter((l) => l.materialId === id).reduce((a, l) => a + l.qty, 0) * KINDS[mv.kind].sign
    if (!mv.cancelled) run += q
    return { mv, q, run }
  }).reverse()
  return (
    <Drawer title={m.name} sub={`${m.category} · counted in ${m.unit}`} badge={isTool(m) ? <Pill tone="plain">Tool (archived)</Pill> : m.active === false ? <Pill tone="plain">Deactivated</Pill> : <Pill tone={STOCK_STATUS[st].tone} dot>{STOCK_STATUS[st].label}</Pill>} onClose={onClose}>
      {!isTool(m) && <div className="row-gap">
        <Btn kind="ghost" size="sm" icon={Pencil} onClick={() => open('materialForm', { id })}>Edit</Btn>
        <Btn kind="ghost" size="sm" icon={Ban} onClick={() => { const on = m.active === false; update((d) => { d.materials.find((x) => x.id === id).active = on }, `${m.name} ${on ? 'reactivated' : 'deactivated'}`); toast(on ? `${m.name} is back in the lists` : `${m.name} deactivated. Its history is kept.`) }}>{m.active === false ? 'Reactivate' : 'Deactivate'}</Btn>
        {m.createdBy && <span className="muted small">Added by {m.createdBy} on {fmtDate(m.createdAt.slice(0, 10))}</span>}
      </div>}
      <div className="stats3">
        <div><span>In stock now</span><b>{fmtNum(bal[m.id])}<small> {m.unit}</small></b></div>
        <div><span>Used per week</span><b>{fmtNum(Math.round(rate * 7 * 10) / 10)}</b></div>
        <div><span>Lasts about</span><b>{rate > 0 ? `${Math.floor(bal[m.id] / rate)} days` : '—'}</b></div>
      </div>
      <h4 className="sec">History <span className="muted small">every movement, newest first</span></h4>
      <table className="tbl"><thead><tr><th>Date</th><th>Entry</th><th className="r">In / out</th><th className="r">Balance</th></tr></thead>
        <tbody>
          {ledger.map(({ mv, q, run }) => (
            <tr key={mv.id} className={cx('click', mv.cancelled && 'struck')} onClick={() => open('movement', { id: mv.id })}>
              <td className="num">{fmtDate(mv.date)}</td>
              <td><span className="mono">{mv.no}</span><small className="muted block">{mv.project || mv.vendor}</small></td>
              <td className={cx('r num', q > 0 ? 'okc' : 'warnc')}><b>{q > 0 ? '+' : '−'}{fmtNum(Math.abs(q))}</b></td>
              <td className="r num">{mv.cancelled ? '—' : fmtNum(run)}</td>
            </tr>
          ))}
          <tr className="opening"><td colSpan={3}>Opening stock</td><td className="r num">{fmtNum(m.opening)}</td></tr>
        </tbody></table>
    </Drawer>
  )
}

function MaterialForm({ id, onClose }) {
  const { db, update, toast } = useApp()
  const ed = id ? db.materials.find((m) => m.id === id) : null
  const cats = [...new Set(stockMaterials(db).map((m) => m.category))]
  const [f, setF] = useState(() => (ed ? { name: ed.name, category: ed.category, unit: ed.unit } : { name: '', category: cats[0], unit: 'NOS', opening: '' }))
  const [err, setErr] = useState('')
  const save = () => {
    const name = f.name.trim().replace(/\s+/g, ' ')
    if (name.length < 2 || name.length > 120) return setErr('The material name must be 2 to 120 characters.')
    if (db.materials.some((m) => m.id !== id && normName(m.name) === normName(name))) return setErr('That material already exists.')
    if (normName(f.category) === 'tools') return setErr('Tools are managed in Hand tools, not the Warehouse.')
    if (ed) {
      const changes = [['name', 'name'], ['category', 'category'], ['unit', 'unit']].filter(([k]) => ed[k] !== (k === 'name' ? name : f[k])).map(([k, l]) => `${l} ${ed[k]} → ${k === 'name' ? name : f[k]}`)
      if (changes.length) update((d) => { Object.assign(d.materials.find((m) => m.id === id), { name, category: f.category || 'General', unit: f.unit }) }, `${ed.name}: ${changes.join(', ')}`)
      toast(changes.length ? 'Material updated' : 'Nothing was changed.'); return onClose()
    }
    update((d) => { d.materials.push({ id: uid('m'), name, category: f.category || 'General', unit: f.unit, opening: Number(f.opening) || 0, min: 0, createdAt: new Date().toISOString(), createdBy: db.settings.managerName || 'Manager' }) }, `New material added: ${name}`, 'add')
    toast('Material added'); onClose()
  }
  const units = [...new Set(['NOS', 'ROLL', 'BAG', 'BOX', 'SQM', 'M', 'KG', 'LTR', 'SET', ...(ed ? [ed.unit] : [])])]
  return (
    <Modal title={ed ? 'Edit material' : 'Add a new material'} sub={ed ? 'Old entries show the new name too' : 'Add it once, then pick it from the list every time'} icon={Package} onClose={onClose} width={560}
      footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save}>{ed ? 'Save changes' : 'Add material'}</Btn></>}>
      <div className="fgrid">
        <Field label="Material name" span={2}><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder='e.g. 2" PVC Bend' autoFocus /></Field>
        <Field label="Category"><input list="dl-cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
        <Field label="Unit"><select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>{units.map((u) => <option key={u}>{u}</option>)}</select></Field>
        {!ed && <Field label="Stock you have now"><input type="number" min="0" value={f.opening} onChange={(e) => setF({ ...f, opening: e.target.value })} placeholder="0" /></Field>}
      </div>
      <datalist id="dl-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
      {err && <div className="formerr"><AlertTriangle size={16} />{err}</div>}
    </Modal>
  )
}

// ======================= AI document reading =======================
/** Upload → "reading" animation → proposes the expiry date found on the document. */
function useDocUpload({ entity, id, docKey, reads, label }) {
  const { db, update, saveFile, open, toast } = useApp()
  return async (file) => {
    const ref = await saveFile(file)
    const list = entity === 'vehicle' ? 'vehicles' : 'drivers'
    const ent = db[list].find((x) => x.id === id)
    update((d) => { d[list].find((x) => x.id === id).docs[docKey] = ref }, `${label} uploaded for ${ent.plate || ent.name}`, 'upload')
    if (reads) open('readDoc', { entity, id, expKey: reads, fileRef: ref, label })
    else toast(`${label} uploaded`)
  }
}

function ReadDocModal({ entity, id, expKey: k, fileRef, label, onClose }) {
  const { db, update, toast } = useApp()
  const list = entity === 'vehicle' ? 'vehicles' : 'drivers'
  const ent = db[list].find((x) => x.id === id)
  const [phase, setPhase] = useState('reading')
  const [found] = useState(() => simulateReadExpiry(ent?.[k], db.settings.periods[k]))
  const [date, setDate] = useState(found.date)
  useEffect(() => { const t = setTimeout(() => setPhase('done'), 2000); return () => clearTimeout(t) }, [])
  if (!ent) return null
  const apply = () => {
    update((d) => { d[list].find((x) => x.id === id)[k] = date }, `${EXPIRY[k].label} for ${ent.plate || ent.name} updated to ${fmtDate(date)} (read from document)`, 'spark')
    toast(`New ${EXPIRY[k].short} date saved. The reminder is cleared.`); onClose()
  }
  return (
    <Modal title={phase === 'reading' ? 'Reading the document…' : 'Expiry date found'} sub={`${label} · ${ent.plate || ent.name}`} icon={ScanLine} tone="ai" onClose={onClose} width={560}
      footer={phase === 'done' && <><Btn kind="ghost" onClick={onClose}>Not now</Btn><Btn icon={CheckCircle2} onClick={apply}>Yes, update the date</Btn></>}>
      <div className="readdoc">
        <div className={cx('readdoc-img', phase === 'reading' && 'scanning')}><DocThumb fileRef={fileRef} />{phase === 'reading' && <span className="scanline" />}</div>
        {phase === 'reading' ? (
          <div className="readdoc-t"><b>Looking for the expiry date</b><p className="muted">The assistant reads the photo or PDF, so you don't have to type the date.</p><div className="dots"><i /><i /><i /></div></div>
        ) : (
          <div className="readdoc-t">
            <AiTag>{Math.round(found.confidence * 100)}% sure</AiTag>
            <span className="muted small">New {EXPIRY[k].label} expiry</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bigdate" />
            <p className="muted small">Was <b>{fmtDate(ent[k])}</b>. If the date is wrong, change it before saving.</p>
          </div>
        )}
      </div>
    </Modal>
  )
}
function DocThumb({ fileRef }) {
  const url = fileUrl(fileRef)
  if (!url || /pdf/.test(fileRef?.type || '')) return <FileText size={40} />
  return <img src={url} alt="" />
}

// ======================= renew =======================
function RenewModal({ entity, id, expKey, onClose }) {
  const { db, update, toast, saveFile } = useApp()
  const list = entity === 'vehicle' ? 'vehicles' : 'drivers'
  const ent = db[list].find((x) => x.id === id)
  const period = db.settings.periods[expKey]
  const base = ent && daysUntil(ent[expKey]) > 0 ? ent[expKey] : TODAY
  const [date, setDate] = useState(addMonths(base, period))
  const [file, setFile] = useState(null)
  if (!ent) return null
  const docKey = { registration: 'istimara', opCard: 'opCardDoc', license: 'licenseDoc', driverCard: 'driverCardDoc' }[expKey]
  const save = () => {
    update((d) => { const x = d[list].find((y) => y.id === id); x[expKey] = date; if (file && docKey) x.docs[docKey] = file }, `${EXPIRY[expKey].label} renewed for ${ent.plate || ent.name} until ${fmtDate(date)}`, 'renew')
    toast(`Renewed until ${fmtDate(date)}. Reminders for this stop now.`); onClose()
  }
  return (
    <Modal title={`Renew ${EXPIRY[expKey].label}`} sub={`${ent.plate || ent.name}${ent.brand ? ` · ${ent.brand} ${ent.model}` : ''}`} icon={CalendarCheck} tone="ok" onClose={onClose} width={540}
      footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn icon={CheckCircle2} onClick={save}>Save new date</Btn></>}>
      <div className="renew">
        <div className="renew-old"><span className="muted small">Current expiry</span><b>{fmtDate(ent[expKey])}</b><ExpiryPill date={ent[expKey]} remindDays={db.settings.remindDays} /></div>
        <div className="renew-arrow">→</div>
        <div className="renew-new"><span className="muted small">New expiry</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bigdate" /><span className="muted small">Suggested: +{period >= 12 ? `${period / 12} year${period > 12 ? 's' : ''}` : `${period} months`}, the usual renewal period</span></div>
      </div>
      {docKey && (
        <label className="dropzone">
          <input type="file" accept="image/*,application/pdf" hidden onChange={async (e) => { const x = e.target.files[0]; e.target.value = ''; if (x) setFile(await saveFile(x)) }} />
          {file ? <><CheckCircle2 size={18} className="okc" /> {file.name} attached</> : <><FileText size={18} /> Attach the new document (optional)</>}
        </label>
      )}
      <p className="muted small">Until the new date is saved, you get a reminder every day.</p>
    </Modal>
  )
}

// ======================= vehicle =======================
function VehicleDrawer({ id, tab: t0, onClose }) {
  const { db, open, update, toast } = useApp()
  const v = db.vehicles.find((x) => x.id === id)
  const [tab, setTab] = useState(t0 || 'overview')
  if (!v) return null
  const s = db.settings
  const value = currentValue(v, s.depreciation)
  const spend = maintSpend(v)
  const c = CONDITIONS[v.condition]
  const docs = VEHICLE_DOCS.filter((d) => !d.heavyOnly || v.type === 'heavy')
  const total = v.maintenance.reduce((a, m) => a + Number(m.amount || 0), 0)
  const ratio = value ? spend / value : 0
  return (
    <Drawer wide title={v.plate} sub={`${v.brand} ${v.model} · ${v.year} · ${v.type === 'heavy' ? 'Heavy vehicle' : 'Car'}`} badge={<Pill tone={c.tone} dot>{c.label}</Pill>} onClose={onClose}
      actions={<Btn kind="ghost" size="sm" icon={Pencil} onClick={() => open('vehicleForm', { id })}>Edit</Btn>}>
      <div className="dtabs">
        {[['overview', 'Overview'], ['documents', 'Documents'], ['maintenance', `Maintenance (${v.maintenance.length})`], ['indemnity', (v.indemnityDocs || []).length ? `Indemnity (${v.indemnityDocs.length})` : 'Indemnity']].map(([k, l]) => <button key={k} className={cx('dtab', tab === k && 'on')} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'overview' && <>
        <div className="facts">
          <div><User size={16} /><span>Used by</span><b>{v.user || '—'}</b></div>
          <div><MapPin size={16} /><span>Location</span><b>{v.location || '—'}</b></div>
          <div><Truck size={16} /><span>Ownership</span><b>{v.ownership}</b></div>
          <div><Gauge size={16} /><span>Worth today</span><b>{fmtSAR(value)}</b></div>
        </div>
        <h4 className="sec">Expiry dates <span className="muted small">reminders start {s.remindDays} days before</span></h4>
        <div className="exps">
          {vehicleExpiryKeys(v).map((k) => (
            <div key={k} className="exp">
              <div className="grow"><b>{EXPIRY[k].label}</b><span className="ar small">{EXPIRY[k].ar}</span><span className="num">{fmtDate(v[k])}</span></div>
              <ExpiryPill date={v[k]} remindDays={s.remindDays} />
              <Btn kind={daysUntil(v[k]) <= s.remindDays ? 'primary' : 'ghost'} size="sm" icon={CalendarCheck} onClick={() => open('renew', { entity: 'vehicle', id, expKey: k })}>Renew</Btn>
            </div>
          ))}
        </div>
        <h4 className="sec">Value <span className="muted small">drops {s.depreciation}% every year</span></h4>
        <DepreciationChart v={v} rate={s.depreciation} />
        {ratio >= 0.08 && (
          <div className="insight"><Lightbulb size={18} /><div><b>Smart tip <AiTag /></b><p>Repairs in the last 12 months cost <b>{fmtSAR(spend)}</b>, which is {Math.round(ratio * 100)}% of what this vehicle is worth today ({fmtSAR(value)}). {ratio > 0.15 ? 'Replacing it may cost less than keeping it.' : 'Keep an eye on it.'}</p></div></div>
        )}
        <div className="cond">
          <span className="muted small">Condition</span>
          <div className="seg">
            {Object.entries(CONDITIONS).map(([k, x]) => <button key={k} className={cx('segb', v.condition === k && 'on', 'tone-' + x.tone)} onClick={() => { update((d) => { d.vehicles.find((y) => y.id === id).condition = k }, `${v.plate} condition set to ${x.label}`); toast('Condition updated') }}>{x.label}</button>)}
          </div>
        </div>
      </>}
      {tab === 'documents' && <>
        <p className="muted small mb">Keep every paper for this vehicle here. Upload a photo or PDF, then view or download it any time. <AiTag>AI</AiTag> slots read the expiry date for you.</p>
        <div className="slots">{docs.map((d) => <VehicleSlot key={d.key} v={v} d={d} />)}</div>
      </>}
      {tab === 'maintenance' && <>
        <div className="mhead">
          <div className="stats3 compact">
            <div><span>Total spent</span><b>{fmtSAR(total)}</b></div>
            <div><span>Last 12 months</span><b>{fmtSAR(spend)}</b></div>
            <div><span>Records</span><b>{v.maintenance.length}</b></div>
          </div>
          <Btn icon={Plus} onClick={() => open('maint', { vehicleId: id })}>Add maintenance</Btn>
        </div>
        {v.maintenance.length === 0 ? <Empty icon={Wrench} title="No maintenance yet" text="Each time this vehicle goes to the workshop, add it here with the quotation and the bill." /> : (
          <div className="tablewrap"><table className="tbl">
            <thead><tr><th>Date</th><th>Work done</th><th>Quotation</th><th>Bill</th><th className="r">Amount</th><th /></tr></thead>
            <tbody>{[...v.maintenance].sort((a, b) => (a.date < b.date ? 1 : -1)).map((m) => (
              <tr key={m.id}>
                <td className="num nowrap">{fmtDate(m.date)}</td><td>{m.detail}</td>
                <td><MiniDoc fileRef={m.quotation} title="Quotation" /></td><td><MiniDoc fileRef={m.bill} title="Bill" /></td>
                <td className="r num"><b>{fmtSAR(m.amount)}</b></td>
                <td className="nowrap">
                  <button className="iconbtn sm" aria-label="Edit" title="Edit" onClick={() => open('maint', { vehicleId: id, maintId: m.id })}><Pencil size={15} /></button>
                  <button className="iconbtn sm" aria-label="Delete" title="Delete" onClick={() => { update((d) => { const x = d.vehicles.find((y) => y.id === id); x.maintenance = x.maintenance.filter((y) => y.id !== m.id) }, `Maintenance removed from ${v.plate}`); toast('Removed') }}><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}</tbody>
            <tfoot><tr><td colSpan={4}><b>Total</b></td><td className="r num"><b>{fmtSAR(total)}</b></td><td /></tr></tfoot>
          </table></div>
        )}
      </>}
      {tab === 'indemnity' && <IndemnityDocs v={v} />}
    </Drawer>
  )
}

/** Indemnity PDFs for one vehicle: real PDFs only, at most MAX_INDEMNITY_DOCS, each up to MAX_INDEMNITY_MB. */
const MAX_INDEMNITY_DOCS = 5
const MAX_INDEMNITY_MB = 10
const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
/** Checks the file's first bytes ("%PDF-"), so a renamed image or Word file is rejected. */
const isRealPdf = async (f) => {
  if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') return false
  try { return new TextDecoder().decode(await f.slice(0, 5).arrayBuffer()) === '%PDF-' } catch { return false }
}
/** Keep letters, digits, spaces and . _ - ( ); anything else becomes "_". */
const cleanName = (n) => {
  const s = n.replace(/[^\p{L}\p{N} ._()-]/gu, '_').replace(/\s+/g, ' ').trim()
  return /\.pdf$/i.test(s) ? s : (s || 'document') + '.pdf'
}

function IndemnityDocs({ v }) {
  const { open, update, toast, saveFile, dropFile } = useApp()
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [msg, setMsg] = useState(null) // { tone, text } shown inside the section
  const [confirmId, setConfirmId] = useState(null)
  const list = v.indemnityDocs || []
  const left = MAX_INDEMNITY_DOCS - list.length
  const full = left <= 0

  const add = async (files) => {
    if (!files.length || busy) return
    setMsg(null)
    if (full) return setMsg({ tone: 'warn', text: `Maximum of ${MAX_INDEMNITY_DOCS} PDFs reached. Delete one to add another.` })
    if (files.length > left) return setMsg({ tone: 'warn', text: `You picked ${files.length} files but only ${left} more can be added. Nothing was added.` })
    const tooBig = files.filter((f) => f.size > MAX_INDEMNITY_MB * 1048576)
    if (tooBig.length) return setMsg({ tone: 'bad', text: `${tooBig.map((f) => f.name).join(', ')} ${tooBig.length > 1 ? 'are' : 'is'} over ${MAX_INDEMNITY_MB} MB. Each PDF can be at most ${MAX_INDEMNITY_MB} MB. Nothing was added.` })
    setBusy(true)
    const refs = []
    try {
      const checks = await Promise.all(files.map(isRealPdf))
      const bad = files.filter((_, i) => !checks[i])
      if (bad.length) return setMsg({ tone: 'bad', text: `${bad.map((f) => f.name).join(', ')} ${bad.length > 1 ? 'are not PDF files' : 'is not a PDF file'}. Only PDFs can be added here. Nothing was added.` })
      const dupes = files.filter((f) => list.some((r) => r.name === cleanName(f.name)))
      for (const f of files) refs.push({ ...(await saveFile(f)), name: cleanName(f.name), type: 'application/pdf', by: 'Manager' })
      update((d) => { const x = d.vehicles.find((y) => y.id === v.id); x.indemnityDocs = [...(x.indemnityDocs || []), ...refs] },
        `Indemnity PDF${refs.length > 1 ? 's' : ''} added for ${v.plate} by Manager: ${refs.map((r) => r.name).join(', ')}`, 'upload')
      toast(refs.length > 1 ? `${refs.length} PDFs added` : 'PDF added')
      if (dupes.length) setMsg({ tone: 'warn', text: `A file named ${dupes.map((f) => cleanName(f.name)).join(', ')} was already here. Both copies are kept.` })
    } catch {
      refs.forEach(dropFile) // nothing half-saved
      setMsg({ tone: 'bad', text: 'The upload failed and nothing was saved. Check your connection and try again.' })
    } finally { setBusy(false) }
  }

  const remove = (ref) => {
    update((d) => { const x = d.vehicles.find((y) => y.id === v.id); x.indemnityDocs = (x.indemnityDocs || []).filter((r) => r.id !== ref.id) },
      `Indemnity PDF deleted from ${v.plate} by Manager: ${ref.name}`)
    dropFile(ref); setConfirmId(null); setMsg(null); toast('PDF deleted')
  }

  const dropProps = {
    onDragOver: (e) => { e.preventDefault(); if (!busy) setDrag(true) },
    onDragLeave: () => setDrag(false),
    onDrop: (e) => { e.preventDefault(); setDrag(false); add([...e.dataTransfer.files]) },
  }

  return <div className={cx('indem', drag && 'drag')} {...dropProps}>
    <div className="mhead">
      <p className="muted small grow">Keep the insurer letters, claim forms and other indemnity papers for this vehicle here. PDF only, up to {MAX_INDEMNITY_MB} MB each. You can also drag files onto this area.</p>
      <span className="muted small num" aria-live="polite">{list.length} of {MAX_INDEMNITY_DOCS} PDFs</span>
      <Btn icon={Upload} disabled={busy || full} onClick={() => input.current?.click()}>{busy ? 'Uploading…' : 'Add PDF'}</Btn>
      <input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => { const f = [...e.target.files]; e.target.value = ''; add(f) }} />
    </div>
    {busy && <div className="indem-prog" role="progressbar" aria-label="Uploading"><span /></div>}
    {full && !msg && <p className="indem-msg warn">Maximum of {MAX_INDEMNITY_DOCS} PDFs reached. Delete one to add another.</p>}
    {msg && <p className={cx('indem-msg', msg.tone)} role="alert">{msg.text}</p>}
    {list.length === 0 ? <Empty icon={ShieldCheck} title="No indemnity PDFs yet" text={`You can add up to ${MAX_INDEMNITY_DOCS}.`} /> : (
      <div className="slots">{list.map((r) => (
        <div key={r.id} className="slot has">
          <span className="slot-ic"><FileText size={20} /></span>
          <div className="grow slot-t">
            <b className="ellipsis" title={r.name}>{r.name}</b>
            <span className="muted">{r.at ? `Added ${new Date(r.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Added'}{` by ${r.by || 'Manager'}`}{r.size ? ' · ' + fmtSize(r.size) : ''}</span>
          </div>
          <div className="slot-a">
            {confirmId === r.id ? <>
              <span className="muted small">Delete this PDF?</span>
              <Btn kind="ghost" size="sm" onClick={() => setConfirmId(null)}>Cancel</Btn>
              <Btn size="sm" icon={Trash2} onClick={() => remove(r)}>Delete</Btn>
            </> : <>
              <button className="iconbtn sm" title="View" aria-label={`View ${r.name}`} onClick={() => open('doc', { fileRef: r, title: r.name })}><Eye size={17} /></button>
              <button className="iconbtn sm" title="Download" aria-label={`Download ${r.name}`} onClick={() => { if (!downloadRef(r)) toast('This file is no longer available on this device.', 'warn') }}><Download size={17} /></button>
              <button className="iconbtn sm" title="Delete" aria-label={`Delete ${r.name}`} onClick={() => setConfirmId(r.id)}><Trash2 size={17} /></button>
            </>}
          </div>
        </div>
      ))}</div>
    )}
  </div>
}
function VehicleSlot({ v, d }) {
  const onUpload = useDocUpload({ entity: 'vehicle', id: v.id, docKey: d.key, reads: d.reads, label: d.label })
  return <FileSlot label={d.label} fileRef={v.docs[d.key]} reads={d.reads} onUpload={onUpload} />
}
function MiniDoc({ fileRef, title }) {
  const { open } = useApp()
  if (!fileRef) return <span className="muted small">—</span>
  return <button className="linkish" onClick={() => open('doc', { fileRef, title })}><FileText size={14} /> View</button>
}
function DepreciationChart({ v, rate }) {
  const years = Math.max(1, Math.ceil(daysUntil(TODAY, v.purchaseDate) / 365.25) + 2)
  const pts = Array.from({ length: years + 1 }, (_, i) => v.purchaseValue * Math.pow(1 - rate / 100, i))
  const nowX = daysUntil(TODAY, v.purchaseDate) / 365.25
  const W = 100, H = 36
  const x = (i) => (i / years) * W, y = (val) => H - (val / v.purchaseValue) * (H - 4) - 2
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p)}`).join(' ')
  const nowVal = v.purchaseValue * Math.pow(1 - rate / 100, nowX)
  return (
    <div className="depchart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"><path d={path + ` L${W},${H} L0,${H} Z`} className="dep-area" /><path d={path} className="dep-line" /><line x1={x(nowX)} x2={x(nowX)} y1="0" y2={H} className="dep-now" /></svg>
      <div className="dep-labels"><span>Bought {fmtSAR(v.purchaseValue)}<small>{fmtDate(v.purchaseDate)}</small></span><span className="now">Today {fmtSAR(nowVal)}</span><span>In 2 yrs {fmtSAR(pts[years])}</span></div>
    </div>
  )
}

function MaintForm({ vehicleId, maintId, onClose }) {
  const { db, update, toast, saveFile } = useApp()
  const v = db.vehicles.find((x) => x.id === vehicleId)
  const ex = maintId ? v?.maintenance.find((m) => m.id === maintId) : null
  const [f, setF] = useState(() => ex ? { ...ex, amount: String(ex.amount ?? '') } : { date: TODAY, detail: '', amount: '', quotation: null, bill: null })
  const [err, setErr] = useState('')
  if (!v) return null
  const save = () => {
    if (!f.detail.trim()) return setErr('What work was done?')
    // Indemnity is no longer entered here (it is PDFs in its own tab). Any old amount on a record is kept untouched so no data is lost.
    const rec = { ...f, amount: Number(f.amount) || 0 }
    if (ex) update((d) => { const list = d.vehicles.find((x) => x.id === vehicleId).maintenance; const i = list.findIndex((m) => m.id === maintId); list[i] = { ...list[i], ...rec } }, `Maintenance updated for ${v.plate}: ${f.detail}`, 'wrench')
    else update((d) => { d.vehicles.find((x) => x.id === vehicleId).maintenance.push({ id: uid('mt'), ...rec }) }, `Maintenance added for ${v.plate}: ${f.detail} (${fmtSAR(rec.amount)})`, 'wrench')
    toast(ex ? 'Maintenance updated' : 'Maintenance saved'); onClose()
  }
  const up = (k) => async (e) => { const x = e.target.files[0]; e.target.value = ''; if (x) { const r = await saveFile(x); setF((p) => ({ ...p, [k]: r })) } }
  return (
    <Modal title={ex ? 'Edit maintenance' : 'Add maintenance'} sub={`${v.plate} · ${v.brand} ${v.model} · used by ${v.user}`} icon={Wrench} onClose={onClose} width={600}
      footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save}>{ex ? 'Save changes' : 'Save'}</Btn></>}>
      <div className="fgrid">
        <Field label="Date"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Amount (SAR)"><input type="number" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0" /></Field>
        <Field label="Work done" span={2}><input value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} placeholder="e.g. Oil change and brake pads" autoFocus /></Field>
      </div>
      <div className="two">
        {[['quotation', 'Quotation'], ['bill', 'Bill']].map(([k, l]) => (
          <label key={k} className="dropzone">
            <input type="file" accept="image/*,application/pdf" hidden onChange={up(k)} />
            {f[k] ? <><CheckCircle2 size={18} className="okc" /> {f[k].name}</> : <><FileText size={18} /> Upload {l.toLowerCase()}</>}
          </label>
        ))}
      </div>
      {err && <div className="formerr"><AlertTriangle size={16} />{err}</div>}
    </Modal>
  )
}

function VehicleForm({ id, type = 'car', from, onClose }) {
  const { db, update, toast } = useApp()
  const { cancel, done } = useFromAssets(from, onClose)
  const ex = id ? db.vehicles.find((x) => x.id === id) : null
  const [f, setF] = useState(() => ex ? { ...ex } : {
    type, plate: '', ownership: 'Company owned', user: '', condition: 'good', brand: '', model: '', year: new Date().getFullYear(), purchaseValue: '', purchaseDate: TODAY, location: '',
    fahas: addMonths(TODAY, 12), registration: addMonths(TODAY, 36), opCard: type === 'heavy' ? addMonths(TODAY, 24) : '',
  })
  const [err, setErr] = useState('')
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const save = () => {
    if (!f.plate.trim()) return setErr('Enter the plate number.')
    if (!f.brand.trim()) return setErr('Enter the brand, e.g. Toyota.')
    const clean = { ...f, plate: f.plate.trim().toUpperCase(), year: Number(f.year) || '', purchaseValue: Number(f.purchaseValue) || 0 }
    if (ex) update((d) => { const i = d.vehicles.findIndex((x) => x.id === id); d.vehicles[i] = { ...d.vehicles[i], ...clean } }, `Vehicle ${clean.plate} updated`)
    else update((d) => { d.vehicles.push({ ...clean, id: uid('v'), docs: {}, maintenance: [], indemnityDocs: [] }) }, `New vehicle added: ${clean.plate}`, 'add')
    toast(ex ? 'Vehicle updated' : 'Vehicle added. Upload its documents next.')
    if (ex) onClose(); else done(`${clean.plate} added`)
  }
  const users = [...db.drivers.map((d) => d.name), ...db.engineers.map((e) => e + ' (Site Eng.)')]
  return (
    <Modal title={ex ? `Edit ${ex.plate}` : `Add a ${f.type === 'heavy' ? 'heavy vehicle' : 'car'}`} sub="Fill what you know. You can add the rest later." icon={Truck} onClose={ex ? onClose : cancel} width={760}
      footer={<><Btn kind="ghost" onClick={ex ? onClose : cancel}>Cancel</Btn><Btn onClick={save}>{ex ? 'Save changes' : 'Add vehicle'}</Btn></>}>
      <div className="fgrid three">
        <Field label="Type"><select value={f.type} onChange={(e) => set('type', e.target.value)}><option value="car">Car</option><option value="heavy">Heavy vehicle</option></select></Field>
        <Field label="Plate no."><input value={f.plate} onChange={(e) => set('plate', e.target.value)} placeholder="e.g. RJA 4821" autoFocus /></Field>
        <Field label="Ownership"><select value={f.ownership} onChange={(e) => set('ownership', e.target.value)}>{OWNERSHIP.map((o) => <option key={o}>{o}</option>)}</select></Field>
        <Field label="Brand"><input value={f.brand} onChange={(e) => set('brand', e.target.value)} placeholder="e.g. Toyota" /></Field>
        <Field label="Model"><input value={f.model} onChange={(e) => set('model', e.target.value)} placeholder="e.g. Hilux" /></Field>
        <Field label="Year"><input type="number" value={f.year} onChange={(e) => set('year', e.target.value)} /></Field>
        <Field label="User of vehicle"><input list="dl-users" value={f.user} onChange={(e) => set('user', e.target.value)} placeholder="Driver or engineer" /></Field>
        <Field label="Location"><input value={f.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Dammam HQ" /></Field>
        <Field label="Condition"><select value={f.condition} onChange={(e) => set('condition', e.target.value)}>{Object.entries(CONDITIONS).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}</select></Field>
        <Field label="Purchase value (SAR)"><input type="number" value={f.purchaseValue} onChange={(e) => set('purchaseValue', e.target.value)} placeholder="0" /></Field>
        <Field label="Purchase date"><input type="date" value={f.purchaseDate} onChange={(e) => set('purchaseDate', e.target.value)} /></Field>
        <div />
        <Field label="FAHAS expiry"><input type="date" value={f.fahas} onChange={(e) => set('fahas', e.target.value)} /></Field>
        <Field label="Registration expiry"><input type="date" value={f.registration} onChange={(e) => set('registration', e.target.value)} /></Field>
        {f.type === 'heavy' && <Field label="Operation card expiry"><input type="date" value={f.opCard || ''} onChange={(e) => set('opCard', e.target.value)} /></Field>}
      </div>
      <datalist id="dl-users">{users.map((u) => <option key={u} value={u} />)}</datalist>
      {err && <div className="formerr"><AlertTriangle size={16} />{err}</div>}
    </Modal>
  )
}

// ======================= driver =======================
function DriverDrawer({ id, onClose }) {
  const { db, open } = useApp()
  const d = db.drivers.find((x) => x.id === id)
  if (!d) return null
  const s = db.settings
  const cars = db.vehicles.filter((v) => v.user === d.name)
  return (
    <Drawer title={d.name} sub={d.profession} onClose={onClose} actions={<Btn kind="ghost" size="sm" icon={Pencil} onClick={() => open('driverForm', { id })}>Edit</Btn>}>
      <div className="facts">
        <div><FileText size={16} /><span>License no.</span><b className="mono">{d.licenseNo}</b></div>
        <div><Phone size={16} /><span>Phone</span><b>{d.phone || '—'}</b></div>
        <div><Truck size={16} /><span>Drives</span><b>{cars.length ? cars.map((c) => c.plate).join(', ') : 'No vehicle assigned'}</b></div>
      </div>
      <h4 className="sec">Expiry dates</h4>
      <div className="exps">
        {DRIVER_EXPIRY_KEYS.map((k) => (
          <div key={k} className="exp">
            <div className="grow"><b>{EXPIRY[k].label}</b><span className="ar small">{EXPIRY[k].ar}</span><span className="num">{fmtDate(d[k])}</span></div>
            <ExpiryPill date={d[k]} remindDays={s.remindDays} />
            <Btn kind={daysUntil(d[k]) <= s.remindDays ? 'primary' : 'ghost'} size="sm" icon={CalendarCheck} onClick={() => open('renew', { entity: 'driver', id, expKey: k })}>Renew</Btn>
          </div>
        ))}
      </div>
      <h4 className="sec">Documents</h4>
      <div className="slots">{DRIVER_DOCS.map((x) => <DriverSlot key={x.key} d={d} x={x} />)}</div>
      {cars.length > 0 && <><h4 className="sec">Vehicle</h4>{cars.map((c) => <button key={c.id} className="linkcard" onClick={() => open('vehicle', { id: c.id })}><Truck size={18} /><span className="grow"><b>{c.plate}</b><small>{c.brand} {c.model} · {c.location}</small></span><Pill tone={CONDITIONS[c.condition].tone}>{CONDITIONS[c.condition].label}</Pill></button>)}</>}
    </Drawer>
  )
}
function DriverSlot({ d, x }) {
  const onUpload = useDocUpload({ entity: 'driver', id: d.id, docKey: x.key, reads: x.reads, label: x.label })
  return <FileSlot label={x.label} fileRef={d.docs[x.key]} reads={x.reads} onUpload={onUpload} />
}
function DriverForm({ id, onClose }) {
  const { db, update, toast } = useApp()
  const ex = id ? db.drivers.find((x) => x.id === id) : null
  const [f, setF] = useState(() => ex ? { ...ex } : { name: '', licenseNo: '', license: addMonths(TODAY, 60), driverCard: addMonths(TODAY, 12), profession: 'Light Driver', phone: '' })
  const [err, setErr] = useState('')
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const save = () => {
    if (!f.name.trim()) return setErr('Enter the driver name.')
    if (ex) update((d) => { const i = d.drivers.findIndex((x) => x.id === id); d.drivers[i] = { ...d.drivers[i], ...f } }, `Driver ${f.name} updated`)
    else update((d) => { d.drivers.push({ ...f, id: uid('d'), docs: {} }) }, `New driver added: ${f.name}`, 'add')
    toast(ex ? 'Driver updated' : 'Driver added'); onClose()
  }
  return (
    <Modal title={ex ? `Edit ${ex.name}` : 'Add a driver'} icon={Users} onClose={onClose} width={620} footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save}>{ex ? 'Save changes' : 'Add driver'}</Btn></>}>
      <div className="fgrid">
        <Field label="Full name" span={2}><input value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
        <Field label="License no."><input value={f.licenseNo} onChange={(e) => set('licenseNo', e.target.value)} /></Field>
        <Field label="Profession"><input list="dl-prof" value={f.profession} onChange={(e) => set('profession', e.target.value)} /></Field>
        <Field label="License expiry"><input type="date" value={f.license} onChange={(e) => set('license', e.target.value)} /></Field>
        <Field label="Driver card expiry"><input type="date" value={f.driverCard} onChange={(e) => set('driverCard', e.target.value)} /></Field>
        <Field label="Phone" span={2}><input value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+966 …" /></Field>
      </div>
      <datalist id="dl-prof">{['Light Driver', 'Heavy Driver', 'Bus Driver', 'Equipment Operator'].map((p) => <option key={p} value={p} />)}</datalist>
      {err && <div className="formerr"><AlertTriangle size={16} />{err}</div>}
    </Modal>
  )
}

const MAP = {
  entry: EntryForm, movement: MovementDrawer, material: MaterialDrawer, materialForm: MaterialForm,
  vehicle: VehicleDrawer, vehicleForm: VehicleForm, maint: MaintForm, renew: RenewModal, readDoc: ReadDocModal,
  ...ASSET_OVERLAYS,
  driver: DriverDrawer, driverForm: DriverForm, doc: (p) => <DocViewer fileRef={p.fileRef} title={p.title} onClose={p.onClose} />,
}
