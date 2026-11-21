import { useMemo, useRef, useState } from 'react'
import {
  MessageCircle, Wand2, ScanLine, Receipt, TrendingDown, Lightbulb, ShieldAlert, Sunrise, Brain, Sparkles, ArrowRight,
  MessageSquare, Mic, Scale, Gauge, ClipboardList, Camera, Mail, CheckCircle2, Clock,
} from 'lucide-react'
import { useApp } from '../store'
import { parseEntry, insights, morningBrief } from '../ai'
import { fmtNum, fmtSAR, EXPIRY, daysUntil } from '../data'
import { PageHeader, Btn, Rich, cx } from '../ui'

export default function Smart() {
  const { db, open, openAssistant, toast, saveFile, update } = useApp()
  const ins = useMemo(() => insights(db), [db])
  const brief = useMemo(() => morningBrief(db), [db])
  const [sentence, setSentence] = useState('Sent 20 cement bags and 5 cable trays to Wagamama, engineer Azeem, req 512')
  const file = useRef()
  // pick the most overdue vehicle registration for the "read a document" demo
  const target = [...db.vehicles].sort((a, b) => daysUntil(a.registration) - daysUntil(b.registration))[0]
  const pvc = db.materials[0]

  const tryRead = async (f) => {
    const ref = await saveFile(f)
    update((d) => { d.vehicles.find((v) => v.id === target.id).docs.istimara = ref }, `Istimara uploaded for ${target.plate}`, 'upload')
    open('readDoc', { entity: 'vehicle', id: target.id, expKey: 'registration', fileRef: ref, label: 'Istimara' })
  }

  return (
    <div className="page smart">
      <PageHeader title="Smart features" ar="الميزات الذكية" desc="The app does the boring work for you: it reads documents, fills forms, warns you early and gives advice. Try each one below." />

      <section className="smart-hero">
        <div className="sh-t">
          <span className="hero-kicker"><Sparkles size={14} /> Built in</span>
          <h2>Less typing. Fewer surprises.</h2>
          <p>Most warehouse and fleet software asks you to fill in forms. This one reads your documents, understands your messages and tells you what needs doing. It also learns what you use most.</p>
        </div>
        <div className="sh-stats">
          <div><b>1 sentence</b><span>fills a whole stock entry</span></div>
          <div><b>1 photo</b><span>updates an expiry date</span></div>
          <div><b>{db.settings.remindDays} days</b><span>warning before any expiry</span></div>
        </div>
      </section>

      <h3 className="smart-sec"><CheckCircle2 size={18} /> Working in this demo</h3>
      <div className="feat-grid">
        <Feature icon={MessageCircle} title="Ask in your own words" text="“What expires this week?” “How many PVC bends do we have?” “Where are the scaffoldings?” Get an answer in a second, with links to the details.">
          <Btn kind="dark" size="sm" icon={MessageCircle} onClick={() => openAssistant()}>Open the assistant</Btn>
        </Feature>

        <Feature icon={Wand2} title="Type it like a WhatsApp message" text="Write what happened in one sentence. The app finds the materials, quantities, project, engineer and request number, then fills the stock form.">
          <div className="try-in"><input value={sentence} onChange={(e) => setSentence(e.target.value)} /><Btn size="sm" icon={Sparkles} onClick={() => { const p = parseEntry(sentence, db); if (!p.lines.length) return toast('No materials found in that sentence', 'warn'); open('entry', { kind: p.kind, prefill: p }) }}>Fill form</Btn></div>
        </Feature>

        <Feature icon={ScanLine} title="Reads expiry dates from documents" text={`Upload a photo of a renewed Istimara, operation card or driver card. The app reads the new expiry date and clears the reminder. Try it on ${target.plate}: its registration ${daysUntil(target.registration) < 0 ? 'has expired' : 'expires soon'}.`}>
          <Btn kind="dark" size="sm" icon={ScanLine} onClick={() => file.current.click()}>Upload any photo to try</Btn>
          <input ref={file} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) tryRead(f) }} />
        </Feature>

        <Feature icon={Receipt} title="Scans supplier bills" text="Take a photo of the vendor's bill. The supplier, bill number, materials and quantities are filled into a stock-in entry for you to check.">
          <Btn kind="dark" size="sm" icon={Receipt} onClick={() => open('entry', { kind: 'purchase' })}>Open stock in → upload bill</Btn>
        </Feature>

        <Feature icon={TrendingDown} title="Tells you before stock runs out" text="Looks at how fast each material is used and warns you days in advance, with a suggested order quantity.">
          <ul className="mini-list">{ins.runningOut.slice(0, 3).map((f) => <li key={f.m.id} onClick={() => open('material', { id: f.m.id })}><span className="grow">{f.m.name}</span><b className={f.runOut <= 7 ? 'badc' : 'warnc'}>{f.runOut} days left</b></li>)}</ul>
        </Feature>

        <Feature icon={Lightbulb} title="Repair or replace?" text={`Compares what each vehicle costs to repair against what it's worth now (${db.settings.depreciation}% less every year), and tells you when replacing it makes more sense.`}>
          <ul className="mini-list">{ins.replace.slice(0, 2).map((f) => <li key={f.v.id} onClick={() => open('vehicle', { id: f.v.id })}><span className="plate sm">{f.v.plate}</span><span className="grow small">repairs {fmtSAR(f.spend)} · worth {fmtSAR(f.value)}</span><b className="badc">{Math.round(f.ratio * 100)}%</b></li>)}</ul>
        </Feature>

        <Feature icon={ShieldAlert} title="Catches mistakes before they're saved" text="Stops you sending more than you have in stock, and warns you when a quantity is much bigger than usual. For example, 500 instead of 50.">
          <Btn kind="dark" size="sm" icon={ShieldAlert} onClick={() => open('entry', { kind: 'issue', prefill: { kind: 'issue', project: 'Wagamama Riyadh', lines: [{ materialId: pvc.id, qty: 150 }] } })}>Try: send 150 PVC bends</Btn>
        </Feature>

        <Feature icon={Sunrise} title="A morning summary, every day" text="When you open the app, a short summary tells you what has expired, what is due and what's running low. It reads like a note from an assistant.">
          <p className="quote"><Rich text={brief.text} /></p>
        </Feature>

        <Feature icon={Brain} title="Learns how you work" text="The materials you send most show up first as one-tap buttons. Project names, engineers and suppliers are remembered after the first time. Reminder days, renewal periods and depreciation can be changed in Settings.">
          <Btn kind="dark" size="sm" icon={ArrowRight} onClick={() => open('entry', { kind: 'issue' })}>See your quick picks</Btn>
        </Feature>
      </div>

      <h3 className="smart-sec"><Clock size={18} /> Proposed for the full version</h3>
      <div className="road-grid">
        <Road icon={MessageSquare} title="WhatsApp reminders" text="Daily reminders and the morning summary go to the manager's WhatsApp. Drivers get a message about their own card expiring." />
        <Road icon={Mic} title="Arabic & English voice entry" text="Hold a button and say “أرسل ٢٠ كيس اسمنت لموقع واجاماما”. The stock-out is ready to confirm." />
        <Road icon={Scale} title="Quotation comparison" text="Upload 2–3 quotations for the same repair or purchase. AI shows which is the best value and flags prices above your history." />
        <Road icon={ClipboardList} title="Auto purchase orders" text="When stock runs low, a draft purchase order is prepared for your usual supplier. You just approve it." />
        <Road icon={Gauge} title="Predictive maintenance" text="Learns from mileage and past repairs to say which vehicle is likely to need the workshop next, before it breaks down." />
        <Road icon={Camera} title="Photo stock count" text="Take a photo of a shelf or pallet. The app estimates the count and highlights differences from the system stock." />
        <Road icon={Mail} title="Monthly report to management" text="On the 1st of every month, a clean PDF covering stock, fleet costs and renewals is emailed automatically." />
      </div>
    </div>
  )
}

function Feature({ icon: I, title, text, children }) {
  return (
    <section className="feat">
      <div className="feat-h"><span className="feat-ic"><I size={20} /></span><h4>{title}</h4></div>
      <p>{text}</p>
      <div className="feat-try">{children}</div>
    </section>
  )
}
function Road({ icon: I, title, text }) {
  return <div className="road"><span className="road-ic"><I size={18} /></span><div><b>{title}</b><p>{text}</p></div></div>
}
