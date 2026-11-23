import { useMemo, useRef, useState } from 'react'
import { Wrench, Hand, Pencil, Ban, RotateCcw, Building2, BarChart3, FileSpreadsheet, FileDown, Printer, CheckCircle2, Landmark, AlertTriangle, Users } from 'lucide-react'
import { useApp } from './store'
import {
  TODAY, fmtDate, fmtSAR, uid, TOOL_CONDITIONS, ALLOC_STATUS, allocStatus, qtyAvailable, qtyWithStaff, nextCode, knownEmployees,
  HAND_TOOL_CATEGORIES, OFFICE_CATEGORIES, rateOf, fmtPct, assetRows, assetTotals, ASSET_TYPES,
} from './data'
import { Modal, Drawer, Btn, Pill, Field, Empty, cx } from './ui'
import { allocValue, toolValue, allocDetail } from './pages/HandTools'
import { exportExcel, exportPdf } from './exporter'

const BY = 'Manager' // the demo has a single signed-in user
const now = () => new Date().toISOString()
const isBlank = (v) => v === undefined || v === null || String(v).trim() === ''
const CondSelect = ({ value, onChange }) => <select value={value} onChange={(e) => onChange(e.target.value)}><option value="">Choose…</option>{Object.entries(TOOL_CONDITIONS).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}</select>

/**
 * Forms opened from Total assets: cancelling goes back to Total assets, and saving offers a way back (FR-AB6, FR-AB7).
 * Used by the hand tool, warehouse tool and vehicle forms.
 */
export function useFromAssets(from, onClose) {
  const { go, open } = useApp()
  return {
    cancel: () => { onClose(); if (from === 'assets') go('assets') },
    done: (text) => { onClose(); if (from === 'assets') open('backToAssets', { text }) },
  }
}
function BackToAssets({ text, onClose }) {
  const { go } = useApp()
  return (
    <Modal title={text} sub="It is already in the Total assets list." icon={CheckCircle2} tone="ok" onClose={onClose} width={460}
      footer={<><Btn kind="ghost" onClick={onClose}>Stay here</Btn><Btn icon={Landmark} onClick={() => { onClose(); go('assets') }} autoFocus>Back to Total assets</Btn></>}>
      <p className="muted">You can go back to Total assets now, or stay on this page.</p>
    </Modal>
  )
}

