import { useMemo, useState } from 'react'
import { PackagePlus, PackageMinus, Plus, Search, Boxes, ArrowDownToLine, ArrowUpFromLine, Hammer, FileSpreadsheet, MapPin, Sparkles, Package, Pencil } from 'lucide-react'
import { useApp } from '../store'
import { KINDS, STOCK_STATUS, fmtDate, fmtNum, toolsAtSites, daysUntil, balances, TOOL_CONDITIONS, toolCondition } from '../data'
import { insights } from '../ai'
import { PageHeader, Tabs, Btn, Pill, Empty, AiTag, cx } from '../ui'

export default function Warehouse() {
  const { db, route, go, open } = useApp()
  const tab = route.tab || 'stock'
  const ins = useMemo(() => insights(db), [db])
  const ins_ = db.movements.filter((m) => KINDS[m.kind].group === 'in')
  const outs = db.movements.filter((m) => m.kind === 'issue')
  const low = ins.fc.filter((f) => f.status !== 'ok').length
  return (
    <div className="page">
      <PageHeader title="Warehouse" ar="المستودع" desc="Every material you hold. Stock goes up when materials come in and down when they go out to a site. The counting is done for you."
        how={['Press Stock in when materials arrive from a supplier, or come back from a site.', 'Press Stock out when you send materials to a project. You can type it like a WhatsApp message.', 'Stock levels update straight away. Items below their minimum show as “Running low”.', 'Tap any material to see its full history, or go to Reports to download Excel or PDF.']}
        actions={<>
          <Btn kind="in" icon={PackagePlus} onClick={() => open('entry', { kind: 'purchase' })}>Stock in</Btn>
          <Btn kind="out" icon={PackageMinus} onClick={() => open('entry', { kind: 'issue' })}>Stock out</Btn>
        </>} />
      <Tabs value={tab} onChange={(t) => go('warehouse', t === 'stock' ? null : t)} tabs={[
        { id: 'stock', label: 'Stock levels', icon: Boxes, count: low || null, alert: true },
        { id: 'in', label: 'Stock in', icon: ArrowDownToLine, count: ins_.length },
        { id: 'out', label: 'Stock out', icon: ArrowUpFromLine, count: outs.length },
        { id: 'tools', label: 'Tools', icon: Hammer },
      ]} />
      {tab === 'stock' && <StockLevels ins={ins} />}
      {tab === 'in' && <MovementList list={ins_} kinds={['purchase', 'return']} />}
      {tab === 'out' && <MovementList list={outs} kinds={['issue']} />}
      {tab === 'tools' && <Tools />}
    </div>
  )
}

