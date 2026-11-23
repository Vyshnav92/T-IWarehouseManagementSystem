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
export const fmt2 = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const round2 = (n) => Math.round(n * 100) / 100
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
  depRates: { handTools: 20, officeAssets: 20 },
  lowStock: 15, // a material below this is Running low
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
export const lowLimit = (db) => db.settings.lowStock ?? 15
export const stockStatus = (bal, limit) => (bal <= 0 ? 'out' : bal < limit ? 'low' : 'ok')
/** Tools were moved out of the Warehouse (R4). Their items stay in db.materials so old entries still show them. */
export const isTool = (m) => m.category === 'Tools'
export const stockMaterials = (db) => db.materials.filter((m) => !isTool(m) && m.active !== false) // deactivated materials keep their history
/** Same name ignoring capitals, extra spaces and punctuation. */
export const normName = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
/** Current unit cost: weighted average of the material's purchase prices (and opening stock, when it has an opening cost). null when nothing has a price. */
export function unitCost(db, materialId) {
  const m = db.materials.find((x) => x.id === materialId)
  let q = 0, v = 0
  if (m?.openingCost != null && m.opening > 0) { q = m.opening; v = m.opening * m.openingCost }
  db.movements.forEach((mv) => { if (!mv.cancelled && mv.kind === 'purchase') mv.lines.forEach((l) => { if (l.materialId === materialId && l.unitPrice != null) { q += l.qty; v += l.qty * l.unitPrice } }) })
  return q ? round2(v / q) : null
}
/** A return is valued at the cost of the last stock out of that material to the same site, otherwise at the current unit cost. */
export function returnCost(db, project, materialId) {
  const line = db.movements.filter((mv) => !mv.cancelled && mv.kind === 'issue' && mv.project === project).flatMap((mv) => mv.lines).filter((l) => l.materialId === materialId && l.unitCost != null).pop()
  return line ? line.unitCost : unitCost(db, materialId)
}
/** Total stock value (R5): every purchase line value added together. Returns and stock outs don't change it; tools and lines without a price are left out. */
export function stockValue(db) {
  const ps = db.movements.filter((mv) => !mv.cancelled && mv.kind === 'purchase')
  const tool = new Set(db.materials.filter(isTool).map((m) => m.id))
  const lines = (mv) => mv.lines.filter((l) => !tool.has(l.materialId))
  return {
    count: ps.length,
    unpriced: ps.filter((mv) => lines(mv).some((l) => l.unitPrice == null)).length,
    total: round2(ps.reduce((a, mv) => a + lines(mv).reduce((b, l) => b + (l.unitPrice == null ? 0 : round2(l.qty * l.unitPrice)), 0), 0)),
  }
}
/** Value of a stock out from the unit cost saved on each line when it was made. Lines without a cost are counted in `missing`. */
export function issueValue(mv) {
  const priced = mv.lines.filter((l) => l.unitCost != null)
  return { total: round2(priced.reduce((a, l) => a + round2(l.qty * l.unitCost), 0)), missing: mv.lines.length - priced.length }
}
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
  const limit = lowLimit(db)
  return stockMaterials(db).map((m) => {
    const rate = usageRate(db, m.id)
    const b = bal[m.id]
    const runOut = rate > 0 ? Math.max(0, Math.floor(b / rate)) : null
    const suggest = rate > 0 ? Math.max(0, Math.ceil(rate * 30 + limit - b)) : Math.max(0, Math.ceil(limit * 2 - b))
    return { m, rate, bal: b, runOut, suggest, status: stockStatus(b, limit) }
  })
}
/** Low stock reminders: one per material below the limit, worked out live so it clears once stock is back. */
export const lowStock = (db) => forecast(db, balances(db)).filter((f) => f.status !== 'ok')
export const projectsOf = (db) => db.projects
export function nextNo(db, kind) {
  const n = db.movements.filter((m) => m.kind === kind).length + 1
  return `${KINDS[kind].pre}-${String(n).padStart(4, '0')}`
}
/** Physical state of a tool. Tools without a condition yet count as Good. */
export const TOOL_CONDITIONS = {
  new: { label: 'New', tone: 'info' },
  good: { label: 'Good', tone: 'ok' },
  fair: { label: 'Fair', tone: 'warn' },
  repair: { label: 'Needs repair', tone: 'bad' },
  damaged: { label: 'Damaged', tone: 'bad' },
  lost: { label: 'Lost', tone: 'plain' },
  scrapped: { label: 'Scrapped', tone: 'plain' },
}