// ======================= hand tool catalog =======================
function HandToolForm({ id, from, onClose }) {
  const { db, update, toast } = useApp()
  const { cancel, done } = useFromAssets(from, onClose)
  const tools = db.handTools || []
  const ex = id ? tools.find((t) => t.id === id) : null
  const [f, setF] = useState(() => ex ? { ...ex, qty: String(ex.qty), unitValue: ex.unitValue == null ? '' : String(ex.unitValue) }
    : { toolId: nextCode(tools, 'toolId', 'HT'), category: '', name: '', qty: '1', purchaseDate: TODAY, unitValue: '', condition: 'new', remarks: '' })
  const [errs, setErrs] = useState({})
  const [fail, setFail] = useState('')
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: '' })) }
  const cats = [...new Set([...HAND_TOOL_CATEGORIES, ...tools.map((t) => t.category)])].filter(Boolean).sort()
  const held = ex ? qtyWithStaff(db, ex.id) : 0

  const save = () => {
    const e = {}
    const tid = f.toolId.trim().toUpperCase()
    if (!tid) e.toolId = 'Enter a tool ID.'
    else if (tools.some((t) => t.id !== ex?.id && String(t.toolId).toUpperCase() === tid)) e.toolId = `${tid} is already used by another tool. Use a different ID.`
    if (isBlank(f.category)) e.category = 'Choose or type a category.'
    if (isBlank(f.name)) e.name = 'Enter the tool name.'
    const q = Number(f.qty)
    if (isBlank(f.qty) || !Number.isInteger(q) || q < 1) e.qty = 'Enter a whole number, 1 or more.'
    else if (q < held) e.qty = `${held} are with employees now, so the quantity cannot be less than ${held}.`
    if (!f.purchaseDate) e.purchaseDate = 'Enter the date of purchase.'
    else if (f.purchaseDate > TODAY) e.purchaseDate = 'The date of purchase cannot be in the future.'
    if (isBlank(f.unitValue) || isNaN(Number(f.unitValue)) || Number(f.unitValue) < 0) e.unitValue = 'Enter the value per unit, 0 or more.'
    if (!f.condition) e.condition = 'Choose the condition.'
    setErrs(e)
    if (Object.values(e).some(Boolean)) return
    const rec = { toolId: tid, category: f.category.trim(), name: f.name.trim().replace(/\s+/g, ' '), qty: q, purchaseDate: f.purchaseDate, unitValue: Math.round(Number(f.unitValue) * 100) / 100, condition: f.condition, remarks: f.remarks.trim() }
    try {
      if (ex) {
        const changed = Object.keys(rec).filter((k) => String(rec[k]) !== String(ex[k] ?? '')).map((k) => `${k === 'unitValue' ? 'value per unit' : k === 'qty' ? 'quantity' : k === 'purchaseDate' ? 'date of purchase' : k === 'toolId' ? 'tool ID' : k}: ${ex[k] ?? '—'} → ${rec[k]}`)
        update((d) => { const i = d.handTools.findIndex((t) => t.id === id); d.handTools[i] = { ...d.handTools[i], ...rec, log: [...(d.handTools[i].log || []), { at: now(), by: BY, text: changed.length ? 'Edited: ' + changed.join('; ') : 'Saved with no changes' }] } }, `Hand tool ${rec.toolId} updated by ${BY}`)
        toast('Tool updated'); onClose()
      } else {
        update((d) => { (d.handTools ||= []).push({ id: uid('ht'), ...rec, active: true, log: [{ at: now(), by: BY, text: 'Added to the catalog' }] }) }, `Hand tool added: ${rec.toolId} ${rec.name}`, 'add')
        toast('Tool added'); done(`${rec.name} added`)
      }
    } catch { setFail('The tool could not be saved. Please try again.') }
  }
  const toggleActive = () => {
    const on = ex.active === false
    if (!on && held > 0) return setFail(`${held} of this tool are still with employees. Get them back before deactivating it.`)
    update((d) => { const t = d.handTools.find((x) => x.id === id); t.active = on; t.log = [...(t.log || []), { at: now(), by: BY, text: on ? 'Reactivated' : 'Deactivated' }] }, `Hand tool ${ex.toolId} ${on ? 'reactivated' : 'deactivated'} by ${BY}`)
    toast(on ? 'Tool reactivated' : 'Tool deactivated. Its history is kept.'); onClose()
  }
  return (
    <Modal title={ex ? `Edit ${ex.toolId}` : 'Add a hand tool'} sub="Add a tool once. After that, pick it from the list when you give it out." icon={Wrench} onClose={ex ? onClose : cancel} width={680}
      footer={<>
        {ex && <Btn kind="ghost" icon={ex.active === false ? RotateCcw : Ban} onClick={toggleActive}>{ex.active === false ? 'Reactivate' : 'Deactivate'}</Btn>}
        <span className="grow" />
        <Btn kind="ghost" onClick={ex ? onClose : cancel}>Cancel</Btn><Btn onClick={save}>{ex ? 'Save changes' : 'Add tool'}</Btn>
      </>}>
      <form className="fgrid" onSubmit={(e) => { e.preventDefault(); save() }} noValidate>
        <Field label="Tool ID" hint="Filled in for you. You can change it." error={errs.toolId}><input value={f.toolId} onChange={(e) => set('toolId', e.target.value)} aria-invalid={!!errs.toolId} /></Field>
        <Field label="Tool category" hint="Pick one, or type a new category." error={errs.category}><input list="dl-ht-cats" value={f.category} onChange={(e) => set('category', e.target.value)} placeholder="e.g. Power tools" aria-invalid={!!errs.category} /></Field>
        <Field label="Tool name" span={2} error={errs.name}><input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Bosch cordless drill" autoFocus={!ex} aria-invalid={!!errs.name} /></Field>
        <Field label="Quantity owned" error={errs.qty} hint={held ? `${held} with employees now` : undefined}><input type="number" min="1" step="1" value={f.qty} onChange={(e) => set('qty', e.target.value)} aria-invalid={!!errs.qty} /></Field>
        <Field label="Date of purchase" hint="Bought on another date? Add it as a separate tool." error={errs.purchaseDate}><input type="date" max={TODAY} value={f.purchaseDate} onChange={(e) => set('purchaseDate', e.target.value)} aria-invalid={!!errs.purchaseDate} /></Field>
        <Field label="Purchase value per unit (SAR)" error={errs.unitValue}><input type="number" min="0" step="0.01" value={f.unitValue} onChange={(e) => set('unitValue', e.target.value)} placeholder="0" aria-invalid={!!errs.unitValue} /></Field>
        <Field label="Condition" error={errs.condition}><CondSelect value={f.condition} onChange={(v) => set('condition', v)} /></Field>
        <Field label="Remarks" span={2}><textarea rows={2} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} placeholder="Optional" /></Field>
      </form>
      <datalist id="dl-ht-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
      {fail && <div className="formerr"><AlertTriangle size={16} />{fail}</div>}
    </Modal>
  )
}

