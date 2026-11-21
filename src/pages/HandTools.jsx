import { useMemo, useState } from 'react'
import { Wrench, Plus, Search, FileSpreadsheet, FileDown, Undo2, ArrowRightLeft, Pencil, Users, ClipboardList, Hand } from 'lucide-react'
import { useApp } from '../store'
import { fmtDate, fmtSAR, TOOL_CONDITIONS, ALLOC_STATUS, allocStatus, depreciate, rateOf, qtyWithStaff, fmtPct, TODAY } from '../data'
import { PageHeader, Tabs, Btn, Pill, Empty, cx } from '../ui'
import { exportExcel, exportPdf } from '../exporter'
import { Kpi } from './Warehouse'

/** Value of one allocation: purchase value per unit × quantity, depreciated from the tool's purchase date. */
export const allocValue = (db, a, t) => (t ? depreciate(t.unitValue === '' || t.unitValue == null ? null : Number(t.unitValue) * Number(a.qty || 0), t.purchaseDate, rateOf(db.settings, 'handTools')) : null)
export const toolValue = (db, t) => depreciate(t.unitValue === '' || t.unitValue == null ? null : Number(t.unitValue) * Number(t.qty || 0), t.purchaseDate, rateOf(db.settings, 'handTools'))
/** Return or handover details shown in the list. */
export const allocDetail = (a) => (a.returnDate ? `Returned ${fmtDate(a.returnDate)}` : a.handoverTo ? `To ${a.handoverTo}${a.closedDate ? ' · ' + fmtDate(a.closedDate) : ''}` : '—')

export default function HandTools() {
  const { db, route, go, open } = useApp()
  const tab = route.tab || 'list'
  const tools = db.handTools || []
  const allocs = db.allocations || []
  const active = tools.filter((t) => t.active !== false)
  const out = allocs.filter((a) => allocStatus(a) === 'with')
  const owned = active.reduce((s, t) => s + Number(t.qty || 0), 0)
  const withStaff = out.reduce((s, a) => s + Number(a.qty || 0), 0)
  const value = active.reduce((s, t) => s + (toolValue(db, t)?.current || 0), 0)
  return (
    <div className="page">
      <PageHeader title="Hand tools" ar="العدد اليدوية" desc="Tools held by staff. Add a tool to the catalog once, then pick it from the list whenever you give it to an employee."
        how={['Press Add tool to put a tool in the catalog with its purchase date and value. Tools bought on different dates are added separately.', 'Press Allocate tool when you give a tool to an employee. Pick the tool from the list; its details fill in for you.', 'When the tool comes back, press Return. If it goes straight to another employee, press Hand over.', 'Current value and depreciation are worked out from the hand tools rate in Settings.']}
        actions={<>
          <Btn kind="ghost" icon={Plus} onClick={() => open('handToolForm')}>Add tool</Btn>
          <Btn icon={Hand} onClick={() => open('allocate')}>Allocate tool</Btn>
        </>} />
      <div className="kpis">
        <Kpi label="Tools in catalog" value={active.length} sub={`${owned} units owned`} />
        <Kpi label="With employees" value={withStaff} sub={`${new Set(out.map((a) => a.empId)).size} employees`} />
        <Kpi label="In the office" value={owned - withStaff} sub="available to give out" />
        <Kpi label="Current value" value={fmtSAR(value)} sub={`depreciates ${rateOf(db.settings, 'handTools')}% a year`} />
      </div>
      <Tabs value={tab} onChange={(t) => go('handtools', t === 'list' ? null : t)} tabs={[
        { id: 'list', label: 'Allocations', icon: ClipboardList, count: allocs.length },
        { id: 'catalog', label: 'Tool catalog', icon: Wrench, count: tools.length },
      ]} />
      {tab === 'list' ? <AllocationList /> : <Catalog />}
    </div>
  )
}

