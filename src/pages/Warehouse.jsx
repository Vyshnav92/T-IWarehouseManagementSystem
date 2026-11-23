import { useEffect, useMemo, useState } from 'react'
import { PackagePlus, PackageMinus, Plus, Search, Boxes, ArrowDownToLine, ArrowUpFromLine, FileSpreadsheet, Package, Download, AlertTriangle } from 'lucide-react'
import { downloadVoucher, exportExcel } from '../exporter'
import { useApp } from '../store'
import { KINDS, STOCK_STATUS, fmtDate, fmtNum, daysUntil, lowLimit, stockValue, fmt2, TODAY } from '../data'
import { insights } from '../ai'
import { PageHeader, Tabs, Btn, Pill, Empty, AiTag, cx } from '../ui'

export default function Warehouse() {
  const { db, route, go, open } = useApp()
  const tab = route.tab || 'stock'
  const ins = useMemo(() => insights(db), [db])
  const ins_ = db.movements.filter((m) => KINDS[m.kind].group === 'in')
  const outs = db.movements.filter((m) => m.kind === 'issue')
  const low = ins.fc.filter((f) => f.status !== 'ok').length
  useEffect(() => { if (tab === 'tools') go('handtools') }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps -- old Tools tab links
  return (
    <div className="page">
      <PageHeader title="Warehouse" ar="المستودع" desc="Every material you hold. Stock goes up when materials come in and down when they go out to a site. The counting is done for you."
        how={[`Press Stock in when materials arrive from a supplier, or come back from a site.`, `Press Stock out when you send materials to a project. You can type it like a WhatsApp message.`, `Stock levels update straight away. Items below ${lowLimit(db)} show as “Running low”.`, `Tap any material to see its full history, or go to Reports to download Excel or PDF.`]}
        actions={<>
          <Btn kind="in" icon={PackagePlus} onClick={() => open('entry', { kind: 'purchase' })}>Stock in</Btn>
          <Btn kind="out" icon={PackageMinus} onClick={() => open('entry', { kind: 'issue' })}>Stock out</Btn>
        </>} />
      <Tabs value={tab} onChange={(t) => go('warehouse', t === 'stock' ? null : t)} tabs={[
        { id: 'stock', label: 'Stock levels', icon: Boxes, count: low || null, alert: true },
        { id: 'in', label: 'Stock in', icon: ArrowDownToLine, count: ins_.length },
        { id: 'out', label: 'Stock out', icon: ArrowUpFromLine, count: outs.length },
      ]} />
      {tab === 'stock' && <StockLevels ins={ins} />}
      {tab === 'in' && <MovementList list={ins_} kinds={['purchase', 'return']} />}
      {tab === 'out' && <MovementList list={outs} kinds={['issue']} />}
    </div>
  )
}

function StockLevels({ ins }) {
  const { db, open, toast } = useApp()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const [st, setSt] = useState('all')
  const limit = lowLimit(db)
  const cats = ['All', ...new Set(ins.fc.map((f) => f.m.category))]
  const rows = ins.fc.filter((f) => (cat === 'All' || f.m.category === cat) && (st === 'all' || (st === 'low' ? f.status !== 'ok' : f.status === st)) && f.m.name.toLowerCase().includes(q.toLowerCase()))
  const counts = { low: ins.fc.filter((f) => f.status === 'low').length, out: ins.fc.filter((f) => f.status === 'out').length }
  const month = db.movements.filter((m) => !m.cancelled && daysUntil(m.date) >= -30).length
  const sv = stockValue(db)
  const exportList = () => exportExcel({ title: 'Stock levels', sub: `As of ${fmtDate(TODAY)}${cat !== 'All' ? ' · ' + cat : ''}${st !== 'all' ? ' · ' + (st === 'low' ? 'Low or out' : STOCK_STATUS[st].label) : ''}`, fname: `TI_Stock_levels_${TODAY}`, sheet: 'Stock levels',
    sections: [{ columns: ['Material', 'Category', 'Unit', 'In stock', 'Status'], rows: rows.map((f) => [f.m.name, f.m.category, f.m.unit, f.bal, STOCK_STATUS[f.status].label]) }] })
    .then(() => toast('Excel file downloaded'), () => toast("Couldn't make the Excel file. Please try again.", 'bad'))
  return <>
    <div className="kpis five">
      <Kpi label="Materials" value={ins.fc.length} sub={`in ${cats.length - 1} categories`} />
      <Kpi label="Running low" value={counts.low} sub={`below ${limit}`} tone={counts.low ? 'warn' : ''} onClick={() => setSt('low')} />
      <Kpi label="Out of stock" value={counts.out} sub="nothing left" tone={counts.out ? 'bad' : ''} onClick={() => setSt('out')} />
      <Kpi label="Entries this month" value={month} sub="in and out" />
      <Kpi label="Total stock value" value={`SAR ${fmt2(sv.total)}`} sub={`from ${sv.count} purchase${sv.count === 1 ? '' : 's'}${sv.unpriced ? ` · ${sv.unpriced} ha${sv.unpriced === 1 ? 's' : 've'} no price` : ''}`} tone={sv.unpriced ? 'warn' : ''} />
    </div>
    {counts.low + counts.out > 0 && st !== 'low' && (
      <div className="banner warn"><AlertTriangle size={18} /><div className="grow"><b>{counts.low + counts.out} material{counts.low + counts.out > 1 ? 's are' : ' is'} running low</b> (below {limit}).</div>
        <Btn kind="ghost" size="sm" onClick={() => { setSt('low'); setCat('All') }}>Show them</Btn></div>
    )}
    <section className="card flush">
      <div className="toolbar">
        <div className="search sm"><Search size={16} className="search-ic" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a material…" /></div>
        <div className="chips">{cats.map((c) => <button key={c} className={cx('chip', cat === c && 'on')} onClick={() => setCat(c)}>{c}</button>)}</div>
        <select className="sel" value={st} onChange={(e) => setSt(e.target.value)}><option value="all">All statuses</option><option value="low">Low or out</option><option value="ok">In stock</option><option value="out">Out of stock</option></select>
        <Btn kind="ghost" size="sm" icon={Plus} onClick={() => open('materialForm')}>New material</Btn>
        <Btn kind="ghost" size="sm" icon={FileSpreadsheet} onClick={exportList} disabled={!rows.length}>Export</Btn>
      </div>
      <div className="tablewrap">
        <table className="tbl big">
          <thead><tr><th>Material</th><th>Category</th><th className="r">In stock</th><th className="hide-sm">Level</th><th>Status</th><th className="hide-sm">Lasts about <AiTag>forecast</AiTag></th></tr></thead>
          <tbody>
            {rows.map((f) => {
              const pct = Math.min(100, (f.bal / (limit * 3)) * 100)
              return (
                <tr key={f.m.id} className="click" onClick={() => open('material', { id: f.m.id })}>
                  <td><b>{f.m.name}</b></td>
                  <td className="muted">{f.m.category}</td>
                  <td className="r num"><b className="qtybig">{fmtNum(f.bal)}</b> <span className="muted small">{f.m.unit}</span></td>
                  <td className="hide-sm"><div className={cx('lvl', f.status)}><i style={{ width: Math.max(2, pct) + '%' }} /><em style={{ left: '33.3%' }} title={`Running low below ${limit}`} /></div></td>
                  <td><Pill tone={STOCK_STATUS[f.status].tone} dot={f.status !== 'ok'}>{STOCK_STATUS[f.status].label}</Pill></td>
                  <td className="hide-sm">{f.runOut === null ? <span className="muted small">Not used lately</span> : <span className={cx('small', f.runOut <= 7 ? 'badc' : f.runOut <= 14 ? 'warnc' : 'muted')}>{f.runOut === 0 ? 'Runs out today' : `${f.runOut} days`}</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!rows.length && <Empty icon={Search} title="No materials match" text="Try a different word or category." />}
      </div>
    </section>
  </>
}

function MovementList({ list, kinds }) {
  const { db, open, toast } = useApp()
  const [q, setQ] = useState('')
  const [k, setK] = useState('all')
  const isOut = kinds[0] === 'issue'
  const name = (id) => db.materials.find((m) => m.id === id)?.name || ''
  const rows = [...list].reverse().filter((mv) => (k === 'all' || mv.kind === k) && (!q || [mv.no, mv.project, mv.vendor, mv.engineer, mv.reqNo, mv.mtn, mv.billNo, ...mv.lines.map((l) => name(l.materialId))].join(' ').toLowerCase().includes(q.toLowerCase())))
  return (
    <section className="card flush">
      <div className="toolbar">
        <div className="search sm"><Search size={16} className="search-ic" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={isOut ? 'Search project, engineer, request no…' : 'Search supplier, bill no, project…'} /></div>
        {!isOut && <div className="chips">{[['all', 'All'], ['purchase', 'Purchases'], ['return', 'Returns']].map(([v, l]) => <button key={v} className={cx('chip', k === v && 'on')} onClick={() => setK(v)}>{l}</button>)}</div>}
        <span className="grow" />
        {isOut ? <Btn kind="out" size="sm" icon={PackageMinus} onClick={() => open('entry', { kind: 'issue' })}>New stock out</Btn>
          : <><Btn kind="ghost" size="sm" icon={Plus} onClick={() => open('entry', { kind: 'return' })}>Return from site</Btn><Btn kind="in" size="sm" icon={PackagePlus} onClick={() => open('entry', { kind: 'purchase' })}>New purchase</Btn></>}
      </div>
      <div className="tablewrap">
        <table className="tbl">
          <thead><tr><th>No.</th><th>Date</th>{!isOut && <th>Type</th>}<th>{isOut ? 'Project / site' : 'From'}</th><th className="hide-sm">{isOut ? 'Site engineer' : 'Bill / MTN'}</th><th className="hide-sm">Req. no.</th><th>Materials</th>{isOut && <th>Voucher</th>}</tr></thead>
          <tbody>
            {rows.map((mv) => (
              <tr key={mv.id} className={cx('click', mv.cancelled && 'struck')} onClick={() => open('movement', { id: mv.id })}>
                <td><span className="mono">{mv.no}</span>{mv.cancelled && <Pill tone="bad">Cancelled</Pill>}{!mv.cancelled && mv.kind === 'purchase' && mv.lines.some((l) => l.unitPrice == null) && <Pill tone="warn">Price missing</Pill>}</td>
                <td className="num nowrap">{fmtDate(mv.date)}</td>
                {!isOut && <td><Pill tone={KINDS[mv.kind].tone}>{mv.kind === 'purchase' ? 'Purchase' : 'Return'}</Pill></td>}
                <td><b>{mv.kind === 'purchase' ? mv.vendor : mv.project}</b></td>
                <td className="hide-sm muted">{isOut ? mv.engineer : mv.billNo || (mv.mtn ? 'MTN ' + mv.mtn : '—')}</td>
                <td className="hide-sm muted">{mv.reqNo || '—'}</td>
                <td className="small">{mv.lines.slice(0, 2).map((l) => `${fmtNum(l.qty)} × ${name(l.materialId)}`).join(', ')}{mv.lines.length > 2 && <span className="muted"> +{mv.lines.length - 2} more</span>}</td>
                {isOut && <td><button className="iconbtn sm" title="Download voucher" aria-label={`Download voucher ${mv.no}`} onClick={(e) => { e.stopPropagation(); downloadVoucher(mv, db, toast) }}><Download size={17} /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty icon={Package} title="Nothing here yet" text="Entries you save will appear here." />}
      </div>
    </section>
  )
}

export function Kpi({ label, value, sub, tone, onClick }) {
  const C = onClick ? 'button' : 'div'
  return <C className={cx('kpi', tone && 'kpi-' + tone, onClick && 'click')} onClick={onClick}><span className="kpi-l">{label}</span><b className="kpi-v">{value}</b><span className="kpi-s">{sub}</span></C>
}