function HandToolDrawer({ id, onClose }) {
  const { db, open } = useApp()
  const t = (db.handTools || []).find((x) => x.id === id)
  if (!t) return null
  const allocs = (db.allocations || []).filter((a) => a.toolRef === id).sort((a, b) => (a.handoverDate < b.handoverDate ? 1 : -1))
  const ws = qtyWithStaff(db, id)
  const v = toolValue(db, t)
  const c = TOOL_CONDITIONS[t.condition]
  return (
    <Drawer wide title={`${t.toolId} · ${t.name}`} sub={`${t.category} · Hand tool`} badge={t.active === false ? <Pill>Deactivated</Pill> : c && <Pill tone={c.tone} dot>{c.label}</Pill>} onClose={onClose}
      actions={<>
        <Btn kind="ghost" size="sm" icon={Pencil} onClick={() => open('handToolForm', { id })}>Edit</Btn>
        {t.active !== false && <Btn size="sm" icon={Hand} disabled={Number(t.qty) - ws <= 0} onClick={() => open('allocate', { toolRef: id })}>Allocate</Btn>}
      </>}>
      <div className="facts">
        <div><span>Owned</span><b>{t.qty}</b></div>
        <div><span>With employees</span><b>{ws}</b></div>
        <div><span>Available</span><b>{Number(t.qty) - ws}</b></div>
        <div><span>Date of purchase</span><b>{fmtDate(t.purchaseDate)}</b></div>
        <div><span>Purchase value</span><b>{fmtSAR(Number(t.unitValue) * Number(t.qty))}</b></div>
        <div><span>Current value</span><b>{v ? fmtSAR(v.current) : 'Value missing'}</b></div>
        <div><span>Depreciation</span><b>{v ? `${fmtSAR(v.dep)} · ${fmtPct(v.pct)}` : '—'}</b></div>
        <div><span>Value per unit</span><b>{fmtSAR(t.unitValue || 0)}</b></div>
      </div>
      {t.remarks && <p className="muted small">{t.remarks}</p>}
      <h4 className="sec">Everyone who has held it</h4>
      {allocs.length === 0 ? <Empty icon={Users} title="Not given out yet" /> : (
        <div className="tablewrap"><table className="tbl">
          <thead><tr><th>Employee</th><th className="r">Qty</th><th>Handover</th><th>Return / handover</th><th>Status</th></tr></thead>
          <tbody>{allocs.map((a) => { const s = allocStatus(a); return (
            <tr key={a.id}><td><button className="linkish" onClick={() => open('employee', { empId: a.empId })}><b>{a.empName}</b></button> <span className="muted small">{a.empId} · {a.designation}</span></td><td className="r num">{a.qty}</td><td className="num nowrap">{fmtDate(a.handoverDate)}</td><td className="small">{allocDetail(a)}</td><td><Pill tone={ALLOC_STATUS[s].tone}>{ALLOC_STATUS[s].label}</Pill></td></tr>
          ) })}</tbody>
        </table></div>
      )}
      <h4 className="sec">History</h4>
      <ul className="loglist">{[...(t.log || [])].reverse().map((l, i) => <li key={i}><span className="num muted small">{new Date(l.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span><span>{l.text} <span className="muted">· {l.by}</span></span></li>)}</ul>
    </Drawer>
  )
}

function EmployeeDrawer({ empId, onClose }) {
  const { db, open } = useApp()
  const key = String(empId).trim().toUpperCase()
  const allocs = (db.allocations || []).filter((a) => String(a.empId).trim().toUpperCase() === key).sort((a, b) => (a.handoverDate < b.handoverDate ? 1 : -1))
  const emp = knownEmployees(db)[key] || { empId, empName: empId, designation: '' }
  const now_ = allocs.filter((a) => allocStatus(a) === 'with')
  const before = allocs.filter((a) => allocStatus(a) !== 'with')
  const tool = (id) => (db.handTools || []).find((t) => t.id === id) || {}
  const Table = ({ list }) => (
    <div className="tablewrap"><table className="tbl">
      <thead><tr><th>Tool</th><th className="r">Qty</th><th>Handover</th><th>Return / handover</th><th className="r">Current value</th></tr></thead>
      <tbody>{list.map((a) => { const t = tool(a.toolRef); const v = allocValue(db, a, t); return (
        <tr key={a.id}><td><button className="linkish" onClick={() => open('handTool', { id: t.id })}><b>{t.name}</b></button> <span className="muted small mono">{t.toolId}</span></td><td className="r num">{a.qty}</td><td className="num nowrap">{fmtDate(a.handoverDate)}</td><td className="small">{allocDetail(a)}</td><td className="r num">{v ? fmtSAR(v.current) : '—'}</td></tr>
      ) })}</tbody>
    </table></div>
  )
  return (
    <Drawer wide title={emp.empName} sub={`${emp.empId}${emp.designation ? ' · ' + emp.designation : ''}`} onClose={onClose}
      actions={<Btn size="sm" icon={Hand} onClick={() => open('allocate', { empId: emp.empId })}>Give a tool</Btn>}>
      <h4 className="sec">Holding now <span className="muted small">{now_.reduce((s, a) => s + Number(a.qty), 0)} tools</span></h4>
      {now_.length ? <Table list={now_} /> : <Empty icon={Wrench} title="No tools with this employee now" />}
      <h4 className="sec">Held before</h4>
      {before.length ? <Table list={before} /> : <p className="muted small">Nothing returned or handed over yet.</p>}
    </Drawer>
  )
}

// ======================= allocation (give out / return / hand over) =======================
/** Searchable list of catalog tools. Each option shows tool ID, name, category and how many are available. */
function ToolPicker({ tools, value, onChange, exceptId, invalid }) {
  const { db } = useApp()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const sel = tools.find((t) => t.id === value)
  const s = q.trim().toLowerCase()
  const list = tools.filter((t) => !s || [t.toolId, t.name, t.category].join(' ').toLowerCase().includes(s))
  return (
    <div className="picker" ref={box} onBlur={(e) => { if (!box.current.contains(e.relatedTarget)) setOpen(false) }}>
      <input role="combobox" aria-expanded={open} aria-invalid={invalid} value={open ? q : sel ? `${sel.toolId} · ${sel.name}` : ''} placeholder="Search tool ID, name or category…"
        onFocus={() => { setOpen(true); setQ('') }} onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } if (e.key === 'Enter') { e.preventDefault(); if (list[0]) { onChange(list[0].id); setOpen(false) } } }} />
      {open && (
        <div className="picker-pop" role="listbox">
          {list.map((t) => { const av = qtyAvailable(db, t, exceptId); return (
            <button type="button" key={t.id} role="option" aria-selected={t.id === value} className={cx('pop-row', t.id === value && 'on')} onClick={() => { onChange(t.id); setOpen(false) }}>
              <span className="grow"><b>{t.toolId} · {t.name}</b><small>{t.category}</small></span><Pill tone={av > 0 ? 'ok' : 'bad'}>{av} available</Pill>
            </button>
          ) })}
          {!list.length && <p className="muted small pad">No tool matches. Add it to the catalog first with Add tool.</p>}
        </div>
      )}
    </div>
  )
}

