import { useMemo, useState } from 'react'
import { Car, Truck, Plus, Search, FolderOpen, Wrench, Users, FileText, Phone } from 'lucide-react'
import { useApp } from '../store'
import { CONDITIONS, currentValue, fmtSAR, fmtSARk, vehicleExpiryKeys, daysUntil, DRIVER_EXPIRY_KEYS, maintSpend } from '../data'
import { PageHeader, Tabs, Btn, Pill, ExpiryCell, Empty, cx } from '../ui'
import { Kpi } from './Warehouse'

export function Vehicles() {
  const { db, route, go, open } = useApp()
  const tab = route.tab || 'cars'
  const type = tab === 'heavy' ? 'heavy' : 'car'
  const s = db.settings
  const [q, setQ] = useState('')
  const all = db.vehicles
  const list = all.filter((v) => v.type === type && (v.plate + ' ' + v.brand + ' ' + v.model + ' ' + v.user + ' ' + v.location).toLowerCase().includes(q.toLowerCase()))
  const dueOf = (v) => vehicleExpiryKeys(v).filter((k) => daysUntil(v[k]) <= s.remindDays).length
  const value = useMemo(() => all.reduce((a, v) => a + currentValue(v, s.depreciation), 0), [all, s.depreciation])
  const due = all.filter((v) => dueOf(v) > 0).length
  return (
    <div className="page">
      <PageHeader title="Vehicles" ar="المركبات" desc="All company cars and heavy vehicles, with their documents, maintenance and value. Expiry dates turn amber 10 days before and red once expired."
        how={['Each row is one vehicle. Coloured labels show how many days are left on FAHAS, registration and (for heavy vehicles) the operation card.', 'Press Documents to keep the Istimara, insurance and other papers. Press Maintenance to log workshop visits with quotation and bill.', `When something expires you get a reminder every day, starting ${s.remindDays} days before, until you enter the new date.`, `Current value is worked out for you: ${s.depreciation}% less every year.`]}
        actions={<Btn icon={Plus} onClick={() => open('vehicleForm', { type })}>Add {type === 'heavy' ? 'heavy vehicle' : 'car'}</Btn>} />
      <div className="kpis">
        <Kpi label="Vehicles" value={all.length} sub={`${all.filter((v) => v.type === 'car').length} cars · ${all.filter((v) => v.type === 'heavy').length} heavy`} />
        <Kpi label="Need renewing" value={due} sub={`within ${s.remindDays} days or expired`} tone={due ? 'warn' : ''} onClick={() => go('reminders')} />
        <Kpi label="Need repair" value={all.filter((v) => v.condition === 'repair').length} sub="marked by you" tone={all.some((v) => v.condition === 'repair') ? 'bad' : ''} />
        <Kpi label="Fleet value today" value={fmtSARk(value)} sub={`after ${s.depreciation}% yearly depreciation`} />
      </div>
      <Tabs value={tab} onChange={(t) => go('vehicles', t === 'cars' ? null : t)} tabs={[
        { id: 'cars', label: 'Cars', icon: Car, count: all.filter((v) => v.type === 'car').length },
        { id: 'heavy', label: 'Heavy vehicles', icon: Truck, count: all.filter((v) => v.type === 'heavy').length },
      ]} />
      <section className="card flush">
        <div className="toolbar">
          <div className="search sm"><Search size={16} className="search-ic" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Plate, brand, user or location…" /></div>
          <span className="grow" />
          {type === 'heavy' && <span className="muted small">Heavy vehicles also need an <b>operation card</b></span>}
        </div>
        <div className="tablewrap">
          <table className="tbl vtbl">
            <thead><tr>
              <th>#</th><th>Plate no.</th><th>Vehicle</th><th>Ownership</th><th>User</th><th>Condition</th>
              <th>FAHAS</th><th>Registration</th>{type === 'heavy' && <th>Operation card</th>}
              <th>Location</th><th className="r">Value now</th><th />
            </tr></thead>
            <tbody>
              {list.map((v, i) => (
                <tr key={v.id} className={cx('click', dueOf(v) && 'rowflag')} onClick={() => open('vehicle', { id: v.id })}>
                  <td className="muted">{i + 1}</td>
                  <td><span className="plate">{v.plate}</span></td>
                  <td><b>{v.brand} {v.model}</b><small className="muted block">{v.year}</small></td>
                  <td className="small">{v.ownership}</td>
                  <td className="small">{v.user}</td>
                  <td><Pill tone={CONDITIONS[v.condition].tone}>{CONDITIONS[v.condition].label}</Pill></td>
                  <td><ExpiryCell date={v.fahas} remindDays={s.remindDays} /></td>
                  <td><ExpiryCell date={v.registration} remindDays={s.remindDays} /></td>
                  {type === 'heavy' && <td><ExpiryCell date={v.opCard} remindDays={s.remindDays} /></td>}
                  <td className="small">{v.location}</td>
                  <td className="r num"><b>{fmtSAR(currentValue(v, s.depreciation))}</b><small className="muted block">of {fmtSARk(v.purchaseValue)}</small></td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="rowbtns">
                      <button className="mini" onClick={() => open('vehicle', { id: v.id, tab: 'documents' })} title="Documents"><FolderOpen size={15} /> Docs</button>
                      <button className="mini" onClick={() => open('maint', { vehicleId: v.id })} title="Add maintenance"><Wrench size={15} /> {fmtSARk(maintSpend(v))}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.length && <Empty icon={Car} title="No vehicles here" text="Add your first one with the button above." />}
        </div>
      </section>
    </div>
  )
}

export function Drivers() {
  const { db, open } = useApp()
  const s = db.settings
  const [q, setQ] = useState('')
  const list = db.drivers.filter((d) => (d.name + ' ' + d.profession + ' ' + d.licenseNo).toLowerCase().includes(q.toLowerCase()))
  const due = db.drivers.filter((d) => DRIVER_EXPIRY_KEYS.some((k) => daysUntil(d[k]) <= s.remindDays)).length
  return (
    <div className="page">
      <PageHeader title="Drivers" ar="السائقون" desc="Everyone who drives a company vehicle, with their license, driver card and documents in one place."
        how={['Driver cards are renewed every year. You get a reminder before they expire, every day, until the new date is entered.', 'Press a driver to see their documents, upload a new license or card, and see which vehicle they use.', 'Upload a photo of a renewed card and the assistant reads the new expiry date for you.']}
        actions={<Btn icon={Plus} onClick={() => open('driverForm')}>Add driver</Btn>} />
      <div className="kpis">
        <Kpi label="Drivers" value={db.drivers.length} sub="on record" />
        <Kpi label="Need renewing" value={due} sub={`card or license, ${s.remindDays} days or less`} tone={due ? 'warn' : ''} />
        <Kpi label="Heavy / bus drivers" value={db.drivers.filter((d) => /heavy|bus|operator/i.test(d.profession)).length} sub="need a professional license" />
        <Kpi label="Without a vehicle" value={db.drivers.filter((d) => !db.vehicles.some((v) => v.user === d.name)).length} sub="available" />
      </div>
      <section className="card flush">
        <div className="toolbar"><div className="search sm"><Search size={16} className="search-ic" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, profession or license no…" /></div></div>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>#</th><th>Name</th><th>License no.</th><th>Driver card expiry</th><th>License expiry</th><th>Profession</th><th className="hide-sm">Vehicle</th><th>Documents</th></tr></thead>
            <tbody>
              {list.map((d, i) => {
                const car = db.vehicles.find((v) => v.user === d.name)
                const docs = ['licenseDoc', 'driverCardDoc', 'other'].filter((k) => d.docs[k]).length
                return (
                  <tr key={d.id} className={cx('click', DRIVER_EXPIRY_KEYS.some((k) => daysUntil(d[k]) <= s.remindDays) && 'rowflag')} onClick={() => open('driver', { id: d.id })}>
                    <td className="muted">{i + 1}</td>
                    <td><div className="who"><span className="who-av">{d.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span><span><b>{d.name}</b><small className="muted block"><Phone size={11} /> {d.phone}</small></span></div></td>
                    <td className="mono small">{d.licenseNo}</td>
                    <td><ExpiryCell date={d.driverCard} remindDays={s.remindDays} /></td>
                    <td><ExpiryCell date={d.license} remindDays={s.remindDays} /></td>
                    <td className="small">{d.profession}</td>
                    <td className="hide-sm">{car ? <span className="plate sm">{car.plate}</span> : <span className="muted small">—</span>}</td>
                    <td><span className="docdots">{[0, 1, 2].map((n) => <i key={n} className={n < docs ? 'on' : ''} />)}<small>{docs}/3</small></span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!list.length && <Empty icon={Users} title="No drivers match" />}
        </div>
      </section>
    </div>
  )
}
