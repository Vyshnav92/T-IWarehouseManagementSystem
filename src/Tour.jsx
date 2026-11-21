import { useState } from 'react'
import { Warehouse, Truck, Users, BellRing, Sparkles, ArrowRight, ArrowLeft, PackagePlus, PackageMinus, FileText, CalendarCheck, MessageCircle } from 'lucide-react'
import { useApp } from './store'
import { cx } from './ui'
import logoLight from './logo_L.png'

const SLIDES = [
  {
    kicker: 'Welcome', title: 'Your company, in one screen',
    text: 'The T&I Control Room keeps your warehouse, vehicles and drivers in one simple place. No spreadsheets, no lost papers, no missed renewals.',
    art: 'welcome',
  },
  {
    kicker: '1 · Warehouse', title: 'Stock counts itself',
    text: 'Press Stock in when materials arrive and Stock out when they go to a site. The app keeps every balance up to date and warns you before anything runs out.',
    art: 'stock',
  },
  {
    kicker: '2 · Vehicles & drivers', title: 'Every document, one tap away',
    text: 'Istimara, FAHAS, insurance, operation cards, licenses, driver cards, workshop bills. Upload once, then view or download them any time.',
    art: 'docs',
  },
  {
    kicker: '3 · Reminders', title: 'Never miss an expiry again',
    text: 'You start getting reminders 10 days before anything expires, and you get one every day until the new date is entered.',
    art: 'remind',
  },
  {
    kicker: '4 · Smart help', title: 'Just ask, in your own words',
    text: '“What expires this week?” or “Sent 20 cement bags to Wagamama”. The assistant answers, or fills the form for you.',
    art: 'ai',
  },
]

export default function Tour() {
  const { update, go } = useApp()
  const [i, setI] = useState(0)
  const s = SLIDES[i]
  const done = () => { update((d) => { d.settings.tourDone = true }); go('home') }
  return (
    <div className="scrim tour-scrim">
      <div className="tour" role="dialog" aria-modal="true" aria-label="Welcome tour">
        <div className={cx('tour-art', 'ta-' + s.art)} key={i}><Art kind={s.art} /></div>
        <div className="tour-t" key={'t' + i}>
          <span className="tour-k">{s.kicker}</span>
          <h2>{s.title}</h2>
          <p>{s.text}</p>
        </div>
        <footer className="tour-f">
          <div className="tour-dots">{SLIDES.map((_, j) => <button key={j} className={cx(j === i && 'on')} onClick={() => setI(j)} aria-label={`Step ${j + 1}`} />)}</div>
          <span className="grow" />
          {i === 0 ? <button className="linkish" onClick={done}>Skip</button> : <button className="btn btn-ghost" onClick={() => setI(i - 1)}><ArrowLeft size={16} /></button>}
          {i < SLIDES.length - 1
            ? <button className="btn btn-primary" onClick={() => setI(i + 1)}><span>{i === 0 ? 'Show me how' : 'Next'}</span><ArrowRight size={16} /></button>
            : <button className="btn btn-primary" onClick={done}><span>Start using it</span><ArrowRight size={16} /></button>}
        </footer>
      </div>
    </div>
  )
}

function Art({ kind }) {
  if (kind === 'welcome') return (
    <div className="art-welcome">
      <img src={logoLight} alt="T&I Construction" />
      <div className="art-orbit">
        <span style={{ '--a': '0deg' }}><Warehouse size={22} /></span>
        <span style={{ '--a': '120deg' }}><Truck size={22} /></span>
        <span style={{ '--a': '240deg' }}><Users size={22} /></span>
      </div>
    </div>
  )
  if (kind === 'stock') return (
    <div className="art-stock">
      <div className="as-card in"><PackagePlus size={20} /><b>+40</b><small>Cement bags</small></div>
      <div className="as-bar"><i /></div>
      <div className="as-card out"><PackageMinus size={20} /><b>−12</b><small>To Wagamama</small></div>
    </div>
  )
  if (kind === 'docs') return (
    <div className="art-docs">
      {['Istimara', 'Insurance', 'FAHAS', 'Driver card'].map((d, j) => <div key={d} className="ad-doc" style={{ '--j': j }}><FileText size={18} /><b>{d}</b></div>)}
    </div>
  )
  if (kind === 'remind') return (
    <div className="art-remind">
      <div className="ar-bell"><BellRing size={34} /><em>3</em></div>
      <div className="ar-cal">{[10, 9, 8, 7, 6, 5, 4].map((n, j) => <span key={n} className={j > 4 ? 'hot' : ''}>{n}</span>)}<span className="ok"><CalendarCheck size={14} /></span></div>
    </div>
  )
  return (
    <div className="art-ai">
      <div className="aa-bub me">What expires this week?</div>
      <div className="aa-bub ai"><Sparkles size={14} /> 3 items: RJA 4821 FAHAS in 4 days…</div>
      <div className="aa-ic"><MessageCircle size={22} /></div>
    </div>
  )
}