const ALLOC_LABELS = { empId: 'Employee ID', empName: 'Employee name', designation: 'Designation', toolRef: 'Tool', qty: 'Quantity', condition: 'Condition', handoverDate: 'Date of handover', returnDate: 'Return to office', handoverTo: 'Handover to', remarks: 'Remarks' }

function AllocationForm({ id, toolRef, empId, mode, onClose }) {
  const { db, update, toast } = useApp()
  const ex = id ? (db.allocations || []).find((a) => a.id === id) : null
  const known = useMemo(() => knownEmployees(db), [db])
  const wasHanded = !!ex?.handoverTo
  const tools = (db.handTools || []).filter((t) => t.active !== false || t.id === ex?.toolRef)
  const start = known[String(empId || '').toUpperCase()]
  const [f, setF] = useState(() => ex ? { ...ex, qty: String(ex.qty), returnDate: ex.returnDate || (mode === 'return' ? TODAY : ''), handoverTo: ex.handoverTo || '', nextEmpId: '', nextDesignation: '', passDate: ex.closedDate || TODAY }
    : { empId: start?.empId || empId || '', empName: start?.empName || '', designation: start?.designation || '', toolRef: toolRef || '', qty: '1', condition: '', handoverDate: TODAY, returnDate: '', handoverTo: '', nextEmpId: '', nextDesignation: '', passDate: TODAY, remarks: '' })
  const [errs, setErrs] = useState({})
  const [fail, setFail] = useState('')
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: '' })) }
  const t = tools.find((x) => x.id === f.toolRef)
  const avail = t ? qtyAvailable(db, t, ex?.id) : 0
  const v = t ? allocValue(db, { qty: Number(f.qty) || 0 }, t) : null
  const newHandover = !wasHanded && !isBlank(f.handoverTo)

  const onEmpId = (val) => {
    const k = known[val.trim().toUpperCase()]
    setF((x) => (k ? { ...x, empId: val, empName: k.empName, designation: k.designation } : { ...x, empId: val }))
    setErrs((e) => ({ ...e, empId: '', empName: '', designation: '' }))
  }
  const onNextId = (val) => {
    const k = known[val.trim().toUpperCase()]
    setF((x) => (k ? { ...x, nextEmpId: val, handoverTo: k.empName, nextDesignation: k.designation } : { ...x, nextEmpId: val }))
    setErrs((e) => ({ ...e, nextEmpId: '', handoverTo: '', nextDesignation: '' }))
  }

  const save = () => {
    const e = {}
    if (isBlank(f.empId)) e.empId = 'Enter the employee ID.'
    if (isBlank(f.empName)) e.empName = 'Enter the employee name.'
    if (isBlank(f.designation)) e.designation = 'Enter the designation, e.g. Site engineer.'
    if (!t) e.toolRef = 'Pick a tool from the list.'
    const q = Number(f.qty)
    if (isBlank(f.qty) || !Number.isInteger(q) || q < 1) e.qty = 'Enter a whole number, 1 or more.'
    else if (t && !f.returnDate && q > avail) e.qty = `Only ${avail} available. ${t.qty} owned, ${t.qty - avail} with employees.`
    if (!f.condition) e.condition = 'Choose the condition.'
    if (!f.handoverDate) e.handoverDate = 'Enter the date of handover.'
    else if (f.handoverDate > TODAY) e.handoverDate = 'The date of handover cannot be later than today.'
    else if (t?.purchaseDate && f.handoverDate < t.purchaseDate) e.handoverDate = `The tool was bought on ${fmtDate(t.purchaseDate)}. Handover cannot be earlier.`
    if (f.returnDate && !isBlank(f.handoverTo)) e.returnDate = e.handoverTo = 'Fill in only one: Return to office or Handover to employee.'
    if (f.returnDate && f.handoverDate && f.returnDate < f.handoverDate) e.returnDate = 'Return to office cannot be before the date of handover.'
    if (f.returnDate && f.returnDate > TODAY) e.returnDate = 'Return to office cannot be later than today.'
    if (newHandover) {
      if (isBlank(f.nextEmpId)) e.nextEmpId = "Enter the next employee's ID."
      if (isBlank(f.nextDesignation)) e.nextDesignation = "Enter the next employee's designation."
      if (!f.passDate) e.passDate = 'Enter the date it was passed on.'
      else if (f.passDate > TODAY) e.passDate = 'This date cannot be later than today.'
      else if (f.passDate < f.handoverDate) e.passDate = 'This date cannot be before the date of handover.'
      if (!isBlank(f.nextEmpId) && String(f.nextEmpId).trim().toUpperCase() === String(f.empId).trim().toUpperCase()) e.nextEmpId = 'The next employee must be someone else.'
    }
    setErrs(e)
    if (Object.values(e).some(Boolean)) return
    const rec = { empId: f.empId.trim(), empName: f.empName.trim(), designation: f.designation.trim(), toolRef: f.toolRef, qty: q, condition: f.condition, handoverDate: f.handoverDate, returnDate: f.returnDate || '', handoverTo: f.handoverTo.trim(), remarks: (f.remarks || '').trim() }
    if (newHandover) rec.closedDate = f.passDate
    const thisId = ex?.id || uid('al')
    const nextId = newHandover ? uid('al') : null
    let logText
    if (!ex) logText = `${t.name} (${q}) given to ${rec.empName} by ${BY}`
    else if (newHandover) logText = `${t.name} handed over from ${rec.empName} to ${rec.handoverTo} by ${BY}`
    else if (rec.returnDate && !ex.returnDate) logText = `${t.name} returned to office by ${rec.empName}`
    else logText = `Allocation of ${t.name} to ${rec.empName} updated by ${BY}`
    const changes = ex ? Object.keys(ALLOC_LABELS).filter((k) => String(rec[k] ?? '') !== String(ex[k] ?? '')).map((k) => `${ALLOC_LABELS[k]}: ${k === 'toolRef' ? (tools.find((x) => x.id === ex[k])?.toolId || '—') : ex[k] || '—'} → ${k === 'toolRef' ? t.toolId : rec[k] || '—'}`) : []
    try {
      update((d) => {
        d.allocations ||= []
        if (ex) { const i = d.allocations.findIndex((a) => a.id === id); d.allocations[i] = { ...d.allocations[i], ...rec, ...(nextId ? { nextAllocId: nextId } : {}), log: [...(d.allocations[i].log || []), { at: now(), by: BY, text: changes.length ? changes.join('; ') : 'Saved with no changes' }] } }
        else d.allocations.push({ id: thisId, ...rec, ...(nextId ? { nextAllocId: nextId } : {}), log: [{ at: now(), by: BY, text: 'Allocated' + (nextId ? ` and handed over to ${rec.handoverTo}` : '') }] })
        if (nextId) d.allocations.push({ id: nextId, prevAllocId: thisId, empId: f.nextEmpId.trim(), empName: rec.handoverTo, designation: f.nextDesignation.trim(), toolRef: rec.toolRef, qty: q, condition: rec.condition, handoverDate: f.passDate, returnDate: '', handoverTo: '', remarks: '', log: [{ at: now(), by: BY, text: `Handed over from ${rec.empName}` }] })
      }, logText, newHandover || !ex ? 'issue' : rec.returnDate && !ex.returnDate ? 'return' : 'edit')
      toast(!ex ? 'Tool allocated' : newHandover ? `Handed over to ${rec.handoverTo}` : rec.returnDate && !ex.returnDate ? 'Marked as returned' : 'Allocation updated')
      onClose()
    } catch { setFail('The allocation could not be saved. Please try again.') }
  }

  const ro = (val) => <input value={val} readOnly tabIndex={-1} className="ro" />
  const title = mode === 'return' ? 'Return to office' : mode === 'handover' ? 'Hand over to another employee' : ex ? 'Edit allocation' : 'Allocate a tool'
  return (
    <Modal title={title} sub={ex ? `${t?.name || ''} · ${ex.empName}` : 'Pick the tool from the list. Its details fill in for you.'} icon={Hand} onClose={onClose} width={820}
      footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save}>{!ex ? 'Allocate tool' : mode === 'return' ? 'Mark as returned' : mode === 'handover' ? 'Hand over' : 'Save changes'}</Btn></>}>
      <form onSubmit={(e) => { e.preventDefault(); save() }} noValidate>
        <h4 className="sec">Employee</h4>
        <div className="fgrid three">
          <Field label="Employee ID" hint="Known IDs fill in the name and designation." error={errs.empId}><input list="dl-emp" value={f.empId} onChange={(e) => onEmpId(e.target.value)} placeholder="e.g. E-1021" autoFocus={!ex} aria-invalid={!!errs.empId} /></Field>
          <Field label="Employee name" error={errs.empName}><input value={f.empName} onChange={(e) => set('empName', e.target.value)} aria-invalid={!!errs.empName} /></Field>
          <Field label="Designation" error={errs.designation}><input list="dl-desig" value={f.designation} onChange={(e) => set('designation', e.target.value)} placeholder="e.g. Site engineer" aria-invalid={!!errs.designation} /></Field>
        </div>
        <h4 className="sec">Tool</h4>
        <div className="fgrid three">
          <Field label="Tool" span={2} error={errs.toolRef} hint={t ? `${avail} available to give out` : undefined}><ToolPicker tools={tools} value={f.toolRef} onChange={(v_) => set('toolRef', v_)} exceptId={ex?.id} invalid={!!errs.toolRef} /></Field>
          <Field label="Quantity" error={errs.qty}><input type="number" min="1" step="1" max={avail || undefined} value={f.qty} onChange={(e) => set('qty', e.target.value)} aria-invalid={!!errs.qty} /></Field>
          <Field label="Tool ID">{ro(t?.toolId || '')}</Field>
          <Field label="Tool category">{ro(t?.category || '')}</Field>
          <Field label="Tool name">{ro(t?.name || '')}</Field>
          <Field label="Date of purchase">{ro(t ? fmtDate(t.purchaseDate) : '')}</Field>
          <Field label="Purchase value">{ro(t ? fmtSAR(Number(t.unitValue) * (Number(f.qty) || 0)) : '')}</Field>
          <Field label="Current value">{ro(v ? fmtSAR(v.current) : t ? 'Value missing' : '')}</Field>
          <Field label="Depreciation">{ro(v ? `${fmtSAR(v.dep)} · ${fmtPct(v.pct)}` : '')}</Field>
          <Field label="Condition" error={errs.condition}><CondSelect value={f.condition} onChange={(c) => set('condition', c)} /></Field>
          <Field label="Date of handover" error={errs.handoverDate}><input type="date" max={TODAY} value={f.handoverDate} onChange={(e) => set('handoverDate', e.target.value)} aria-invalid={!!errs.handoverDate} /></Field>
        </div>
        <h4 className="sec">When it comes back or is passed on <span className="muted small">fill in only one</span></h4>
        <div className="fgrid three">
          <Field label="Return to office" hint="Leave empty while the employee has it." error={errs.returnDate}><input type="date" min={f.handoverDate} max={TODAY} value={f.returnDate} onChange={(e) => set('returnDate', e.target.value)} disabled={!isBlank(f.handoverTo)} autoFocus={mode === 'return'} aria-invalid={!!errs.returnDate} /></Field>
          {newHandover && <Field label="Next employee ID" error={errs.nextEmpId}><input list="dl-emp" value={f.nextEmpId} onChange={(e) => onNextId(e.target.value)} placeholder="e.g. E-1034" aria-invalid={!!errs.nextEmpId} /></Field>}
          <Field label="Handover to employee name" hint={wasHanded ? 'Already handed over.' : 'If the tool goes to another employee instead of the office.'} error={errs.handoverTo}><input value={f.handoverTo} onChange={(e) => set('handoverTo', e.target.value)} disabled={!!f.returnDate || wasHanded} autoFocus={mode === 'handover'} aria-invalid={!!errs.handoverTo} /></Field>
          {newHandover && <>
            <Field label="Next employee designation" error={errs.nextDesignation}><input list="dl-desig" value={f.nextDesignation} onChange={(e) => set('nextDesignation', e.target.value)} aria-invalid={!!errs.nextDesignation} /></Field>
            <Field label="Date passed on" error={errs.passDate}><input type="date" min={f.handoverDate} max={TODAY} value={f.passDate} onChange={(e) => set('passDate', e.target.value)} aria-invalid={!!errs.passDate} /></Field>
          </>}
          <Field label="Remarks" span={newHandover ? 1 : 2}><input value={f.remarks || ''} onChange={(e) => set('remarks', e.target.value)} placeholder="Optional" /></Field>
        </div>
        {newHandover && <p className="muted small">Saving closes this allocation as Handed over and opens a new one for {f.handoverTo || 'the next employee'} with the same tool and quantity.</p>}
      </form>
      <datalist id="dl-emp">{Object.values(known).map((k) => <option key={k.empId} value={k.empId}>{k.empName}</option>)}</datalist>
      <datalist id="dl-desig">{[...new Set(['Site engineer', 'Electrician', 'Plumber', 'Foreman', 'Technician', ...Object.values(known).map((k) => k.designation)])].map((d) => <option key={d} value={d} />)}</datalist>
      {ex?.log?.length > 0 && <details className="mt"><summary className="muted small">Change history ({ex.log.length})</summary><ul className="loglist">{[...ex.log].reverse().map((l, i) => <li key={i}><span className="num muted small">{new Date(l.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span><span>{l.text} <span className="muted">· {l.by}</span></span></li>)}</ul></details>}
      {fail && <div className="formerr"><AlertTriangle size={16} />{fail}</div>}
    </Modal>
  )
}

