import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { sampleDB, uid, DEFAULT_SETTINGS } from './data'

/* Single app store. The whole demo runs in the browser; data is saved to localStorage
   so the manager's changes survive a refresh. Uploaded files are stored separately. */

const KEY = 'ti-control-v1'
const FILE_KEY = 'ti-control-file-'
const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const db = JSON.parse(raw)
      if (db && db.version === 1) { db.settings = { ...DEFAULT_SETTINGS, ...db.settings, periods: { ...DEFAULT_SETTINGS.periods, ...(db.settings?.periods || {}) } }; return db }
    }
  } catch { /* storage unavailable — fall back to sample data */ }
  return sampleDB()
}

const fileCache = new Map()
export function readFileData(ref) {
  if (!ref || ref.sample) return null
  if (fileCache.has(ref.id)) return fileCache.get(ref.id)
  try { const d = localStorage.getItem(FILE_KEY + ref.id); if (d) { fileCache.set(ref.id, d); return d } } catch { /* ignore */ }
  return null
}

export function AppProvider({ children }) {
  const [db, setDb] = useState(load)
  const [toasts, setToasts] = useState([])
  const [route, setRoute] = useState(() => parseHash())
  const [stack, setStack] = useState([]) // overlays: drawers + modals, last one on top
  const [assistant, setAssistant] = useState({ open: false, seed: null })
  const saveT = useRef()

  useEffect(() => {
    clearTimeout(saveT.current)
    saveT.current = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* quota/private mode */ } }, 200)
  }, [db])

  useEffect(() => {
    const on = () => setRoute(parseHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const toast = useCallback((text, tone = 'ok') => {
    const id = uid('t')
    setToasts((t) => [...t, { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
  }, [])

  const update = useCallback((fn, logText, icon = 'edit') => {
    setDb((prev) => {
      const next = structuredClone(prev)
      fn(next)
      if (logText) next.activity = [{ id: uid('a'), at: new Date().toISOString(), text: logText, icon }, ...next.activity].slice(0, 200)
      return next
    })
  }, [])

  const go = useCallback((page, tab) => {
    const h = '#/' + page + (tab ? '/' + tab : '')
    if (location.hash !== h) location.hash = h
    else setRoute(parseHash())
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  /** Store an uploaded File; returns a small reference kept in the database. */
  const saveFile = useCallback((file) => new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const id = uid('f')
      const data = reader.result
      fileCache.set(id, data)
      let persisted = true
      try { localStorage.setItem(FILE_KEY + id, data) } catch { persisted = false }
      if (!persisted) toast('File attached. It is large, so it is kept for this session only.', 'warn')
      resolve({ id, name: file.name, type: file.type, size: file.size, at: new Date().toISOString() })
    }
    reader.readAsDataURL(file)
  }), [toast])

  const resetDemo = useCallback(() => {
    try { Object.keys(localStorage).filter((k) => k.startsWith(FILE_KEY)).forEach((k) => localStorage.removeItem(k)) } catch { /* ignore */ }
    fileCache.clear()
    const fresh = sampleDB()
    fresh.settings.tourDone = true
    setDb(fresh)
    toast('Demo data restored')
  }, [toast])

  const value = useMemo(() => ({
    db, update, route, go, toast, toasts, saveFile, resetDemo,
    stack, open: (type, props = {}) => setStack((s) => [...s, { key: uid('o'), type, ...props }]), close: () => setStack((s) => s.slice(0, -1)), closeAll: () => setStack([]),
    replace: (type, props = {}) => setStack((s) => [...s.slice(0, -1), { key: uid('o'), type, ...props }]),
    assistant, openAssistant: (seed = null) => setAssistant({ open: true, seed, n: Date.now() }), closeAssistant: () => setAssistant({ open: false, seed: null }),
  }), [db, update, route, go, toast, toasts, saveFile, resetDemo, stack, assistant])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function parseHash() {
  const [page, tab] = (location.hash || '').replace(/^#\/?/, '').split('/')
  return { page: page || 'home', tab: tab || null }
}
