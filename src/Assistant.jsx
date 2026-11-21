import { useEffect, useRef, useState } from 'react'
import { Sparkles, X, Send, ChevronRight, Mic } from 'lucide-react'
import { useApp } from './store'
import { answer, SUGGESTIONS } from './ai'
import { Rich, cx, useEsc } from './ui'

export default function Assistant() {
  const { assistant, closeAssistant, db, open, go } = useApp()
  const [msgs, setMsgs] = useState([])
  const [q, setQ] = useState('')
  const [typing, setTyping] = useState(false)
  const end = useRef()
  const input = useRef()
  useEsc(() => assistant.open && closeAssistant())

  const ask = (text) => {
    const t = text.trim()
    if (!t) return
    setMsgs((m) => [...m, { role: 'me', text: t }])
    setQ('')
    setTyping(true)
    setTimeout(() => { setMsgs((m) => [...m, { role: 'ai', ...answer(t, db) }]); setTyping(false) }, 550 + Math.random() * 350)
  }
  useEffect(() => {
    if (!assistant.open) return
    if (assistant.seed) ask(assistant.seed)
    setTimeout(() => input.current?.focus(), 250)
  }, [assistant.n]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, typing])

  const act = (a) => {
    if (a.open) open(a.open.type, { id: a.open.id })
    else if (a.go) { const [p, t] = a.go.split('/'); go(p, t); closeAssistant() }
    else if (a.entry) open('entry', { kind: a.entry.kind, prefill: a.entry })
  }
  if (!assistant.open) return null
  return (
    <aside className="asst" role="dialog" aria-label="Assistant">
      <header className="asst-h">
        <span className="asst-av"><Sparkles size={18} /></span>
        <div className="grow"><b>AbhiChat AI</b><small>Knows your stock, vehicles and drivers</small></div>
        <button className="iconbtn" onClick={closeAssistant} aria-label="Close"><X size={20} /></button>
      </header>
      <div className="asst-b">
        {msgs.length === 0 && (
          <div className="asst-empty">
            <span className="asst-big"><Sparkles size={28} /></span>
            <b>Ask me anything, the way you'd ask a colleague</b>
            <p className="muted small">I can look things up, and I can fill forms for you. Write “sent 10 helmets to Renault” and I'll prepare the stock-out.</p>
            <div className="asst-sugg">{SUGGESTIONS.map((s) => <button key={s} onClick={() => ask(s)}>{s}<ChevronRight size={14} /></button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => m.role === 'me' ? <div key={i} className="bub me">{m.text}</div> : (
          <div key={i} className="bub ai">
            <p><Rich text={m.text} /></p>
            {m.list?.length > 0 && <ul className="bub-list">{m.list.map((x, j) => (
              <li key={j} className={cx(x.open && 'click')} onClick={() => x.open && act(x)}>
                {x.tone && <i className={'dotlg ' + x.tone} />}<span className="grow">{x.label}</span>{x.meta && <small>{x.meta}</small>}{x.open && <ChevronRight size={14} />}
              </li>))}</ul>}
            {m.after && <p className="bub-after"><Rich text={m.after} /></p>}
            {m.actions?.length > 0 && <div className="bub-acts">{m.actions.map((a, j) => <button key={j} className="btn btn-primary btn-sm" onClick={() => act(a)}>{a.label}</button>)}</div>}
            {m.chips?.length > 0 && <div className="bub-chips">{m.chips.map((c) => <button key={c} onClick={() => ask(c)}>{c}</button>)}</div>}
          </div>
        ))}
        {typing && <div className="bub ai typing"><div className="dots"><i /><i /><i /></div></div>}
        <div ref={end} />
      </div>
      <form className="asst-f" onSubmit={(e) => { e.preventDefault(); ask(q) }}>
        <button type="button" className="iconbtn" title="Voice input is planned for the full version" aria-label="Voice (coming soon)"><Mic size={19} /></button>
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a question or a stock entry…" />
        <button className="sendbtn" disabled={!q.trim()} aria-label="Send"><Send size={18} /></button>
      </form>
    </aside>
  )
}
