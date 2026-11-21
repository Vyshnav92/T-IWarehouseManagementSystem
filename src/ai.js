/* ------------------------------------------------------------------
   "Smart" layer. In this demo everything runs locally in the browser:
   - answer()      plain-language questions about stock, vehicles, drivers
   - parseEntry()  turns a WhatsApp-style sentence into a stock entry
   - insights()    run-out forecasts, repair-or-replace, unusual entries
   - simulateRead* stand-ins for document / bill reading (a real build would
                   send the photo to a vision model such as Claude).
------------------------------------------------------------------- */
import {
  allExpiries, activeReminders, balances, forecast, currentValue, maintSpend, toolsAtSites, usageRate,
  EXPIRY, fmtDate, fmtNum, fmtSAR, relDays, addMonths, TODAY, daysUntil, CONDITIONS, KINDS,
} from './data'

// ---------- fuzzy matching ----------
const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'for', 'and', 'with', 'from', 'by', 'in', 'on', 'at', 'pcs', 'nos', 'no', 'pieces', 'piece', 'units', 'unit', 'x', 'please', 'we', 'have', 'do', 'how', 'many', 'much', 'is', 'are', 'there', 'left', 'stock', 'what', 'our', 'any'])
export function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/(\d)\s*["”]/g, '$1 inch ').replace(/(\d)\s*(inch|in)\b/g, '$1 inch ')
    .replace(/(\d)\s*[x*×]\s*(\d)/g, '$1 x $2')
    .replace(/(\d)\s*(mm|cm|kg)\b/g, '$1 $2')
    .replace(/[^a-z0-9./ ؀-ۿ]+/g, ' ').replace(/\s+/g, ' ').trim()
}
const stem = (w) => (w.length > 3 && w.endsWith('es') && !w.endsWith('ses') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)
const toks = (s) => norm(s).split(' ').filter((w) => w && !STOP.has(w)).map(stem)

function matchScore(queryToks, name) {
  const nt = toks(name)
  if (!nt.length || !queryToks.length) return 0
  let hit = 0
  nt.forEach((w) => { if (queryToks.includes(w)) hit += /^\d/.test(w) ? 1.2 : 1 })
  const words = nt.filter((w) => !/^\d/.test(w) && !['inch', 'mm', 'cm', 'kg'].includes(w))
  const wordHit = words.filter((w) => queryToks.includes(w)).length
  if (words.length && wordHit === 0) return 0 // must match at least one real word, not just a size
  return hit / nt.length + wordHit * 0.15
}
export function bestMatch(text, list, getName = (x) => x, min = 0.34) {
  const q = toks(text)
  let best = null, score = 0
  list.forEach((x) => { const s = matchScore(q, getName(x)); if (s > score) { score = s; best = x } })
  return score >= min ? best : null
}
const findIn = (text, names) => {
  const t = ' ' + norm(text) + ' '
  return names.find((n) => toks(n).filter((w) => w.length >= 4).some((w) => t.includes(' ' + w + ' ') || t.includes(' ' + w + 's ')))
}

