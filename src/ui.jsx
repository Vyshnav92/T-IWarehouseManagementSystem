import { useEffect, useRef, useState } from 'react'
import { X, Upload, Eye, Download, FileText, Image as ImageIcon, ChevronDown, Info, Sparkles, CheckCircle2 } from 'lucide-react'
import { useApp, readFileData } from './store'
import { daysUntil, fmtDate, relDays, expiryLevel } from './data'

export const cx = (...a) => a.filter(Boolean).join(' ')

/** Renders **bold** inside plain strings. */
export function Rich({ text }) {
  if (!text) return null
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>))
}

export function Btn({ kind = 'primary', size, icon: I, children, className, ...p }) {
  return (
    <button className={cx('btn', 'btn-' + kind, size && 'btn-' + size, className)} {...p}>
      {I && <I size={size === 'sm' ? 15 : 17} strokeWidth={2.2} />}
      {children && <span>{children}</span>}
    </button>
  )
}

export const Pill = ({ tone = 'plain', children, dot }) => <span className={cx('pill', 'pill-' + tone)}>{dot && <i className="dot" />}{children}</span>

export function ExpiryPill({ date, remindDays, compact }) {
  if (!date) return <span className="muted">—</span>
  const d = daysUntil(date)
  const lvl = expiryLevel(d, remindDays)
  const tone = lvl === 'expired' ? 'bad' : lvl === 'due' ? 'warn' : lvl === 'upcoming' ? 'info' : 'ok'
  const label = d < 0 ? `Expired ${-d}d ago` : d === 0 ? 'Expires today' : compact ? `${d}d left` : d > 60 ? relDays(d).replace('in ', '') + ' left' : `${d} days left`
  return <Pill tone={tone} dot={lvl === 'expired' || lvl === 'due'}>{label}</Pill>
}

export function ExpiryCell({ date, remindDays }) {
  return <div className="expcell"><span className="num">{fmtDate(date)}</span><ExpiryPill date={date} remindDays={remindDays} compact /></div>
}

export function useEsc(fn) {
  useEffect(() => { const on = (e) => e.key === 'Escape' && fn(); window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on) }, [fn])
}

export function Modal({ title, sub, icon: I, onClose, children, footer, width = 620, tone }) {
  useEsc(onClose)
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-h">
          {I && <span className={cx('modal-ic', tone && 'tone-' + tone)}><I size={20} /></span>}
          <div className="grow"><h3>{title}</h3>{sub && <p className="muted">{sub}</p>}</div>
          <button className="iconbtn" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </header>
        <div className="modal-b">{children}</div>
        {footer && <footer className="modal-f">{footer}</footer>}
      </div>
    </div>
  )
}

export function Drawer({ title, sub, badge, onClose, children, actions, wide }) {
  useEsc(onClose)
  return (
    <div className="scrim scrim-side" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className={cx('drawer', wide && 'drawer-wide')} role="dialog" aria-modal="true" aria-label={title}>
        <header className="drawer-h">
          <div className="grow">
            <div className="drawer-title"><h2>{title}</h2>{badge}</div>
            {sub && <p className="muted">{sub}</p>}
          </div>
          {actions}
          <button className="iconbtn" onClick={onClose} aria-label="Close"><X size={22} /></button>
        </header>
        <div className="drawer-b">{children}</div>
      </aside>
    </div>
  )
}

/** Page title with a one-line plain explanation and an optional "how this works" box. */
export function PageHeader({ title, ar, desc, how, actions }) {
  const { db } = useApp()
  const [open, setOpen] = useState(false)
  return (
    <div className="ph">
      <div className="ph-top">
        <div className="grow">
          <div className="ph-title"><h1>{title}</h1>{ar && <span className="ar">{ar}</span>}</div>
          <p className="ph-desc">{desc}</p>
        </div>
        {actions && <div className="ph-actions">{actions}</div>}
      </div>
      {how && db.settings.showHowTo && (
        <div className={cx('howto', open && 'open')}>
          <button className="howto-btn" onClick={() => setOpen(!open)}><Info size={16} /> How this page works <ChevronDown size={16} className="chev" /></button>
          {open && <ol className="howto-list">{how.map((h, i) => <li key={i}><span className="n">{i + 1}</span><span>{h}</span></li>)}</ol>}
        </div>
      )}
    </div>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={cx('tab', value === t.id && 'on')} onClick={() => onChange(t.id)}>
          {t.icon && <t.icon size={16} />}<span>{t.label}</span>{t.count != null && <em className={cx('tcount', t.alert && 'alert')}>{t.count}</em>}
        </button>
      ))}
    </div>
  )
}

export function Empty({ icon: I = Info, title, text, action }) {
  return <div className="empty">{I && <span className="empty-ic"><I size={26} /></span>}<b>{title}</b>{text && <p>{text}</p>}{action}</div>
}

export function Field({ label, hint, children, span }) {
  return <label className={cx('field', span && 'span-' + span)}><span className="field-l">{label}</span>{children}{hint && <span className="field-h">{hint}</span>}</label>
}

export const AiTag = ({ children = 'AI' }) => <span className="aitag"><Sparkles size={12} />{children}</span>