// ---------- depreciation (all asset types) ----------
/** Asset types that have a depreciation rate in Settings. Vehicles keep their original setting (settings.depreciation). */
export const DEP_TYPES = {
  vehicles: { label: 'Vehicles', sub: 'Cars and heavy vehicles' },
  handTools: { label: 'Hand tools', sub: 'Tools held by staff' },
  officeAssets: { label: 'Office assets', sub: 'Furniture, computers, equipment' },
}
export const DEFAULT_DEP_RATES = { handTools: 20, officeAssets: 20 }
export const rateOf = (s, type) => (type === 'vehicles' ? s.depreciation : (s.depRates?.[type] ?? DEFAULT_DEP_RATES[type]))
const blank = (x) => x === undefined || x === null || x === ''
/**
 * Same method as vehicles (currentValue): the value drops by a yearly percentage, counted from the date of purchase.
 * It never goes below zero. Returns null when the purchase value or date is missing ("Value missing").
 */
export function depreciate(cost, purchaseDate, ratePct, asOf = TODAY) {
  if (blank(cost) || !purchaseDate || isNaN(Number(cost))) return null
  const c = Number(cost)
  const years = Math.max(0, daysUntil(asOf, purchaseDate) / 365.25)
  const current = Math.max(0, c * Math.pow(1 - ratePct / 100, years))
  return { cost: c, current, dep: c - current, pct: c > 0 ? ((c - current) / c) * 100 : 0 }
}
export const fmtPct = (n) => `${(Math.round(n * 10) / 10).toLocaleString('en-US')}%`

// ---------- hand tools (held by staff) ----------
export const HAND_TOOL_CATEGORIES = ['Power tools', 'Hand tools', 'Measuring', 'Electrical testing', 'Safety equipment']
export const ALLOC_STATUS = {
  with: { label: 'With employee', tone: 'info' },
  returned: { label: 'Returned', tone: 'ok' },
  handed: { label: 'Handed over', tone: 'plain' },
}
export const allocStatus = (a) => (a.returnDate ? 'returned' : a.handoverTo ? 'handed' : 'with')
/** Quantity of a catalog tool currently with employees (optionally ignoring one allocation, when editing it). */
export const qtyWithStaff = (db, toolRef, exceptId) => (db.allocations || []).filter((a) => a.toolRef === toolRef && a.id !== exceptId && allocStatus(a) === 'with').reduce((s, a) => s + Number(a.qty || 0), 0)
export const qtyAvailable = (db, t, exceptId) => Number(t.qty || 0) - qtyWithStaff(db, t.id, exceptId)
/** Next free code such as HT-0001 or OA-0001. */
export function nextCode(list, key, prefix) {
  const used = new Set(list.map((x) => String(x[key]).toUpperCase()))
  let n = list.length + 1
  while (used.has(`${prefix}-${String(n).padStart(4, '0')}`)) n++
  return `${prefix}-${String(n).padStart(4, '0')}`
}
/** Every employee ID seen in allocations, with the latest name and designation used for it. */
export function knownEmployees(db) {
  const m = {}
  ;(db.allocations || []).forEach((a) => { if (a.empId) m[a.empId.trim().toUpperCase()] = { empId: a.empId.trim(), empName: a.empName, designation: a.designation } })
  return m
}

// ---------- office assets (basic version) ----------
export const OFFICE_CATEGORIES = ['Furniture', 'Computer', 'Equipment', 'Phone', 'Other']