function AllocationList() {
  const { db, open, toast } = useApp()
  const [q, setQ] = useState('')
  const [st, setSt] = useState('all')
  const [cat, setCat] = useState('all')
  const [cond, setCond] = useState('all')
  const tools = db.handTools || []
  const tool = (id) => tools.find((t) => t.id === id)
  const cats = [...new Set(tools.map((t) => t.category))].sort()
  const rows = useMemo(() => [...(db.allocations || [])]
    .sort((a, b) => (a.handoverDate < b.handoverDate ? 1 : -1))
    .filter((a) => {
      const t = tool(a.toolRef) || {}
      const s = q.trim().toLowerCase()
      return (st === 'all' || allocStatus(a) === st) && (cat === 'all' || t.category === cat) && (cond === 'all' || a.condition === cond)
        && (!s || [a.empId, a.empName, a.designation, t.toolId, t.name].join(' ').toLowerCase().includes(s))
    }), [db, q, st, cat, cond]) // eslint-disable-line react-hooks/exhaustive-deps

  const table = () => ({
    columns: ['Employee ID', 'Employee name', 'Designation', 'Tool ID', 'Tool name', 'Category', 'Qty', 'Condition', 'Date of handover', 'Date of purchase', 'Return / handover', 'Current value (SAR)', 'Depreciation (SAR)', 'Status', 'Remarks'],
    rows: rows.map((a) => { const t = tool(a.toolRef) || {}; const v = allocValue(db, a, t); return [a.empId, a.empName, a.designation, t.toolId || '', t.name || '', t.category || '', Number(a.qty), TOOL_CONDITIONS[a.condition]?.label || '', fmtDate(a.handoverDate), fmtDate(t.purchaseDate), allocDetail(a), v ? Math.round(v.current) : 'Value missing', v ? Math.round(v.dep) : '', ALLOC_STATUS[allocStatus(a)].label, a.remarks || ''] }),
  })
  const exp = async (kind) => {
    const opts = { title: 'Hand tools', sub: `As of ${fmtDate(TODAY)} · ${rows.length} allocations`, sections: [table()], fname: `TI_Hand_tools_${TODAY}`, money: false }
    try { await (kind === 'xlsx' ? exportExcel(opts) : exportPdf(opts)); toast(kind === 'xlsx' ? 'Excel file downloaded' : 'PDF downloaded') } catch { toast('The download failed. Please try again.', 'bad') }
  }

  return (
    <section className="card flush">
      <div className="toolbar">
        <div className="search sm"><Search size={16} className="search-ic" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employee, tool ID or name…" aria-label="Search allocations" /></div>
        <select className="sel" value={st} onChange={(e) => setSt(e.target.value)} aria-label="Status"><option value="all">All statuses</option>{Object.entries(ALLOC_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}</select>
        <select className="sel" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="all">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
        <select className="sel" value={cond} onChange={(e) => setCond(e.target.value)} aria-label="Condition"><option value="all">All conditions</option>{Object.entries(TOOL_CONDITIONS).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}</select>
        <span className="grow" />
        <Btn kind="excel" size="sm" icon={FileSpreadsheet} disabled={!rows.length} onClick={() => exp('xlsx')}>Excel</Btn>
        <Btn kind="dark" size="sm" icon={FileDown} disabled={!rows.length} onClick={() => exp('pdf')}>PDF</Btn>
      </div>
      <div className="tablewrap">
        <table className="tbl">
          <thead><tr><th>Employee ID</th><th>Name</th><th>Designation</th><th>Tool ID</th><th>Tool name</th><th className="r">Qty</th><th>Condition</th><th>Handover</th><th>Return / handover</th><th className="r">Current value</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.map((a) => {
              const t = tool(a.toolRef) || {}
              const s = allocStatus(a)
              const v = allocValue(db, a, t)
              const c = TOOL_CONDITIONS[a.condition]
              return (
                <tr key={a.id}>
                  <td className="mono nowrap">{a.empId}</td>
                  <td><button className="linkish" onClick={() => open('employee', { empId: a.empId })}><b>{a.empName}</b></button></td>
                  <td className="muted">{a.designation}</td>
                  <td className="mono nowrap">{t.toolId}</td>
                  <td><button className="linkish" onClick={() => open('handTool', { id: t.id })}>{t.name}</button></td>
                  <td className="r num">{a.qty}</td>
                  <td>{c && <Pill tone={c.tone}>{c.label}</Pill>}</td>
                  <td className="num nowrap">{fmtDate(a.handoverDate)}</td>
                  <td className="small">{allocDetail(a)}</td>
                  <td className="r num nowrap">{v ? <span title={`Depreciation ${fmtSAR(v.dep)} (${fmtPct(v.pct)})`}>{fmtSAR(v.current)}</span> : <Pill tone="warn">Value missing</Pill>}</td>
                  <td><Pill tone={ALLOC_STATUS[s].tone} dot={s === 'with'}>{ALLOC_STATUS[s].label}</Pill></td>
                  <td className="nowrap">
                    {s === 'with' && <>
                      <button className="iconbtn sm" title="Return to office" aria-label={`Return ${t.name} from ${a.empName}`} onClick={() => open('allocate', { id: a.id, mode: 'return' })}><Undo2 size={15} /></button>
                      <button className="iconbtn sm" title="Hand over to another employee" aria-label={`Hand over ${t.name} from ${a.empName}`} onClick={() => open('allocate', { id: a.id, mode: 'handover' })}><ArrowRightLeft size={15} /></button>
                    </>}
                    <button className="iconbtn sm" title="Edit" aria-label={`Edit allocation of ${t.name} to ${a.empName}`} onClick={() => open('allocate', { id: a.id })}><Pencil size={15} /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!rows.length && <Empty icon={Users} title={(db.allocations || []).length ? 'No allocations match' : 'No tools given out yet'} text={(db.allocations || []).length ? 'Try a different word or filter.' : 'Press Allocate tool when you give a tool to an employee.'} />}
      </div>
    </section>
  )
}

function Catalog() {
  const { db, open } = useApp()
  const [q, setQ] = useState('')
  const [showOff, setShowOff] = useState(false)
  const tools = (db.handTools || []).filter((t) => (showOff || t.active !== false) && (!q.trim() || [t.toolId, t.name, t.category].join(' ').toLowerCase().includes(q.trim().toLowerCase())))
  return (
    <section className="card flush">
      <div className="toolbar">
        <div className="search sm"><Search size={16} className="search-ic" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tool ID, name or category…" aria-label="Search catalog" /></div>
        <label className="row-gap small"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Show deactivated tools</label>
        <span className="grow" />
        <Btn size="sm" icon={Plus} onClick={() => open('handToolForm')}>Add tool</Btn>
      </div>
      <div className="tablewrap">
        <table className="tbl">
          <thead><tr><th>Tool ID</th><th>Tool name</th><th>Category</th><th className="r">Owned</th><th className="r">With staff</th><th className="r">Available</th><th>Date of purchase</th><th className="r">Value per unit</th><th className="r">Current value</th><th>Condition</th><th /></tr></thead>
          <tbody>
            {tools.map((t) => {
              const ws = qtyWithStaff(db, t.id)
              const v = toolValue(db, t)
              const c = TOOL_CONDITIONS[t.condition]
              return (
                <tr key={t.id} className={cx('click', t.active === false && 'struck')} onClick={() => open('handTool', { id: t.id })}>
                  <td className="mono nowrap">{t.toolId}</td>
                  <td><b>{t.name}</b>{t.active === false && <> <Pill>Deactivated</Pill></>}</td>
                  <td className="muted">{t.category}</td>
                  <td className="r num">{t.qty}</td>
                  <td className="r num">{ws}</td>
                  <td className="r num"><b>{Number(t.qty) - ws}</b></td>
                  <td className="num nowrap">{fmtDate(t.purchaseDate)}</td>
                  <td className="r num nowrap">{t.unitValue === '' || t.unitValue == null ? '—' : fmtSAR(t.unitValue)}</td>
                  <td className="r num nowrap">{v ? fmtSAR(v.current) : <Pill tone="warn">Value missing</Pill>}</td>
                  <td>{c && <Pill tone={c.tone}>{c.label}</Pill>}</td>
                  <td><button className="iconbtn sm" title="Edit" aria-label={`Edit ${t.name}`} onClick={(e) => { e.stopPropagation(); open('handToolForm', { id: t.id }) }}><Pencil size={15} /></button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!tools.length && <Empty icon={Wrench} title="No tools in the catalog" text="Press Add tool to add the first one." />}
      </div>
    </section>
  )
}