// ---------- sentence → stock entry ----------
export function parseEntry(text, db) {
  const t = norm(text)
  let kind = 'issue'
  if (/\b(bought|buy|purchas|received from|receive from|delivered by|supplier|vendor)/.test(t)) kind = 'purchase'
  else if (/\b(return|returned|came back|brought back|back from)/.test(t)) kind = 'return'
  const reqNo = (t.match(/\b(?:req|request|requisition)\s*(?:no\.?|number)?\s*(\d+)/) || [])[1] || ''
  const mtn = (t.match(/\bmtn\s*(?:no\.?)?\s*(\d+)/) || [])[1] || ''
  const billNo = (text.match(/\b(?:bill|invoice|inv)\s*(?:no\.?|#)?\s*([A-Za-z0-9-]*\d[A-Za-z0-9-]*)/i) || [])[1] || ''
  const project = findIn(t, db.projects) || ''
  const engineer = db.engineers.find((e) => new RegExp('\\b' + e.toLowerCase() + '\\b').test(t)) || ''
  const vendor = findIn(t, db.vendors) || ''
  // strip the bits we already understood, then read "<qty> <material>" pairs
  let body = t.replace(/\b(?:req|request|requisition)\s*(?:no\.?|number)?\s*\d+/g, ' ').replace(/\bmtn\s*(?:no\.?)?\s*\d+/g, ' ').replace(/\b(?:bill|invoice|inv)\s*(?:no\.?)?\s*[a-z0-9-]*\d[a-z0-9-]*/g, ' ')
  const lines = []
  const unknown = []
  body.split(/,|;|\band\b|\bplus\b|\+|\balso\b/).forEach((seg) => {
    const m = seg.match(/(\d+(?:\.\d+)?)\s+(?:x\s+)?(.+)/)
    if (!m) return
    const qty = Number(m[1])
    let name = m[2].split(/\b(?:to|for|from|by|at|engineer|eng|site)\b/)[0].trim()
    name = name.replace(/^(?:nos|pcs|pieces|rolls?|bags?|boxes?|units?|sqm|meters?|kg)\s+(?:of\s+)?/, '')
    if (!name) return
    const mat = bestMatch(name, db.materials, (x) => x.name)
    if (mat && qty > 0) { const ex = lines.find((l) => l.materialId === mat.id); if (ex) ex.qty += qty; else lines.push({ materialId: mat.id, qty }) }
    else unknown.push(seg.trim())
  })
  return { kind, reqNo, mtn, billNo, project, engineer, reqName: engineer, vendor, lines, unknown }
}

// ---------- insights ----------
export function insights(db) {
  const bal = balances(db)
  const fc = forecast(db, bal)
  const runningOut = fc.filter((f) => f.runOut !== null && f.runOut <= 14 && f.bal > 0).sort((a, b) => a.runOut - b.runOut)
  const reorder = fc.filter((f) => f.status !== 'ok' || (f.runOut !== null && f.runOut <= 14)).sort((a, b) => (a.runOut ?? 999) - (b.runOut ?? 999))
  const rate = db.settings.depreciation
  const fleet = db.vehicles.map((v) => {
    const value = currentValue(v, rate)
    const spend = maintSpend(v)
    const ratio = value ? spend / value : 0
    return { v, value, spend, ratio }
  })
  const replace = fleet.filter((f) => f.ratio >= 0.08 || (f.v.condition === 'repair' && f.spend > 3000)).sort((a, b) => b.ratio - a.ratio)
  return { bal, fc, runningOut, reorder, fleet, replace }
}
/** Average past quantity per stock-out for a material; used to flag unusual entries. */
export function typicalIssue(db, materialId) {
  const q = []
  db.movements.forEach((mv) => { if (!mv.cancelled && mv.kind === 'issue') mv.lines.forEach((l) => { if (l.materialId === materialId) q.push(l.qty) }) })
  if (q.length < 3) return null
  return q.reduce((a, b) => a + b, 0) / q.length
}

export function morningBrief(db) {
  const rem = activeReminders(db)
  const expired = rem.filter((r) => r.level === 'expired')
  const week = rem.filter((r) => r.days >= 0 && r.days <= 7)
  const { reorder, runningOut, replace } = insights(db)
  const parts = []
  if (expired.length) parts.push(`**${expired.length} document${expired.length > 1 ? 's have' : ' has'} already expired**`)
  if (week.length) parts.push(`${week.length} expire${week.length === 1 ? 's' : ''} this week`)
  const low = reorder.filter((r) => r.status !== 'ok').length
  if (low) parts.push(`${low} material${low > 1 ? 's are' : ' is'} low or finished`)
  let text = parts.length ? parts.join(', ') + '.' : 'Everything is in order today. Nothing has expired and stock levels are healthy.'
  if (runningOut[0]) text += ` At the current pace, **${runningOut[0].m.name}** will run out in about ${runningOut[0].runOut} day${runningOut[0].runOut === 1 ? '' : 's'}.`
  if (replace[0]) text += ` ${replace[0].v.plate} keeps costing money to repair. It may be time to replace it.`
  return { text, count: rem.length + low, expired, week, low }
}

// ---------- assistant ----------
const vLink = (v) => ({ label: `${v.plate} · ${v.brand} ${v.model}`, open: { type: 'vehicle', id: v.id } })
const dLink = (d) => ({ label: d.name, open: { type: 'driver', id: d.id } })
const mLink = (m) => ({ label: m.name, open: { type: 'material', id: m.id } })

export const SUGGESTIONS = [
  'What expires this week?',
  'What should I order?',
  'How many 1" PVC bends do we have?',
  'Where are the scaffoldings?',
  'Maintenance cost this year',
  'Sent 20 cement bags and 5 cable trays to Wagamama, req 512',
]

export function answer(q, db) {
  const t = norm(q)
  const { bal, reorder, fleet, replace } = insights(db)

  if (!t || /^(hi|hello|hey|salam|assalam|marhaba|help|what can you do)/.test(t)) {
    return { text: 'Ask me anything about your warehouse, vehicles or drivers, in your own words. For example:', chips: SUGGESTIONS.slice(0, 5) }
  }

  // 1) A stock movement typed like a message → prepare the form
  if (/\b(sent|send|issue|issued|give|gave|deliver|bought|buy|purchased|received|returned|return|came back)\b/.test(t) && /\d/.test(t)) {
    const p = parseEntry(q, db)
    if (p.lines.length) {
      const k = KINDS[p.kind]
      const lines = p.lines.map((l) => { const m = db.materials.find((x) => x.id === l.materialId); return `${fmtNum(l.qty)} ${m.unit} · ${m.name}` })
      return {
        text: `I understood this as a **${k.label.toLowerCase()}**${p.project ? ` for **${p.project}**` : ''}${p.vendor ? ` from **${p.vendor}**` : ''}${p.reqNo ? `, request no. ${p.reqNo}` : ''}:`,
        list: lines.map((label) => ({ label })),
        after: p.unknown.length ? `I couldn't match: "${p.unknown.join('", "')}". You can add it on the form.` : 'Nothing is saved yet. Check the form and press Save.',
        actions: [{ label: 'Open the filled form', entry: p }],
      }
    }
  }

  // 2) Expiries
  if (/expir|renew|fahas|istimara|registration|operation card|op card|driver card|licen|due|document/.test(t)) {
    let list = allExpiries(db)
    const keys = []
    if (/fahas|inspection/.test(t)) keys.push('fahas')
    if (/istimara|registration/.test(t)) keys.push('registration')
    if (/operation|op card/.test(t)) keys.push('opCard')
    if (/driver card/.test(t)) keys.push('driverCard')
    if (/licen/.test(t)) keys.push('license')
    if (keys.length) list = list.filter((e) => keys.includes(e.key))
    let window = db.settings.remindDays, label = `in the next ${db.settings.remindDays} days`
    if (/today/.test(t)) { window = 0; label = 'today' }
    else if (/week/.test(t)) { window = 7; label = 'this week' }
    else if (/month/.test(t)) { window = 30; label = 'in the next 30 days' }
    else if (/year/.test(t)) { window = 365; label = 'in the next year' }
    const expired = list.filter((e) => e.days < 0)
    const soon = list.filter((e) => e.days >= 0 && e.days <= window)
    if (/expired/.test(t) && !/expir(e|ing)/.test(t.replace('expired', ''))) {
      return { text: expired.length ? `**${expired.length}** already expired. Renew these first:` : 'Nothing has expired. 👍', list: expired.map(expItem) }
    }
    const rows = [...expired, ...soon]
    return {
      text: rows.length ? `${expired.length ? `**${expired.length} already expired**, and ` : ''}**${soon.length}** expire ${label}:` : `Nothing expires ${label}.`,
      list: rows.map(expItem),
      actions: rows.length ? [{ label: 'Open reminders', go: 'reminders' }] : [],
    }
  }

  // 3) Re-ordering
  if (/\b(order|reorder|low|running out|run out|finish|short|buy what|need to buy)\b/.test(t)) {
    const rows = reorder.slice(0, 8)
    return {
      text: rows.length ? `I'd order these **${rows.length}** items. The amounts cover about 30 days of use at your current pace:` : 'All materials have enough stock for the next two weeks.',
      list: rows.map((r) => ({ ...mLink(r.m), label: `${r.m.name}: order ${fmtNum(r.suggest)} ${r.m.unit}`, meta: r.bal <= 0 ? 'finished' : r.runOut !== null ? `${fmtNum(r.bal)} left · lasts about ${r.runOut} days` : `${fmtNum(r.bal)} left` })),
      actions: [{ label: 'Open stock list', go: 'warehouse' }],
    }
  }

  // 4) Where are tools
  if (/\b(where|which site|tools?|scaffold)/.test(t)) {
    const sites = toolsAtSites(db)
    const mat = bestMatch(q, db.materials.filter((m) => m.category === 'Tools'), (m) => m.name, 0.3)
    const rows = []
    sites.forEach((s) => s.tools.forEach((x) => { if (!mat || x.id === mat.id) { const m = db.materials.find((y) => y.id === x.id); rows.push({ label: `${fmtNum(x.q)} × ${m.name}`, meta: s.project }) } }))
    if (rows.length) return { text: mat ? `**${mat.name}**: ${fmtNum(bal[mat.id])} in the warehouse. These are out at sites:` : 'Tools currently out at sites:', list: rows, actions: [{ label: 'See tools at sites', go: 'warehouse/tools' }] }
  }

  // 5) Maintenance spend
  if (/maint|repair|service|spent|spend|cost|workshop/.test(t)) {
    const total = fleet.reduce((a, f) => a + f.spend, 0)
    const top = [...fleet].sort((a, b) => b.spend - a.spend).slice(0, 4)
    return {
      text: `In the last 12 months you spent **${fmtSAR(total)}** on maintenance across ${db.vehicles.length} vehicles. These cost the most:`,
      list: top.map((f) => ({ ...vLink(f.v), meta: fmtSAR(f.spend) })),
      after: replace[0] ? `💡 ${replace[0].v.plate}: repairs cost ${Math.round(replace[0].ratio * 100)}% of what the vehicle is worth now. Think about replacing it.` : '',
    }
  }

  // 6) Fleet value
  if (/value|worth|depreciat|fleet/.test(t)) {
    const total = fleet.reduce((a, f) => a + f.value, 0)
    const bought = db.vehicles.reduce((a, v) => a + (v.purchaseValue || 0), 0)
    return {
      text: `Your ${db.vehicles.length} vehicles are worth about **${fmtSAR(total)}** today. You paid ${fmtSAR(bought)} for them. Value drops ${db.settings.depreciation}% each year.`,
      list: [...fleet].sort((a, b) => b.value - a.value).slice(0, 5).map((f) => ({ ...vLink(f.v), meta: fmtSAR(f.value) })),
    }
  }

  // 7) A vehicle by plate number
  const digits = (t.match(/\b\d{4}\b/) || [])[0]
  const veh = db.vehicles.find((v) => (digits && v.plate.includes(digits)) || t.includes(v.plate.toLowerCase()))
  if (veh) {
    const c = CONDITIONS[veh.condition]
    return {
      text: `**${veh.plate}**, ${veh.brand} ${veh.model} (${veh.year}). Used by ${veh.user}, at ${veh.location}. Condition: ${c.label}. Worth about ${fmtSAR(currentValue(veh, db.settings.depreciation))} today.`,
      list: ['fahas', 'registration', ...(veh.type === 'heavy' ? ['opCard'] : [])].map((k) => ({ label: `${EXPIRY[k].short}: ${fmtDate(veh[k])}`, meta: relDays(daysUntil(veh[k])) })),
      actions: [{ label: 'Open vehicle', open: { type: 'vehicle', id: veh.id } }],
    }
  }

  // 8) A driver by name
  const drv = db.drivers.find((d) => d.name.toLowerCase().split(' ').some((w) => w.length > 3 && new RegExp('\\b' + w + '\\b').test(t)))
  if (drv) {
    const car = db.vehicles.find((v) => v.user === drv.name)
    return {
      text: `**${drv.name}**, ${drv.profession}${car ? `, drives ${car.plate} (${car.brand} ${car.model})` : ''}. Phone ${drv.phone}.`,
      list: [{ label: `Driver card: ${fmtDate(drv.driverCard)}`, meta: relDays(daysUntil(drv.driverCard)) }, { label: `License: ${fmtDate(drv.license)}`, meta: relDays(daysUntil(drv.license)) }],
      actions: [{ label: 'Open driver', open: { type: 'driver', id: drv.id } }],
    }
  }

  // 9) A project
  const proj = findIn(t, db.projects)
  if (proj) {
    const sums = {}
    db.movements.forEach((mv) => { if (!mv.cancelled && mv.project === proj && daysUntil(mv.date) >= -30) mv.lines.forEach((l) => { sums[l.materialId] = (sums[l.materialId] || 0) + (mv.kind === 'issue' ? l.qty : -l.qty) }) })
    const rows = Object.entries(sums).filter(([, q]) => q > 0).sort((a, b) => b[1] - a[1]).slice(0, 8)
    return { text: `In the last 30 days, **${proj}** received:`, list: rows.map(([id, qty]) => { const m = db.materials.find((x) => x.id === id); return { ...mLink(m), label: `${fmtNum(qty)} ${m.unit} · ${m.name}` } }) }
  }

  // 10) A material's stock
  const mat = bestMatch(q, db.materials, (m) => m.name)
  if (mat) {
    const rate = usageRate(db, mat.id)
    const last = [...db.movements].reverse().find((mv) => !mv.cancelled && mv.lines.some((l) => l.materialId === mat.id))
    return {
      text: `We have **${fmtNum(bal[mat.id])} ${mat.unit}** of ${mat.name}.${rate > 0 ? ` You use about ${fmtNum(Math.round(rate * 7))} a week, so it lasts roughly ${Math.floor(bal[mat.id] / rate)} more days.` : ''}${last ? ` Last movement: ${KINDS[last.kind].label.toLowerCase()} on ${fmtDate(last.date)}${last.project ? ` (${last.project})` : last.vendor ? ` (${last.vendor})` : ''}.` : ''}`,
      actions: [{ label: 'Open its history', open: { type: 'material', id: mat.id } }],
    }
  }

  if (/how many (vehicles|cars|trucks)/.test(t)) return { text: `You have **${db.vehicles.length}** vehicles: ${db.vehicles.filter((v) => v.type === 'car').length} cars and ${db.vehicles.filter((v) => v.type === 'heavy').length} heavy vehicles.` }
  if (/how many drivers/.test(t)) return { text: `You have **${db.drivers.length}** drivers.` }

  return { text: "Sorry, I didn't get that. Try asking it another way, or tap one of these:", chips: SUGGESTIONS }
}
function expItem(e) {
  return { label: `${e.title} · ${EXPIRY[e.key].short}`, meta: e.days < 0 ? `expired ${-e.days}d ago` : relDays(e.days), tone: e.days < 0 ? 'bad' : 'warn', open: { type: e.entity, id: e.entityId } }
}

// ---------- simulated document reading ----------
/** Demo stand-in for reading the expiry date off a photo/PDF of a document. */
export function simulateReadExpiry(currentIso, periodMonths) {
  const base = currentIso && daysUntil(currentIso) > 0 ? currentIso : TODAY
  return { date: addMonths(base, periodMonths), confidence: 0.9 + Math.random() * 0.08 }
}
/** Demo stand-in for reading a supplier bill into purchase lines. */
export function simulateReadBill(db) {
  const vendor = db.vendors[Math.floor(Math.random() * db.vendors.length)]
  const pool = db.materials.filter((m) => m.category !== 'Tools')
  const lines = []
  while (lines.length < 3) { const m = pool[Math.floor(Math.random() * pool.length)]; if (!lines.some((l) => l.materialId === m.id)) lines.push({ materialId: m.id, qty: Math.max(5, Math.round(m.opening * 0.25)) }) }
  return { vendor, billNo: 'INV-' + (48000 + Math.floor(Math.random() * 900)), lines }
}
