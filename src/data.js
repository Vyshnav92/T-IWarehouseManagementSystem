/* ------------------------------------------------------------------
   Data model, sample data and all business rules (pure functions).
   Dates are stored as 'YYYY-MM-DD' strings. Sample dates are generated
   relative to today, so the demo always has live reminders to show.
------------------------------------------------------------------- */

// ---------- dates ----------
const pad = (n) => String(n).padStart(2, '0')
export const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const TODAY = isoOf(new Date())
const parse = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
export const addDays = (iso, n) => { const t = new Date(parse(iso) + n * 86400000); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}` }
export const addMonths = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + n, 1))
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`
}
export const daysUntil = (iso, from = TODAY) => Math.round((parse(iso) - parse(from)) / 86400000)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const fmtDate = (iso) => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}` }
export const fmtShort = (iso) => { const [, m, d] = iso.split('-'); return `${Number(d)} ${MONTHS[Number(m) - 1]}` }
export const relDays = (n) => {
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  if (n < 0) return `${-n} days ago`
  if (n > 60) { const mo = Math.round(n / 30.4); return mo >= 24 ? `in ${Math.round(mo / 12)} years` : `in ${mo} months` }
  return `in ${n} days`
}
export const hijriToday = () => {
  try { return new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()) } catch { return '' }
}

// ---------- numbers ----------
export const fmtNum = (n) => (Math.round(n * 1000) / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 })
export const fmtSAR = (n) => 'SAR ' + Math.round(n).toLocaleString('en-US')
export const fmtSARk = (n) => n >= 1e6 ? `SAR ${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `SAR ${Math.round(n / 1000)}K` : fmtSAR(n)
export const uid = (p = 'id') => p + Math.random().toString(36).slice(2, 9)

// ---------- expiry rules ----------
export const EXPIRY = {
  fahas: { label: 'FAHAS inspection', short: 'FAHAS', ar: 'الفحص الدوري', who: 'vehicle' },
  registration: { label: 'Registration (Istimara)', short: 'Registration', ar: 'الاستمارة', who: 'vehicle' },
  opCard: { label: 'Operation card', short: 'Operation card', ar: 'كرت التشغيل', who: 'vehicle', heavyOnly: true },
  driverCard: { label: 'Driver card', short: 'Driver card', ar: 'بطاقة السائق', who: 'driver' },
  license: { label: 'Driving license', short: 'License', ar: 'رخصة القيادة', who: 'driver' },
}
export const vehicleExpiryKeys = (v) => (v.type === 'heavy' ? ['fahas', 'registration', 'opCard'] : ['fahas', 'registration'])
export const DRIVER_EXPIRY_KEYS = ['driverCard', 'license']

export const DEFAULT_SETTINGS = {
  managerName: 'Manager',
  remindDays: 10,
  depreciation: 15,
  periods: { fahas: 12, registration: 36, opCard: 24, driverCard: 12, license: 60 },
  smartChecks: true,
  showHowTo: true,
  tourDone: false,
}

export function expiryLevel(days, remindDays) {
  if (days < 0) return 'expired'
  if (days <= remindDays) return 'due'
  if (days <= 60) return 'upcoming'
  return 'ok'
}

/** Every tracked expiry across vehicles and drivers, soonest first. */
export function allExpiries(db) {
  const s = db.settings
  const out = []
  db.vehicles.forEach((v) => vehicleExpiryKeys(v).forEach((k) => {
    if (!v[k]) return
    const days = daysUntil(v[k])
    out.push({ id: v.id + k, key: k, entity: 'vehicle', entityId: v.id, title: v.plate, subtitle: `${v.brand} ${v.model}`, date: v[k], days, level: expiryLevel(days, s.remindDays) })
  }))
  db.drivers.forEach((d) => DRIVER_EXPIRY_KEYS.forEach((k) => {
    if (!d[k]) return
    const days = daysUntil(d[k])
    out.push({ id: d.id + k, key: k, entity: 'driver', entityId: d.id, title: d.name, subtitle: d.profession, date: d[k], days, level: expiryLevel(days, s.remindDays) })
  }))
  return out.sort((a, b) => a.days - b.days)
}
/** Reminders the manager must act on now: expired, or inside the reminder window. */
export const activeReminders = (db) => allExpiries(db).filter((e) => e.level === 'expired' || e.level === 'due')
/** Which daily reminder this is (reminders repeat every day until the new date is entered). */
export const reminderNo = (days, remindDays) => remindDays - days + 1

// ---------- vehicles ----------
export function currentValue(v, ratePct) {
  if (!v.purchaseValue || !v.purchaseDate) return 0
  const years = Math.max(0, daysUntil(TODAY, v.purchaseDate) / 365.25)
  return v.purchaseValue * Math.pow(1 - ratePct / 100, years)
}
export const maintSpend = (v, days = 365) => v.maintenance.filter((m) => daysUntil(m.date) >= -days).reduce((a, m) => a + Number(m.amount || 0), 0)
export const CONDITIONS = { good: { label: 'Good', tone: 'ok' }, fair: { label: 'Average', tone: 'warn' }, repair: { label: 'Needs repair', tone: 'bad' } }
export const OWNERSHIP = ['Company owned', 'Rented', 'Leased']
export const VEHICLE_DOCS = [
  { key: 'insurance', label: 'Insurance' },
  { key: 'istimara', label: 'Istimara', reads: 'registration' },
  { key: 'registration', label: 'Registration' },
  { key: 'opCardDoc', label: 'Operation card', reads: 'opCard', heavyOnly: true },
  { key: 'other1', label: 'Other' },
  { key: 'other2', label: 'Other' },
]
export const DRIVER_DOCS = [
  { key: 'licenseDoc', label: 'License', reads: 'license' },
  { key: 'driverCardDoc', label: 'Driver card', reads: 'driverCard' },
  { key: 'other', label: 'Other' },
]

// ---------- warehouse ----------
export const KINDS = {
  purchase: { label: 'Purchase', group: 'in', pre: 'PUR', sign: 1, tone: 'info', verb: 'Bought from' },
  return: { label: 'Return from site', group: 'in', pre: 'RET', sign: 1, tone: 'ok', verb: 'Returned by' },
  issue: { label: 'Stock out to site', group: 'out', pre: 'OUT', sign: -1, tone: 'warn', verb: 'Sent to' },
}
export function balances(db) {
  const b = {}
  db.materials.forEach((m) => { b[m.id] = m.opening })
  db.movements.forEach((mv) => { if (mv.cancelled) return; mv.lines.forEach((l) => { if (b[l.materialId] !== undefined) b[l.materialId] += KINDS[mv.kind].sign * l.qty }) })
  Object.keys(b).forEach((k) => { b[k] = Math.round(b[k] * 1000) / 1000 })
  return b
}
export const stockStatus = (bal, min) => (bal <= 0 ? 'out' : bal <= min ? 'low' : 'ok')
export const STOCK_STATUS = { ok: { label: 'In stock', tone: 'ok' }, low: { label: 'Running low', tone: 'warn' }, out: { label: 'Out of stock', tone: 'bad' } }

/** Average daily usage over the last `days` days, from stock-out entries. */
export function usageRate(db, materialId, days = 30) {
  let q = 0
  db.movements.forEach((mv) => {
    if (mv.cancelled || mv.kind !== 'issue' || daysUntil(mv.date) < -days) return
    mv.lines.forEach((l) => { if (l.materialId === materialId) q += l.qty })
  })
  return q / days
}
/** Smart forecast per material: days until it runs out and a suggested order quantity. */
export function forecast(db, bal) {
  return db.materials.map((m) => {
    const rate = usageRate(db, m.id)
    const b = bal[m.id]
    const runOut = rate > 0 ? Math.max(0, Math.floor(b / rate)) : null
    const suggest = rate > 0 ? Math.max(0, Math.ceil(rate * 30 + m.min - b)) : Math.max(0, Math.ceil(m.min * 2 - b))
    return { m, rate, bal: b, runOut, suggest, status: stockStatus(b, m.min) }
  })
}
export const projectsOf = (db) => db.projects
export function nextNo(db, kind) {
  const n = db.movements.filter((m) => m.kind === kind).length + 1
  return `${KINDS[kind].pre}-${String(n).padStart(4, '0')}`
}
/** Tools currently out at each site = tools sent out minus tools returned. */
export function toolsAtSites(db) {
  const tools = new Set(db.materials.filter((m) => m.category === 'Tools').map((m) => m.id))
  const map = {}
  db.movements.forEach((mv) => {
    if (mv.cancelled || mv.kind === 'purchase' || !mv.project) return
    mv.lines.forEach((l) => {
      if (!tools.has(l.materialId)) return
      map[mv.project] = map[mv.project] || {}
      map[mv.project][l.materialId] = (map[mv.project][l.materialId] || 0) + (mv.kind === 'issue' ? l.qty : -l.qty)
    })
  })
  return Object.entries(map).map(([project, t]) => ({ project, tools: Object.entries(t).filter(([, q]) => q > 0).map(([id, q]) => ({ id, q })) })).filter((r) => r.tools.length)
}

// ---------- sample data ----------
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

const MATERIALS = [
  // name, category, unit, opening, min
  ['1" PVC Bend', 'Electrical', 'NOS', 260, 60], ['1" EMT Box Adapter', 'Electrical', 'NOS', 210, 50], ['10x10 Box Cover', 'Electrical', 'NOS', 320, 80],
  ['1/2" EMT Flexible Adapter', 'Electrical', 'NOS', 760, 150], ['10x10 EMT Deep Box with Cover', 'Electrical', 'NOS', 240, 60], ['5x5 cm Cable Tray', 'Electrical', 'NOS', 40, 12],
  ['10x10 Cable Tray Joint', 'Electrical', 'NOS', 150, 40], ['12 AWG Wire Black', 'Electrical', 'ROLL', 26, 8], ['12 AWG Wire Yellow', 'Electrical', 'ROLL', 22, 8],
  ['Waterproof Double Socket', 'Electrical', 'NOS', 40, 10], ['8 mm Metal Fisher', 'Electrical', 'NOS', 945, 200],
  ['3" CPVC Tee', 'Plumbing', 'NOS', 30, 8], ['4" UPVC Coupling', 'Plumbing', 'NOS', 36, 10], ['32x25 mm PPR Reducer', 'Plumbing', 'NOS', 120, 30],
  ['40 mm PPR Tee', 'Plumbing', 'NOS', 70, 20], ['50 mm PPR End Cap', 'Plumbing', 'NOS', 30, 10], ['110 mm Elbow', 'Plumbing', 'NOS', 24, 8],
  ['12 mm Anchor Bolt 15 cm', 'Hardware', 'NOS', 80, 20], ['16 mm Anchor Bolt 12 cm', 'Hardware', 'NOS', 60, 20], ['6 mm Bolt 8 cm', 'Hardware', 'NOS', 1000, 200],
  ['Cement Bag 50 kg', 'Civil', 'BAG', 180, 40], ['Gypsum Board 12 mm', 'Civil', 'NOS', 140, 30], ['Tile Adhesive', 'Civil', 'BAG', 90, 25],
  ['9 mm MDF', 'Furniture', 'NOS', 50, 12], ['18 mm MDF', 'Furniture', 'NOS', 37, 10], ['18 mm Waterproof MDF', 'Furniture', 'NOS', 30, 10],
  ['CO2 Extinguisher', 'Safety', 'NOS', 10, 4], ['Dry Powder Extinguisher', 'Safety', 'NOS', 24, 6], ['Safety Helmet', 'Safety', 'NOS', 60, 20], ['Safety Vest', 'Safety', 'NOS', 80, 20],
  ['120 cm Scaffolding', 'Tools', 'NOS', 40, 6], ['Scaffolding Platform Big', 'Tools', 'NOS', 12, 3], ['Scaffolding Wheel', 'Tools', 'NOS', 16, 4],
  ['Aluminium Ladder', 'Tools', 'NOS', 8, 2], ['Compressor Big', 'Tools', 'NOS', 3, 1], ['Extension Cable Roll', 'Tools', 'NOS', 10, 3], ['Trolley', 'Tools', 'NOS', 6, 2], ['Shovel', 'Tools', 'NOS', 20, 5],
]
const PROJECTS = ['Wagamama Riyadh', 'Sushi Mod Dammam', 'Whoa Tea Dammam', 'Gymnation Faisaliya', 'Renault Hail', 'Wingstop Ajidan', 'Biryani Abad Riyadh']
const ENGINEERS = ['Abhijith', 'Azeem', 'Firosh', 'Akber']
const VENDORS = ['Dar Al Nama Trading', 'Masdar', 'Al Danube', 'ITCO']

export function sampleDB() {
  const r = rng(20261118)
  const pick = (a) => a[Math.floor(r() * a.length)]
  const materials = MATERIALS.map(([name, category, unit, opening, min], i) => ({ id: 'm' + (i + 1), name, category, unit, opening, min }))
  const bal = Object.fromEntries(materials.map((m) => [m.id, m.opening]))
  const movements = []
  const counters = { purchase: 0, return: 0, issue: 0 }
  const push = (mv) => { counters[mv.kind]++; mv.no = `${KINDS[mv.kind].pre}-${String(counters[mv.kind]).padStart(4, '0')}`; mv.id = uid('mv'); movements.push(mv); mv.lines.forEach((l) => { bal[l.materialId] += KINDS[mv.kind].sign * l.qty }) }
  // busy consumers make the forecast interesting
  const hot = ['m1', 'm3', 'm8', 'm21', 'm22', 'm6', 'm29']
  for (let d = -45; d <= 0; d++) {
    const date = addDays(TODAY, d)
    const nIssues = d === 0 ? 1 : Math.floor(r() * 2.2)
    for (let k = 0; k < nIssues; k++) {
      const lines = []
      const n = 1 + Math.floor(r() * 3)
      for (let j = 0; j < n; j++) {
        const hotId = pick(hot)
        const m = r() < 0.55 ? materials.find((x) => x.id === hotId) : pick(materials)
        if (lines.some((l) => l.materialId === m.id)) continue
        const base = Math.max(1, Math.round(m.opening * (0.03 + r() * 0.06)))
        const qty = Math.min(base, Math.floor(bal[m.id] * 0.5))
        if (qty > 0) lines.push({ materialId: m.id, qty })
      }
      if (lines.length) push({ kind: 'issue', date, reqNo: String(300 + movements.length), reqName: pick(ENGINEERS), project: pick(PROJECTS), engineer: pick(ENGINEERS), mtn: String(1200 + movements.length), lines, attachments: [], cancelled: false })
    }
    if (d % 7 === -3) {
      const lines = []
      for (let j = 0; j < 3; j++) { const m = pick(materials.filter((x) => x.category !== 'Tools')); if (!lines.some((l) => l.materialId === m.id)) lines.push({ materialId: m.id, qty: Math.round(m.opening * (0.2 + r() * 0.3)) }) }
      push({ kind: 'purchase', date, reqNo: String(300 + movements.length), reqName: pick(ENGINEERS), vendor: pick(VENDORS), billNo: 'INV-' + (48000 + Math.floor(r() * 900)), lines, attachments: [], cancelled: false })
    }
    if (d % 9 === -4) {
      const tools = materials.filter((x) => x.category === 'Tools')
      const t = pick(tools)
      push({ kind: 'return', date, project: pick(PROJECTS), engineer: pick(ENGINEERS), mtn: String(1200 + movements.length), lines: [{ materialId: t.id, qty: 1 + Math.floor(r() * 2) }], attachments: [], cancelled: false })
    }
  }
  // tools out at sites
  ;[['Wagamama Riyadh', [['m31', 10], ['m32', 3], ['m33', 4]]], ['Renault Hail', [['m31', 8], ['m35', 1], ['m34', 2]]], ['Gymnation Faisaliya', [['m31', 6], ['m36', 2], ['m38', 4]]]].forEach(([project, ls], i) =>
    push({ kind: 'issue', date: addDays(TODAY, -20 + i * 5), reqNo: String(410 + i), reqName: 'Azeem', project, engineer: pick(ENGINEERS), mtn: String(1400 + i), lines: ls.map(([materialId, qty]) => ({ materialId, qty })), attachments: [], cancelled: false }))
  movements.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  // make a few items visibly low / out for the demo story
  ;['m8', 'm22', 'm6', 'm27'].forEach((id) => { const m = materials.find((x) => x.id === id); m.min = Math.max(m.min, Math.ceil(bal[id] * 1.3) + 2) })
  const m35 = materials.find((x) => x.id === 'm35'); m35.opening -= bal.m35 // compressor: all units are out at sites → zero left

  const sample = (title, rows) => ({ sample: true, name: title.replace(/\s+/g, '_') + '.pdf', title, rows })
  const V = (o) => {
    const v = { id: uid('v'), maintenance: [], docs: {}, ...o }
    v.docs.insurance = sample('Insurance Policy', [['Plate', v.plate], ['Insurer', 'Tawuniya'], ['Policy no.', 'TW-' + Math.floor(100000 + r() * 899999)], ['Valid until', fmtDate(addMonths(TODAY, 5))]])
    v.docs.istimara = sample('Istimara – Vehicle Registration', [['Plate', v.plate], ['Make', `${v.brand} ${v.model}`], ['Year', String(v.year)], ['Owner', 'T&I Construction'], ['Expiry', fmtDate(v.registration)]])
    if (v.type === 'heavy') v.docs.opCardDoc = sample('Operation Card', [['Plate', v.plate], ['Activity', 'Goods transport'], ['Expiry', fmtDate(v.opCard)]])
    return v
  }
  const M = (daysAgo, detail, amount, withDocs = true) => ({ id: uid('mt'), date: addDays(TODAY, -daysAgo), detail, amount, quotation: withDocs ? sample('Quotation', [['Work', detail], ['Amount', fmtSAR(amount)]]) : null, bill: withDocs ? sample('Workshop Bill', [['Work', detail], ['Paid', fmtSAR(amount)]]) : null })

  const vehicles = [
    V({ type: 'car', plate: 'RJA 4821', ownership: 'Company owned', user: 'Mohammed Rafiq', condition: 'good', brand: 'Toyota', model: 'Hilux', year: 2022, purchaseValue: 112000, purchaseDate: addMonths(TODAY, -34), location: 'Dammam HQ', fahas: addDays(TODAY, 4), registration: addMonths(TODAY, 14), maintenance: [M(40, 'Oil change & filters', 380), M(150, 'Front brake pads', 920)] }),
    V({ type: 'car', plate: 'KSD 7310', ownership: 'Company owned', user: 'Abhijith (Site Eng.)', condition: 'good', brand: 'Hyundai', model: 'Accent', year: 2023, purchaseValue: 68000, purchaseDate: addMonths(TODAY, -22), location: 'Riyadh – Wagamama site', fahas: addMonths(TODAY, 7), registration: addDays(TODAY, -3), maintenance: [M(60, 'Periodic service 20,000 km', 650)] }),
    V({ type: 'car', plate: 'NBA 2294', ownership: 'Rented', user: 'Azeem (Site Eng.)', condition: 'fair', brand: 'Toyota', model: 'Corolla', year: 2021, purchaseValue: 78000, purchaseDate: addMonths(TODAY, -46), location: 'Hail – Renault site', fahas: addMonths(TODAY, 3), registration: addMonths(TODAY, 20), maintenance: [M(25, 'AC compressor repair', 1850), M(200, 'Tyres x4', 1600)] }),
    V({ type: 'car', plate: 'LMR 5508', ownership: 'Company owned', user: 'Suresh Kumar', condition: 'repair', brand: 'Nissan', model: 'Sunny', year: 2017, purchaseValue: 58000, purchaseDate: addMonths(TODAY, -100), location: 'Al Khobar workshop', fahas: addDays(TODAY, 9), registration: addMonths(TODAY, 9), maintenance: [M(12, 'Gearbox overhaul', 4800), M(70, 'Radiator replacement', 1350), M(130, 'Suspension bushes', 1100), M(240, 'Starter motor', 900)] }),
    V({ type: 'car', plate: 'HTD 1187', ownership: 'Company owned', user: 'Firosh (Site Eng.)', condition: 'good', brand: 'Isuzu', model: 'D-Max', year: 2024, purchaseValue: 98000, purchaseDate: addMonths(TODAY, -10), location: 'Dammam – Sushi Mod site', fahas: addMonths(TODAY, 11), registration: addMonths(TODAY, 30), maintenance: [] }),
    V({ type: 'car', plate: 'ZXA 9042', ownership: 'Leased', user: 'Project Manager', condition: 'good', brand: 'Toyota', model: 'Land Cruiser', year: 2023, purchaseValue: 285000, purchaseDate: addMonths(TODAY, -18), location: 'Dammam HQ', fahas: addMonths(TODAY, 5), registration: addMonths(TODAY, 18), maintenance: [M(90, 'Periodic service', 1200)] }),
    V({ type: 'car', plate: 'BGT 3376', ownership: 'Company owned', user: 'Imran Ali', condition: 'fair', brand: 'Hyundai', model: 'H1 Van', year: 2020, purchaseValue: 105000, purchaseDate: addMonths(TODAY, -58), location: 'Riyadh yard', fahas: addDays(TODAY, 32), registration: addDays(TODAY, 6), maintenance: [M(33, 'Battery replacement', 520)] }),
    V({ type: 'heavy', plate: 'TRK 6650', ownership: 'Company owned', user: 'Abdul Rahman Khan', condition: 'good', brand: 'Isuzu', model: 'NPR Truck', year: 2021, purchaseValue: 165000, purchaseDate: addMonths(TODAY, -44), location: 'Dammam warehouse', fahas: addMonths(TODAY, 6), registration: addMonths(TODAY, 15), opCard: addDays(TODAY, 2), maintenance: [M(20, 'Clutch plate', 2400), M(110, 'Service + hydraulic oil', 1450)] }),
    V({ type: 'heavy', plate: 'TRK 4418', ownership: 'Company owned', user: 'Shahid Mahmood', condition: 'fair', brand: 'Mitsubishi', model: 'Fuso Canter', year: 2019, purchaseValue: 142000, purchaseDate: addMonths(TODAY, -70), location: 'Riyadh yard', fahas: addDays(TODAY, -1), registration: addMonths(TODAY, 8), opCard: addMonths(TODAY, 13), maintenance: [M(45, 'Brake drums', 2100)] }),
    V({ type: 'heavy', plate: 'BUS 2201', ownership: 'Rented', user: 'Faisal Al-Harbi', condition: 'good', brand: 'Toyota', model: 'Coaster Bus', year: 2022, purchaseValue: 240000, purchaseDate: addMonths(TODAY, -30), location: 'Labour camp – Dammam', fahas: addMonths(TODAY, 4), registration: addMonths(TODAY, 26), opCard: addMonths(TODAY, 2), maintenance: [M(80, 'AC service', 900)] }),
    V({ type: 'heavy', plate: 'EQP 0912', ownership: 'Company owned', user: 'Ramesh Pillai', condition: 'good', brand: 'JCB', model: '3CX Backhoe', year: 2020, purchaseValue: 360000, purchaseDate: addMonths(TODAY, -60), location: 'Hail – Renault site', fahas: addMonths(TODAY, 9), registration: addMonths(TODAY, 11), opCard: addDays(TODAY, 8), maintenance: [M(15, 'Hydraulic hose replacement', 1750)] }),
  ]
  const D = (o) => {
    const d = { id: uid('d'), docs: {}, ...o }
    d.docs.licenseDoc = sample('Driving License', [['Name', d.name], ['License no.', d.licenseNo], ['Expiry', fmtDate(d.license)]])
    d.docs.driverCardDoc = sample('Driver Card', [['Name', d.name], ['Card type', d.profession], ['Expiry', fmtDate(d.driverCard)]])
    return d
  }
  const drivers = [
    D({ name: 'Mohammed Rafiq', licenseNo: '2398 4410 76', license: addMonths(TODAY, 30), driverCard: addMonths(TODAY, 6), profession: 'Light Driver', phone: '+966 55 410 2231' }),
    D({ name: 'Abdul Rahman Khan', licenseNo: '2471 0938 12', license: addMonths(TODAY, 18), driverCard: addDays(TODAY, 5), profession: 'Heavy Driver', phone: '+966 50 778 1902' }),
    D({ name: 'Suresh Kumar', licenseNo: '2310 7722 45', license: addMonths(TODAY, 40), driverCard: addMonths(TODAY, 9), profession: 'Light Driver', phone: '+966 56 213 9087' }),
    D({ name: 'Imran Ali', licenseNo: '2455 1209 88', license: addDays(TODAY, 21), driverCard: addMonths(TODAY, 4), profession: 'Light Driver', phone: '+966 54 902 1176' }),
    D({ name: 'Shahid Mahmood', licenseNo: '2380 5561 03', license: addMonths(TODAY, 22), driverCard: addDays(TODAY, -6), profession: 'Heavy Driver', phone: '+966 53 118 4420' }),
    D({ name: 'Faisal Al-Harbi', licenseNo: '1092 3348 61', license: addMonths(TODAY, 50), driverCard: addMonths(TODAY, 11), profession: 'Bus Driver', phone: '+966 55 671 0034' }),
    D({ name: 'Ramesh Pillai', licenseNo: '2299 8815 27', license: addMonths(TODAY, 14), driverCard: addMonths(TODAY, 2), profession: 'Equipment Operator', phone: '+966 59 330 7781' }),
    D({ name: 'Joseph Thomas', licenseNo: '2501 4476 39', license: addMonths(TODAY, 36), driverCard: addMonths(TODAY, 7), profession: 'Light Driver', phone: '+966 58 245 6610' }),
  ]

  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, periods: { ...DEFAULT_SETTINGS.periods } },
    materials, movements, projects: PROJECTS, engineers: ENGINEERS, vendors: VENDORS,
    vehicles, drivers,
    activity: [
      { id: uid('a'), at: new Date().toISOString(), text: 'Demo data loaded — 38 materials, 11 vehicles, 8 drivers', icon: 'spark' },
    ],
  }
}