// ---------- documents ----------
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) }
/** Sample documents in the demo are drawn as SVG "cards" so View/Download always work. */
export function sampleSvg(ref) {
  const rows = ref.rows.map(([k, v], i) => `<text x="40" y="${200 + i * 46}" font-size="15" fill="#6b7078">${esc(k)}</text><text x="230" y="${200 + i * 46}" font-size="17" font-weight="600" fill="#1d1f23">${esc(v)}</text><line x1="40" x2="560" y1="${214 + i * 46}" y2="${214 + i * 46}" stroke="#e6e7ea"/>`).join('')
  const h = 260 + ref.rows.length * 46
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${h}" viewBox="0 0 600 ${h}" font-family="Segoe UI, Arial, sans-serif"><rect width="600" height="${h}" rx="18" fill="#fff"/><rect width="600" height="84" rx="18" fill="#1f2125"/><rect y="66" width="600" height="18" fill="#1f2125"/><rect y="84" width="600" height="6" fill="#c8102e"/><text x="40" y="38" font-size="13" fill="#b9bdc4" letter-spacing="1.5">KINGDOM OF SAUDI ARABIA</text><text x="560" y="38" font-size="15" fill="#b9bdc4" text-anchor="end">المملكة العربية السعودية</text><text x="40" y="64" font-size="12" fill="#8a8f97">Sample document · T&amp;I Control Room demo</text><text x="40" y="140" font-size="26" font-weight="700" fill="#1d1f23">${esc(ref.title)}</text>${rows}<g transform="translate(470 ${h - 70}) rotate(-12)"><rect x="-62" y="-24" width="124" height="44" rx="8" fill="none" stroke="#c8102e" stroke-width="2.5" opacity=".55"/><text x="0" y="6" text-anchor="middle" font-size="17" font-weight="700" fill="#c8102e" opacity=".6" letter-spacing="3">SAMPLE</text></g></svg>`
}
export function fileUrl(ref) {
  if (!ref) return null
  if (ref.sample) return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sampleSvg(ref))
  return readFileData(ref)
}
export function downloadRef(ref) {
  const url = fileUrl(ref)
  if (!url) return false
  const a = document.createElement('a')
  a.href = url
  a.download = ref.sample ? ref.name.replace(/\.pdf$/, '.svg') : ref.name
  document.body.appendChild(a); a.click(); a.remove()
  return true
}

export function DocViewer({ fileRef, title, onClose }) {
  const url = fileUrl(fileRef)
  const isPdf = fileRef && !fileRef.sample && (fileRef.type === 'application/pdf' || /\.pdf$/i.test(fileRef.name))
  return (
    <Modal title={title} sub={fileRef?.name} icon={FileText} onClose={onClose} width={760}
      footer={<><Btn kind="ghost" onClick={onClose}>Close</Btn><Btn icon={Download} onClick={() => downloadRef(fileRef)}>Download</Btn></>}>
      <div className="docview">
        {!url ? <Empty title="File not available" text="This file was attached in an earlier session and was too large to keep. Upload it again." />
          : isPdf ? <iframe title={title} src={url} /> : <img src={url} alt={title} />}
      </div>
    </Modal>
  )
}

/** One document "slot": shows if uploaded, and lets you view, download or upload/replace. */
export function FileSlot({ label, fileRef, onUpload, reads }) {
  const { open, toast } = useApp()
  const input = useRef()
  const has = !!fileRef
  const isImg = fileRef && (fileRef.sample || /^image\//.test(fileRef.type))
  return (
    <div className={cx('slot', has ? 'has' : 'none')}>
      <span className="slot-ic">{has ? (isImg ? <ImageIcon size={20} /> : <FileText size={20} />) : <Upload size={20} />}</span>
      <div className="grow slot-t">
        <b>{label}{reads && <AiTag>reads date</AiTag>}</b>
        <span className="muted">{has ? <><CheckCircle2 size={13} className="okc" /> {fileRef.sample ? 'Sample on file' : fileRef.name}</> : 'Not uploaded yet · JPG or PDF'}</span>
      </div>
      <div className="slot-a">
        {has && <button className="iconbtn sm" title="View" onClick={() => open('doc', { fileRef, title: label })}><Eye size={17} /></button>}
        {has && <button className="iconbtn sm" title="Download" onClick={() => { if (!downloadRef(fileRef)) toast('File not available', 'warn') }}><Download size={17} /></button>}
        <button className={cx('btn', has ? 'btn-ghost' : 'btn-soft', 'btn-sm')} onClick={() => input.current.click()}><Upload size={15} /><span>{has ? 'Replace' : 'Upload'}</span></button>
        <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) onUpload(f) }} />
      </div>
    </div>
  )
}

/** Small inline SVG bar chart, two series. */
export function MiniBars({ data, height = 150 }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]))
  const w = 100 / data.length
  return (
    <svg className="minibars" viewBox={`0 0 100 ${height / 3}`} preserveAspectRatio="none" style={{ height }}>
      {data.map((d, i) => {
        const H = height / 3 - 6
        const ha = (d.a / max) * H, hb = (d.b / max) * H
        return (
          <g key={i}>
            <rect x={i * w + w * 0.14} y={H - ha + 2} width={w * 0.33} height={Math.max(ha, 0.4)} rx="0.6" className="bar-in"><title>{`${d.label}: ${d.a} in`}</title></rect>
            <rect x={i * w + w * 0.52} y={H - hb + 2} width={w * 0.33} height={Math.max(hb, 0.4)} rx="0.6" className="bar-out"><title>{`${d.label}: ${d.b} out`}</title></rect>
          </g>
        )
      })}
    </svg>
  )
}

export function Ring({ value, total, size = 120, label }) {
  const r = 46, c = 2 * Math.PI * r
  const pct = total ? Math.min(1, value / total) : 0
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 110 110"><circle cx="55" cy="55" r={r} className="ring-bg" /><circle cx="55" cy="55" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} /></svg>
      <div className="ring-t"><b>{value}</b>{label && <span>{label}</span>}</div>
    </div>
  )
}