function StockLevels({ ins }) {
  const { db, open, go } = useApp()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const [st, setSt] = useState('all')
  const cats = ['All', ...new Set(db.materials.map((m) => m.category))]
  const rows = ins.fc.filter((f) => (cat === 'All' || f.m.category === cat) && (st === 'all' || (st === 'low' ? f.status !== 'ok' : f.status === st)) && f.m.name.toLowerCase().includes(q.toLowerCase()))
  const counts = { low: ins.fc.filter((f) => f.status === 'low').length, out: ins.fc.filter((f) => f.status === 'out').length }
  const month = db.movements.filter((m) => !m.cancelled && daysUntil(m.date) >= -30).length
  return <>
    <div className="kpis">
      <Kpi label="Materials" value={db.materials.length} sub={`in ${cats.length - 1} categories`} />
      <Kpi label="Running low" value={counts.low} sub="below minimum" tone={counts.low ? 'warn' : ''} onClick={() => setSt('low')} />
      <Kpi label="Out of stock" value={counts.out} sub="nothing left" tone={counts.out ? 'bad' : ''} onClick={() => setSt('out')} />
      <Kpi label="Entries this month" value={month} sub="in and out" />
    </div>
    <section className="card flush">
      <div className="toolbar">
        <div className="search sm"><Search size={16} className="search-ic" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a material…" /></div>
        <div className="chips">{cats.map((c) => <button key={c} className={cx('chip', cat === c && 'on')} onClick={() => setCat(c)}>{c}</button>)}</div>
        <select className="sel" value={st} onChange={(e) => setSt(e.target.value)}><option value="all">All statuses</option><option value="low">Low or out</option><option value="ok">In stock</option><option value="out">Out of stock</option></select>
        <Btn kind="ghost" size="sm" icon={Plus} onClick={() => open('materialForm')}>New material</Btn>
        <Btn kind="ghost" size="sm" icon={FileSpreadsheet} onClick={() => go('reports')}>Export</Btn>
      </div>
      <div className="tablewrap">
        <table className="tbl big">
          <thead><tr><th>Material</th><th>Category</th><th className="r">In stock</th><th className="hide-sm">Level</th><th>Status</th><th className="hide-sm">Lasts about <AiTag>forecast</AiTag></th></tr></thead>
          <tbody>
            {rows.map((f) => {
              const pct = Math.min(100, f.m.min ? (f.bal / (f.m.min * 3)) * 100 : 100)
              return (
                <tr key={f.m.id} className="click" onClick={() => open('material', { id: f.m.id })}>
                  <td><b>{f.m.name}</b></td>
                  <td className="muted">{f.m.category}</td>
                  <td className="r num"><b className="qtybig">{fmtNum(f.bal)}</b> <span className="muted small">{f.m.unit}</span></td>
                  <td className="hide-sm"><div className={cx('lvl', f.status)}><i style={{ width: Math.max(2, pct) + '%' }} /><em style={{ left: f.m.min ? '33.3%' : '0' }} title={`Minimum ${f.m.min}`} /></div></td>
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
  const { db, open } = useApp()
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
          <thead><tr><th>No.</th><th>Date</th>{!isOut && <th>Type</th>}<th>{isOut ? 'Project / site' : 'From'}</th><th className="hide-sm">{isOut ? 'Site engineer' : 'Bill / MTN'}</th><th className="hide-sm">Req. no.</th><th>Materials</th></tr></thead>
          <tbody>
            {rows.map((mv) => (
              <tr key={mv.id} className={cx('click', mv.cancelled && 'struck')} onClick={() => open('movement', { id: mv.id })}>
                <td><span className="mono">{mv.no}</span>{mv.cancelled && <Pill tone="bad">Cancelled</Pill>}</td>
                <td className="num nowrap">{fmtDate(mv.date)}</td>
                {!isOut && <td><Pill tone={KINDS[mv.kind].tone}>{mv.kind === 'purchase' ? 'Purchase' : 'Return'}</Pill></td>}
                <td><b>{mv.kind === 'purchase' ? mv.vendor : mv.project}</b></td>
                <td className="hide-sm muted">{isOut ? mv.engineer : mv.billNo || (mv.mtn ? 'MTN ' + mv.mtn : '—')}</td>
                <td className="hide-sm muted">{mv.reqNo || '—'}</td>
                <td className="small">{mv.lines.slice(0, 2).map((l) => `${fmtNum(l.qty)} × ${name(l.materialId)}`).join(', ')}{mv.lines.length > 2 && <span className="muted"> +{mv.lines.length - 2} more</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty icon={Package} title="Nothing here yet" text="Entries you save will appear here." />}
      </div>
    </section>
  )
}

function Tools() {
  const { db, open } = useApp()
  const sites = toolsAtSites(db)
  const bal = useMemo(() => balances(db), [db])
  const tools = db.materials.filter((m) => m.category === 'Tools')
  const atSites = (id) => sites.reduce((a, s) => a + (s.tools.find((t) => t.id === id)?.q || 0), 0)
  return <>
    <section className="card flush">
      <header className="card-h pad"><div><h3>All tools</h3><p className="muted small">Press a condition to change it. Every change is kept in the tool's history.</p></div><Btn size="sm" icon={Plus} onClick={() => open('toolForm')}>Add tool</Btn></header>
      <div className="tablewrap">
        <table className="tbl">
          <thead><tr><th>Tool</th><th className="r">In store</th><th className="r">At sites</th><th>Condition</th></tr></thead>
          <tbody>
            {tools.map((m) => {
              const c = TOOL_CONDITIONS[toolCondition(m)]
              return (
                <tr key={m.id}>
                  <td><button className="linkish" onClick={() => open('material', { id: m.id })}><b>{m.name}</b></button></td>
                  <td className="r num">{fmtNum(bal[m.id] || 0)} <span className="muted small">{m.unit}</span></td>
                  <td className="r num">{fmtNum(atSites(m.id))}</td>
                  <td><button className="condbtn" onClick={() => open('toolCondition', { id: m.id })} title="Change condition"><Pill tone={c.tone} dot>{c.label}</Pill><Pencil size={13} /></button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
    <h3 className="sec-t">Tools out at sites</h3>
    <p className="lead"><Sparkles size={16} /> Worked out automatically: tools sent to a site, minus tools returned. You always know where your scaffolding, ladders and compressors are.</p>
    {sites.length === 0 ? <Empty icon={Hammer} title="No tools out at sites" /> : (
      <div className="sites">
        {sites.map((s) => (
          <section key={s.project} className="card site">
            <header className="card-h"><div className="site-h"><span className="site-ic"><MapPin size={18} /></span><div><h3>{s.project}</h3><p className="muted small">{s.tools.reduce((a, t) => a + t.q, 0)} tools on site</p></div></div>
              <Btn kind="ghost" size="sm" onClick={() => open('entry', { kind: 'return', prefill: { kind: 'return', project: s.project, lines: s.tools.map((t) => ({ materialId: t.id, qty: t.q })) } })}>Record return</Btn></header>
            <ul className="toollist">{s.tools.map((t) => { const m = db.materials.find((x) => x.id === t.id); return <li key={t.id} onClick={() => open('material', { id: t.id })}><Hammer size={15} /><span className="grow">{m.name}</span><b className="num">{fmtNum(t.q)}</b></li> })}</ul>
          </section>
        ))}
      </div>
    )}
  </>
}

export function Kpi({ label, value, sub, tone, onClick }) {
  const C = onClick ? 'button' : 'div'
  return <C className={cx('kpi', tone && 'kpi-' + tone, onClick && 'click')} onClick={onClick}><span className="kpi-l">{label}</span><b className="kpi-v">{value}</b><span className="kpi-s">{sub}</span></C>
}