// ======================= office assets (basic) =======================
/** The office asset form is built from this list, so fields can be added later without re-entering existing assets. */
const OFFICE_FIELDS = [
  { key: 'assetId', label: 'Asset ID', required: true, hint: 'Filled in for you. You can change it.' },
  { key: 'name', label: 'Asset name', required: true, placeholder: 'e.g. Dell laptop' },
  { key: 'category', label: 'Category', list: OFFICE_CATEGORIES, placeholder: 'e.g. Computer' },
  { key: 'location', label: 'Location or who holds it', placeholder: 'e.g. Dammam HQ · Accounts' },
  { key: 'purchaseDate', label: 'Date of purchase', type: 'date' },
  { key: 'purchaseValue', label: 'Purchase value (SAR)', type: 'number' },
  { key: 'condition', label: 'Condition', type: 'condition' },
  { key: 'remarks', label: 'Remarks', type: 'textarea', span: 2 },
]
function OfficeAssetForm({ id, onClose }) {
  const { db, update, toast } = useApp()
  const list = db.officeAssets || []
  const ex = id ? list.find((o) => o.id === id) : null
  const [f, setF] = useState(() => Object.fromEntries(OFFICE_FIELDS.map((x) => [x.key, ex ? (ex[x.key] ?? '') : x.key === 'assetId' ? nextCode(list, 'assetId', 'OA') : x.key === 'condition' ? 'good' : ''])))
  const [errs, setErrs] = useState({})
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: '' })) }
  const save = () => {
    const e = {}
    OFFICE_FIELDS.forEach((x) => { if (x.required && isBlank(f[x.key])) e[x.key] = `Enter the ${x.label.toLowerCase()}.` })
    const aid = String(f.assetId).trim().toUpperCase()
    if (aid && list.some((o) => o.id !== ex?.id && String(o.assetId).toUpperCase() === aid)) e.assetId = `${aid} is already used. Use a different ID.`
    if (!isBlank(f.purchaseValue) && (isNaN(Number(f.purchaseValue)) || Number(f.purchaseValue) < 0)) e.purchaseValue = 'Enter 0 or more, or leave it empty.'
    if (f.purchaseDate && f.purchaseDate > TODAY) e.purchaseDate = 'The date of purchase cannot be in the future.'
    setErrs(e)
    if (Object.values(e).some(Boolean)) return
    const rec = { ...f, assetId: aid, name: f.name.trim(), purchaseValue: isBlank(f.purchaseValue) ? '' : Number(f.purchaseValue) }
    if (ex) update((d) => { const i = d.officeAssets.findIndex((o) => o.id === id); d.officeAssets[i] = { ...d.officeAssets[i], ...rec } }, `Office asset ${aid} updated by ${BY}`)
    else update((d) => { (d.officeAssets ||= []).push({ id: uid('oa'), ...rec, active: true }) }, `Office asset added: ${aid} ${rec.name}`, 'add')
    toast(ex ? 'Office asset updated' : 'Office asset added'); onClose()
  }
  const toggle = () => {
    const on = ex.active === false
    update((d) => { d.officeAssets.find((o) => o.id === id).active = on }, `Office asset ${ex.assetId} ${on ? 'reactivated' : 'deactivated'} by ${BY}`)
    toast(on ? 'Office asset reactivated' : 'Office asset deactivated. It is kept but left out of totals.'); onClose()
  }
  return (
    <Modal title={ex ? `Edit ${ex.assetId}` : 'Add an office asset'} sub="Basic details for now. More fields can be added later." icon={Building2} onClose={onClose} width={640}
      footer={<>
        {ex && <Btn kind="ghost" icon={ex.active === false ? RotateCcw : Ban} onClick={toggle}>{ex.active === false ? 'Reactivate' : 'Deactivate'}</Btn>}
        <span className="grow" />
        <Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save}>{ex ? 'Save changes' : 'Add office asset'}</Btn>
      </>}>
      <form className="fgrid" onSubmit={(e) => { e.preventDefault(); save() }} noValidate>
        {OFFICE_FIELDS.map((x, i) => (
          <Field key={x.key} label={x.label + (x.required ? '' : ' (optional)')} hint={x.hint} span={x.span} error={errs[x.key]}>
            {x.type === 'condition' ? <CondSelect value={f[x.key]} onChange={(v) => set(x.key, v)} />
              : x.type === 'textarea' ? <textarea rows={2} value={f[x.key]} onChange={(e) => set(x.key, e.target.value)} />
                : <input type={x.type || 'text'} list={x.list ? 'dl-oa-' + x.key : undefined} max={x.type === 'date' ? TODAY : undefined} min={x.type === 'number' ? 0 : undefined} value={f[x.key]} onChange={(e) => set(x.key, e.target.value)} placeholder={x.placeholder} autoFocus={i === 1 && !ex} aria-invalid={!!errs[x.key]} />}
          </Field>
        ))}
      </form>
      {OFFICE_FIELDS.filter((x) => x.list).map((x) => <datalist key={x.key} id={'dl-oa-' + x.key}>{x.list.map((o) => <option key={o} value={o} />)}</datalist>)}
    </Modal>
  )
}