// ---------- total assets (one combined list, read live from each section) ----------
export const ASSET_TYPES = {
  handTool: { label: 'Hand tool', plural: 'Hand tools', rate: 'handTools' },
  officeAsset: { label: 'Office asset', plural: 'Office assets', rate: 'officeAssets' },
  vehicle: { label: 'Vehicle', plural: 'Vehicles', rate: 'vehicles' },
}
const OUT_CONDITIONS = ['lost', 'scrapped', 'sold']
/** One row per asset. Nothing is copied: every row is worked out from the section that owns it. */
export function assetRows(db, asOf = TODAY) {
  const s = db.settings
  const rows = []
  const add = (r) => {
    if (r.purchaseDate && r.purchaseDate > asOf) return // bought after the report date
    const v = depreciate(r.cost, r.purchaseDate, rateOf(s, ASSET_TYPES[r.type].rate), asOf)
    rows.push({ ...r, missing: !v, dep: v ? v.dep : null, current: v ? v.current : null, cost: v ? v.cost : null, excluded: !!r.inactive || OUT_CONDITIONS.includes(r.condition) })
  }
  ;(db.handTools || []).forEach((t) => {
    const holders = (db.allocations || []).filter((a) => a.toolRef === t.id && allocStatus(a) === 'with')
    const out = holders.reduce((a, h) => a + Number(h.qty || 0), 0)
    const inOffice = Number(t.qty || 0) - out
    const loc = [holders.length ? `With ${[...new Set(holders.map((h) => h.empName))].join(', ')}` : '', inOffice > 0 ? `${inOffice} in office` : ''].filter(Boolean).join(' · ')
    add({ key: 'ht' + t.id, type: 'handTool', assetId: t.toolId, name: t.name, category: t.category, location: loc || 'Office', place: holders.length ? 'With staff' : 'Office', qty: Number(t.qty || 0), condition: t.condition, conditionLabel: TOOL_CONDITIONS[t.condition]?.label || t.condition, purchaseDate: t.purchaseDate, cost: blank(t.unitValue) ? null : Number(t.unitValue) * Number(t.qty || 0), inactive: t.active === false, open: ['handTool', { id: t.id }] })
  })
  ;(db.officeAssets || []).forEach((o) => add({ key: 'oa' + o.id, type: 'officeAsset', assetId: o.assetId, name: o.name, category: o.category || 'Other', location: o.location || '—', place: (o.location || 'Office').split('·')[0].trim(), qty: 1, condition: o.condition, conditionLabel: TOOL_CONDITIONS[o.condition]?.label || o.condition || '—', purchaseDate: o.purchaseDate || null, cost: blank(o.purchaseValue) ? null : Number(o.purchaseValue), inactive: o.active === false, open: ['officeAssetForm', { id: o.id }] }))
  db.vehicles.forEach((v) => add({ key: 'v' + v.id, type: 'vehicle', assetId: v.plate, name: `${v.brand} ${v.model}`.trim(), category: v.type === 'heavy' ? 'Heavy vehicle' : 'Car', location: [v.location, v.user].filter(Boolean).join(' · ') || '—', place: v.location || '—', qty: 1, condition: v.condition, conditionLabel: CONDITIONS[v.condition]?.label || v.condition, purchaseDate: v.purchaseDate || null, cost: v.purchaseValue ? Number(v.purchaseValue) : null, open: ['vehicle', { id: v.id }] }))
  return rows
}
/** Total value report: per asset type and a grand total. Lost, scrapped and deactivated assets are left out; assets with no value are counted separately. */
export function assetTotals(rows) {
  const by = Object.keys(ASSET_TYPES).map((type) => {
    const r = rows.filter((x) => x.type === type && !x.excluded)
    const valued = r.filter((x) => !x.missing)
    return { type, label: ASSET_TYPES[type].plural, count: valued.length, missing: r.length - valued.length, cost: valued.reduce((a, x) => a + x.cost, 0), dep: valued.reduce((a, x) => a + x.dep, 0), current: valued.reduce((a, x) => a + x.current, 0) }
  })
  const sum = (k) => by.reduce((a, x) => a + x[k], 0)
  return { by, total: { count: sum('count'), missing: sum('missing'), cost: sum('cost'), dep: sum('dep'), current: sum('current') } }
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
  // a few materials low or out for the demo: lower the opening stock, but never so far that the history goes below zero
  ;[['m8', 6], ['m22', 11], ['m25', 9], ['m6', 4], ['m27', 0]].forEach(([id, target]) => {
    const m = materials.find((x) => x.id === id)
    let run = m.opening, low = run
    movements.forEach((mv) => { if (!mv.cancelled) mv.lines.forEach((l) => { if (l.materialId === id) { run += KINDS[mv.kind].sign * l.qty; low = Math.min(low, run) } }) })
    m.opening -= Math.max(0, Math.min(run - target, low))
  })
  // prices: purchases get a price near each material's base price; each stock out keeps the weighted average cost at that date.
  // Tools are left without a price, so old tool entries show "Price not set".
  const pr = rng(4242)
  const basePrice = Object.fromEntries(materials.map((m) => [m.id, round2(3 + pr() * 60)]))
  materials.forEach((m) => { if (!isTool(m)) m.openingCost = basePrice[m.id] })
  const cost = {} // id -> { q, v }
  movements.forEach((mv) => mv.lines.forEach((l) => {
    const m = materials.find((x) => x.id === l.materialId)
    if (isTool(m)) return
    const c = (cost[l.materialId] ||= { q: m.opening, v: m.opening * basePrice[l.materialId] })
    if (mv.kind === 'purchase') { l.unitPrice = round2(basePrice[l.materialId] * (0.9 + pr() * 0.2)); c.q += l.qty; c.v += l.qty * l.unitPrice }
    if (mv.kind === 'issue') l.unitCost = round2(c.v / c.q)
  }))
  const m35 = materials.find((x) => x.id === 'm35'); m35.opening -= bal.m35 // compressor: all units are out at sites → zero left

  const sample = (title, rows) => ({ sample: true, name: title.replace(/\s+/g, '_') + '.pdf', title, rows })
  const V = (o) => {
    const v = { id: uid('v'), maintenance: [], docs: {}, indemnityDocs: [], ...o }
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

  const HT = (n, toolId, category, name, qty, monthsAgo, unitValue, condition) => ({ id: 'ht' + n, toolId, category, name, qty, purchaseDate: addMonths(TODAY, -monthsAgo), unitValue, condition, remarks: '', active: true, log: [] })
  const handTools = [
    HT(1, 'HT-0001', 'Power tools', 'Bosch cordless drill', 4, 14, 650, 'good'),
    HT(2, 'HT-0002', 'Measuring', 'Laser distance meter', 3, 8, 420, 'new'),
    HT(3, 'HT-0003', 'Electrical testing', 'Fluke multimeter', 2, 26, 980, 'fair'),
    HT(4, 'HT-0004', 'Hand tools', 'Measuring tape 8 m', 10, 5, 35, 'good'),
    HT(5, 'HT-0005', 'Power tools', 'Makita angle grinder', 2, 20, 540, 'repair'),
  ]
  const AL = (n, toolRef, empId, empName, designation, qty, daysAgo, extra = {}) => ({ id: 'al' + n, toolRef, empId, empName, designation, qty, condition: 'good', handoverDate: addDays(TODAY, -daysAgo), returnDate: '', handoverTo: '', remarks: '', log: [{ at: addDays(TODAY, -daysAgo) + 'T09:00:00', by: 'Manager', text: 'Allocated' }], ...extra })
  const allocations = [
    AL(1, 'ht1', 'E-1021', 'Abhijith', 'Site engineer', 1, 60),
    AL(2, 'ht2', 'E-1021', 'Abhijith', 'Site engineer', 1, 60),
    AL(3, 'ht1', 'E-1034', 'Azeem', 'Site engineer', 1, 40),
    AL(4, 'ht4', 'E-2210', 'Rashid Ali', 'Electrician', 2, 25),
    AL(5, 'ht3', 'E-2210', 'Rashid Ali', 'Electrician', 1, 90, { returnDate: addDays(TODAY, -30) }),
    AL(6, 'ht3', 'E-2245', 'Vinod Kumar', 'Electrician', 1, 28),
  ]
  const OA = (n, name, category, location, monthsAgo, purchaseValue, condition) => ({ id: 'oa' + n, assetId: 'OA-' + String(n).padStart(4, '0'), name, category, location, purchaseDate: addMonths(TODAY, -monthsAgo), purchaseValue, condition, remarks: '', active: true })
  const officeAssets = [
    OA(1, 'Dell Latitude laptop', 'Computer', 'Dammam HQ · Accounts', 18, 4800, 'good'),
    OA(2, 'Conference table', 'Furniture', 'Dammam HQ · Meeting room', 40, 3200, 'good'),
    OA(3, 'HP LaserJet printer', 'Equipment', 'Dammam HQ · Reception', 30, 1900, 'fair'),
  ]

  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, periods: { ...DEFAULT_SETTINGS.periods } },
    materials, movements, projects: PROJECTS, engineers: ENGINEERS, vendors: VENDORS,
    vehicles, drivers, handTools, allocations, officeAssets,
    activity: [
      { id: uid('a'), at: new Date().toISOString(), text: 'Demo data loaded — 38 materials, 11 vehicles, 8 drivers', icon: 'spark' },
    ],
  }
}
