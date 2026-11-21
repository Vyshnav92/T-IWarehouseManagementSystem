import { Truck, Users, CalendarCheck, ChevronRight, BellRing, CheckCircle2, MessageSquare, Mail, Smartphone, PartyPopper } from 'lucide-react'
import { useApp } from '../store'
import { allExpiries, EXPIRY, fmtDate, relDays, reminderNo } from '../data'
import { PageHeader, Btn, Pill, cx } from '../ui'

export default function Reminders() {
  const { db, open } = useApp()
  const s = db.settings
  const all = allExpiries(db)
  const groups = [
    { id: 'expired', title: 'Already expired', sub: 'Renew these first. They may already be causing fines.', tone: 'bad', rows: all.filter((e) => e.days < 0) },
    { id: 'week', title: 'This week', sub: 'Expires in the next 7 days', tone: 'warn', rows: all.filter((e) => e.days >= 0 && e.days <= 7) },
    { id: 'window', title: `In ${s.remindDays} days`, sub: 'Reminders have started', tone: 'warn', rows: all.filter((e) => e.days > 7 && e.days <= s.remindDays) },
    { id: 'later', title: 'Coming up later', sub: 'Next 60 days. No reminders yet, shown so you can plan', tone: 'info', rows: all.filter((e) => e.days > s.remindDays && e.days <= 60) },
  ]
  const active = groups[0].rows.length + groups[1].rows.length + groups[2].rows.length
  return (
    <div className="page">
      <PageHeader title="Reminders" ar="التنبيهات" desc="Every date that can expire, for vehicles and drivers, in one list. Renew something and it leaves the list."
        how={[`A reminder starts ${s.remindDays} days before the expiry date.`, 'It repeats every day, on this page, on the bell at the top and in the morning pop-up, until you enter the new date.', 'Press Renew, enter the new date (we suggest it for you) and attach the new document. Done.']} />

      <section className="howline">
        <div className="hl-step"><span className="hl-dot info" /><b>{s.remindDays} days before</b><small>First reminder</small></div>
        <div className="hl-bar" />
        <div className="hl-step"><span className="hl-dot warn" /><b>Every day</b><small>Reminded again</small></div>
        <div className="hl-bar" />
        <div className="hl-step"><span className="hl-dot bad" /><b>Expiry day</b><small>Turns red</small></div>
        <div className="hl-bar ok" />
        <div className="hl-step"><span className="hl-dot ok"><CheckCircle2 size={14} /></span><b>New date entered</b><small>Reminders stop</small></div>
      </section>

      <div className="rem-top">
        <div className="rem-count"><BellRing size={22} /><div><b>{active}</b><span>active reminders today</span></div></div>
        <div className="channels">
          <span className="muted small">Remind me by:</span>
          <span className="chan on"><Smartphone size={15} /> In the app</span>
          <span className="chan soon" title="Planned for the full version"><MessageSquare size={15} /> WhatsApp <em>soon</em></span>
          <span className="chan soon" title="Planned for the full version"><Mail size={15} /> Email <em>soon</em></span>
        </div>
      </div>

      {active === 0 && <div className="allgood"><PartyPopper size={28} /><div><b>All clear!</b><p className="muted">Nothing has expired and nothing expires in the next {s.remindDays} days.</p></div></div>}

      {groups.map((g) => g.rows.length > 0 && (
        <section key={g.id} className={cx('remgroup', 'rg-' + g.tone)}>
          <header><h3>{g.title} <Pill tone={g.tone}>{g.rows.length}</Pill></h3><span className="muted small">{g.sub}</span></header>
          <div className="remlist">
            {g.rows.map((e) => (
              <div key={e.id} className="rem" onClick={() => open(e.entity, { id: e.entityId })} role="button" tabIndex={0}>
                <span className={cx('rem-ic', g.tone)}>{e.entity === 'vehicle' ? <Truck size={19} /> : <Users size={19} />}</span>
                <div className="rem-main">
                  <b>{EXPIRY[e.key].label} <span className="ar">{EXPIRY[e.key].ar}</span></b>
                  <span className="rem-who">{e.entity === 'vehicle' ? <span className="plate sm">{e.title}</span> : e.title} <span className="muted">· {e.subtitle}</span></span>
                </div>
                <div className="rem-when">
                  <b className={g.tone + 'c'}>{e.days < 0 ? `Expired ${-e.days} day${e.days === -1 ? '' : 's'} ago` : e.days === 0 ? 'Expires today' : `Expires ${relDays(e.days)}`}</b>
                  <small className="muted">{fmtDate(e.date)}{g.id !== 'later' && ` · reminder #${reminderNo(e.days, s.remindDays)}, repeats daily`}</small>
                </div>
                <Btn kind={g.id === 'later' ? 'ghost' : 'primary'} size="sm" icon={CalendarCheck} onClick={(ev) => { ev.stopPropagation(); open('renew', { entity: e.entity, id: e.entityId, expKey: e.key }) }}>Renew</Btn>
                <ChevronRight size={18} className="muted hide-sm" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