// ======================= total value report =======================
export function assetReportData(db, { asOf = TODAY, type = 'all', place = 'all' } = {}) {
  const rows = assetRows(db, asOf).filter((r) => (type === 'all' || r.type === type) && (place === 'all' || r.place === place))
  const tot = assetTotals(rows)
  const by = tot.by.filter((b) => type === 'all' || b.type === type)
  const excluded = rows.filter((r) => r.excluded).length
  const note = [tot.total.missing ? `${tot.total.missing} asset${tot.total.missing > 1 ? 's have' : ' has'} no value and ${tot.total.missing > 1 ? 'are' : 'is'} not included.` : '', excluded ? `${excluded} lost, scrapped or deactivated asset${excluded > 1 ? 's are' : ' is'} left out.` : ''].filter(Boolean).join(' ')
  return {
    by, total: tot.total, note,
    section: {
      columns: ['Asset type', 'Assets', 'Purchase value (SAR)', 'Depreciation (SAR)', 'Current value (SAR)'],
      rows: by.map((b) => [b.label, b.count, Math.round(b.cost), Math.round(b.dep), Math.round(b.current)]),
      totalRow: ['Grand total', String(tot.total.count), Math.round(tot.total.cost), Math.round(tot.total.dep), Math.round(tot.total.current)],
      note,
    },
  }
}
export const assetPlaces = (db) => [...new Set(assetRows(db).map((r) => r.place))].sort()

