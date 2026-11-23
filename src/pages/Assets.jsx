import { useMemo, useState } from 'react'
import { Search, FileSpreadsheet, FileDown, BarChart3, Wrench, Building2, Truck, ChevronUp, ChevronDown, Landmark } from 'lucide-react'
import { useApp } from '../store'
import { assetRows, assetTotals, ASSET_TYPES, TOOL_CONDITIONS, CONDITIONS, fmtDate, fmtSAR, TODAY, rateOf } from '../data'
import { PageHeader, Btn, Pill, Empty, cx } from '../ui'
import { exportExcel, exportPdf } from '../exporter'
import { Kpi } from './Warehouse'

const COLS = [
  ['type', 'Asset type'], ['assetId', 'Asset ID'], ['name', 'Name'], ['category', 'Category'], ['location', 'Location / held by'],
  ['conditionLabel', 'Condition'], ['purchaseDate', 'Date of purchase'], ['cost', 'Purchase value', 'r'], ['dep', 'Depreciation', 'r'], ['current', 'Current value', 'r'],
]
const TYPE_TONE = { handTool: 'info', officeAsset: 'plain', vehicle: 'ok' }

export default function Assets() {
  const { db, go, open, toast } = useApp()
  const all = useMemo(() => assetRows(db), [db])
  const [q, setQ] = useState('')
  const [type, setType] = useState('all')
  const [cat, setCat] = useState('all')
  const [cond, setCond] = useState('all')
  const [place, setPlace] = useState('all')
  const [showOut, setShowOut] = useState(false)
  const [sort, setSort] = useState({ key: 'current', dir: -1 })
  const cats = [...new Set(all.filter((r) => type === 'all' || r.type === type).map((r) => r.category))].sort()
  const places = [...new Set(all.map((r) => r.place))].sort()
  const conds = [...new Map(all.map((r) => [r.condition, r.conditionLabel])).entries()].filter(([k]) => k)

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = all.filter((r) => (showOut || !r.excluded) && (type === 'all' || r.type === type) && (cat === 'all' || r.category === cat) && (cond === 'all' || r.condition === cond) && (place === 'all' || r.place === place)
      && (!s || [r.assetId, r.name, r.category, r.location, ASSET_TYPES[r.type].label].join(' ').toLowerCase().includes(s)))
    const val = (r) => (sort.key === 'type' ? ASSET_TYPES[r.type].label : r[sort.key])
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b)
      if (x == null || x === '') return 1 // missing values always last
      if (y == null || y === '') return -1
      return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort.dir
    })
  }, [all, q, type, cat, cond, place, showOut, sort])
  const tot = assetTotals(rows).total

  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: ['cost', 'dep', 'current', 'purchaseDate'].includes(key) ? -1 : 1 }))
  const addFrom = (page, tab, overlay, props = {}) => { go(page, tab); open(overlay, { ...props, from: 'assets' }) }
  const exp = async (kind) => {
    const section = {
      columns: COLS.map(([, l], i) => (i >= 7 ? l + ' (SAR)' : l)),
      rows: rows.map((r) => [ASSET_TYPES[r.type].label, r.assetId, r.name, r.category, r.location, r.conditionLabel + (r.excluded ? ' (left out of totals)' : ''), fmtDate(r.purchaseDate), ...(r.missing ? ['Value missing', 'Value missing', 'Value missing'] : [Math.round(r.cost), Math.round(r.dep), Math.round(r.current)])]),
      totalRow: ['', '', '', '', '', '', 'Total', Math.round(tot.cost), Math.round(tot.dep), Math.round(tot.current)],
      note: tot.missing ? `${tot.missing} asset${tot.missing > 1 ? 's have' : ' has'} no value and ${tot.missing > 1 ? 'are' : 'is'} not included in the total.` : undefined,
    }
    const opts = { title: 'Total assets', sub: `As of ${fmtDate(TODAY)} · ${rows.length} assets`, sections: [section], fname: `TI_Total_assets_${TODAY}` }
    try { await (kind === 'xlsx' ? exportExcel(opts) : exportPdf(opts)); toast(kind === 'xlsx' ? 'Excel file downloaded' : 'PDF downloaded') } catch { toast('The download failed. Please try again.', 'bad') }
  }

  return (
    <div className="page">
      <PageHeader title="Total assets" ar="إجمالي الأصول" desc="Everything the company owns in one list: hand tools, office assets and vehicles, with what each is worth today."
        how={['This list reads straight from Hand tools, Vehicles and office assets. Change something there and it shows here at once.', 'Use the Add buttons to add an asset. Each one opens the form in its own section.', 'Current value is the purchase value minus depreciation. Change the rates in Settings.', 'Press Report for the total value by asset type, ready for Excel, PDF or printing.']}
        actions={<Btn icon={BarChart3} onClick={() => open('assetReport')}>Report</Btn>} />
      <div className="addbar">
        <Btn kind="ghost" icon={Wrench} onClick={() => addFrom('handtools', null, 'handToolForm')}>Add hand tool</Btn>
        <Btn kind="ghost" icon={Building2} onClick={() => open('officeAssetForm')}>Add office asset</Btn>
        <Btn kind="ghost" icon={Truck} onClick={() => addFrom('vehicles', null, 'vehicleForm', { type: 'car' })}>Add vehicle</Btn>
      </div>
      <div className="kpis">
        <Kpi label="Assets counted" value={tot.count} sub={tot.missing ? `${tot.missing} with no value` : 'all have a value'} tone={tot.missing ? 'warn' : ''} />
        <Kpi label="Purchase value" value={fmtSAR(tot.cost)} sub="what they cost" />
        <Kpi label="Depreciation" value={fmtSAR(tot.dep)} sub="value lost so far" />
        <Kpi label="Current value" value={fmtSAR(tot.current)} sub="worth today" />
      </div>
      <section className="card flush">
        <div className="toolbar">
          <div className="search sm"><Search size={16} className="search-ic" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID, name, location…" aria-label="Search assets" /></div>
          <div className="chips">{[['all', 'All'], ...Object.entries(ASSET_TYPES).map(([k, a]) => [k, a.plural])].map(([k, l]) => <button key={k} className={cx('chip', type === k && 'on')} onClick={() => { setType(k); setCat('all') }}>{l} <em className="muted">{k === 'all' ? all.filter((r) => showOut || !r.excluded).length : all.filter((r) => r.type === k && (showOut || !r.excluded)).length}</em></button>)}</div>
          <select className="sel" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="all">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
          <select className="sel" value={cond} onChange={(e) => setCond(e.target.value)} aria-label="Condition"><option value="all">All conditions</option>{conds.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select className="sel" value={place} onChange={(e) => setPlace(e.target.value)} aria-label="Location"><option value="all">All locations</option>{places.map((p) => <option key={p}>{p}</option>)}</select>
          <label className="row-gap small"><input type="checkbox" checked={showOut} onChange={(e) => setShowOut(e.target.checked)} /> Show lost, scrapped and deactivated</label>
          <span className="grow" />
          <Btn kind="excel" size="sm" icon={FileSpreadsheet} disabled={!rows.length} onClick={() => exp('xlsx')}>Excel</Btn>
          <Btn kind="dark" size="sm" icon={FileDown} disabled={!rows.length} onClick={() => exp('pdf')}>PDF</Btn>
        </div>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr>{COLS.map(([k, l, cls]) => (
              <th key={k} className={cx(cls, 'sortable')} aria-sort={sort.key === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                <button className="sortbtn" onClick={() => toggleSort(k)}>{l}{sort.key === k && (sort.dir > 0 ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}</button>
              </th>
            ))}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className={cx('click', r.excluded && 'struck')} onClick={() => open(r.open[0], r.open[1])}>
                  <td><Pill tone={TYPE_TONE[r.type]}>{ASSET_TYPES[r.type].label}</Pill></td>
                  <td className="mono nowrap">{r.assetId}</td>
                  <td><b>{r.name}</b>{r.qty > 1 && <span className="muted small"> × {r.qty}</span>}</td>
                  <td className="muted">{r.category}</td>
                  <td className="small">{r.location}</td>
                  <td>{r.excluded ? <Pill>{r.conditionLabel || 'Deactivated'}</Pill> : <Pill tone={(TOOL_CONDITIONS[r.condition] || CONDITIONS[r.condition])?.tone}>{r.conditionLabel}</Pill>}</td>
                  <td className="num nowrap">{fmtDate(r.purchaseDate)}</td>
                  {r.missing ? <td colSpan={3} className="r"><Pill tone="warn">Value missing</Pill></td> : <>
                    <td className="r num nowrap">{fmtSAR(r.cost)}</td>
                    <td className="r num nowrap muted">{fmtSAR(r.dep)}</td>
                    <td className="r num nowrap"><b>{fmtSAR(r.current)}</b></td>
                  </>}
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && <tfoot><tr><td colSpan={7}><b>Total</b> <span className="muted small">{tot.count} assets{tot.missing ? ` · ${tot.missing} with no value not included` : ''}{showOut ? ' · lost, scrapped and deactivated left out' : ''}</span></td><td className="r num"><b>{fmtSAR(tot.cost)}</b></td><td className="r num"><b>{fmtSAR(tot.dep)}</b></td><td className="r num"><b>{fmtSAR(tot.current)}</b></td></tr></tfoot>}
          </table>
          {!rows.length && <Empty icon={Landmark} title="No assets match" text="Try a different word or filter." />}
        </div>
      </section>
      <p className="muted small">Depreciation per year: Vehicles {rateOf(db.settings, 'vehicles')}% · Hand tools {rateOf(db.settings, 'handTools')}% · Office assets {rateOf(db.settings, 'officeAssets')}%. <button className="linkish" onClick={() => go('settings')}>Change in Settings</button></p>
    </div>
  )
}