function AssetReport({ type: t0 = 'all', onClose }) {
  const { db, update, toast } = useApp()
  const [asOf, setAsOf] = useState(TODAY)
  const [type, setType] = useState(t0)
  const [place, setPlace] = useState('all')
  const [busy, setBusy] = useState('')
  const r = useMemo(() => assetReportData(db, { asOf, type, place }), [db, asOf, type, place])
  const generated = new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const sub = `Value as of ${fmtDate(asOf)} · ${type === 'all' ? 'All asset types' : ASSET_TYPES[type].plural}${place === 'all' ? '' : ' · ' + place} · Produced ${generated}`
  const run = async (kind) => {
    setBusy(kind)
    const opts = { title: 'Total assets value report', sub, sections: [r.section], fname: `TI_Total_assets_value_${asOf}`, sheet: 'Total assets' }
    try {
      if (kind === 'xlsx') await exportExcel(opts); else await exportPdf({ ...opts, print: kind === 'print' })
      update(() => {}, `Total assets value report ${kind === 'print' ? 'printed' : 'downloaded as ' + (kind === 'xlsx' ? 'Excel' : 'PDF')}`, 'add')
      if (kind !== 'print') toast(kind === 'xlsx' ? 'Excel file downloaded' : 'PDF downloaded')
    } catch { toast('The report could not be produced. Please try again.', 'bad') } finally { setBusy('') }
  }
  return (
    <Modal title="Total value report" sub={`Produced ${generated}`} icon={BarChart3} onClose={onClose} width={860}
      footer={<><Btn kind="ghost" onClick={onClose}>Close</Btn><span className="grow" />
        <Btn kind="ghost" icon={Printer} disabled={!!busy} onClick={() => run('print')}>Print</Btn>
        <Btn kind="excel" icon={FileSpreadsheet} disabled={!!busy} onClick={() => run('xlsx')}>Excel</Btn>
        <Btn kind="dark" icon={FileDown} disabled={!!busy} onClick={() => run('pdf')}>PDF</Btn></>}>
      <div className="fgrid three">
        <Field label="Asset type"><select value={type} onChange={(e) => setType(e.target.value)}><option value="all">All asset types</option>{Object.entries(ASSET_TYPES).map(([k, a]) => <option key={k} value={k}>{a.plural}</option>)}</select></Field>
        <Field label="Location"><select value={place} onChange={(e) => setPlace(e.target.value)}><option value="all">All locations</option>{assetPlaces(db).map((p) => <option key={p}>{p}</option>)}</select></Field>
        <Field label="Value as of"><input type="date" max={TODAY} value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} /></Field>
      </div>
      <div className="tablewrap mt"><table className="tbl">
        <thead><tr>{r.section.columns.map((c, i) => <th key={c} className={i ? 'r' : ''}>{c}</th>)}</tr></thead>
        <tbody>{r.by.map((b) => <tr key={b.type}><td><b>{b.label}</b></td><td className="r num">{b.count}</td><td className="r num">{fmtSAR(b.cost)}</td><td className="r num">{fmtSAR(b.dep)}</td><td className="r num"><b>{fmtSAR(b.current)}</b></td></tr>)}</tbody>
        <tfoot><tr><td><b>Grand total</b></td><td className="r num"><b>{r.total.count}</b></td><td className="r num"><b>{fmtSAR(r.total.cost)}</b></td><td className="r num"><b>{fmtSAR(r.total.dep)}</b></td><td className="r num"><b className="qtybig">{fmtSAR(r.total.current)}</b></td></tr></tfoot>
      </table></div>
      {r.note && <p className="muted small mt"><AlertTriangle size={14} /> {r.note}</p>}
      <p className="muted small">Depreciation rates: {['vehicles', 'handTools', 'officeAssets'].map((k) => `${k === 'vehicles' ? 'Vehicles' : k === 'handTools' ? 'Hand tools' : 'Office assets'} ${rateOf(db.settings, k)}%`).join(' · ')} per year. Change them in Settings.</p>
    </Modal>
  )
}

export const ASSET_OVERLAYS = {
  handToolForm: HandToolForm, handTool: HandToolDrawer, employee: EmployeeDrawer, allocate: AllocationForm,
  officeAssetForm: OfficeAssetForm, assetReport: AssetReport, backToAssets: BackToAssets,
}
