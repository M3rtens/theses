import { useEffect, useRef, useState } from 'react'

// Type-ahead security picker backed by /api/search (Yahoo Finance). Shows the
// chosen listing as a chip; clicking it (or the × ) drops back into search. The
// chosen listing keeps Yahoo's own symbol (e.g. ASML.AS) so the thesis prices in
// its native currency.
export default function SecuritySearch({ value, onSelect }) {
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)

  const boxRef = useRef(null)
  const inputRef = useRef(null)
  const debounce = useRef(null)
  const reqId = useRef(0)

  const showInput = editing || !value

  // Focus the field as soon as we drop into search mode.
  useEffect(() => {
    if (showInput) inputRef.current?.focus()
  }, [showInput])

  // Debounced search as the user types.
  useEffect(() => {
    const q = query.trim()
    clearTimeout(debounce.current)
    if (q.length < 1) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    debounce.current = setTimeout(async () => {
      const id = ++reqId.current
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        const rows = res.ok ? await res.json() : []
        if (id !== reqId.current) return // a newer keystroke superseded this one
        setResults(Array.isArray(rows) ? rows : [])
        setActive(0)
        setOpen(true)
      } catch {
        if (id === reqId.current) setResults([])
      } finally {
        if (id === reqId.current) setLoading(false)
      }
    }, 250)
    return () => clearTimeout(debounce.current)
  }, [query])

  // Close on outside click: commit back to the existing chip if one exists.
  useEffect(() => {
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setOpen(false)
        setEditing(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const startEditing = () => {
    setQuery('')
    setResults([])
    setOpen(false)
    setEditing(true)
  }

  const choose = (sec) => {
    onSelect(sec)
    setQuery('')
    setResults([])
    setOpen(false)
    setEditing(false)
  }

  const clear = () => {
    onSelect(null)
    startEditing()
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); setEditing(false); return }
    if (!open || !results.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[active]) }
  }

  // Selected state — a clickable chip. Clicking anywhere on it re-opens search.
  if (!showInput) {
    return (
      <button
        type="button"
        onClick={startEditing}
        title="Click to change security"
        className="flex items-center gap-2 px-2.5 py-1 input-bordered rounded"
        style={{ background: 'white', cursor: 'pointer' }}
      >
        <span className="font-mono text-sm font-semibold">{value.symbol}</span>
        <span className="text-xs truncate max-w-[200px]" style={{ color: 'var(--ink-soft)' }}>{value.name}</span>
        {value.exchange && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-warm)', color: 'var(--muted)' }}>{value.exchange}</span>
        )}
        <i className="icon-pencil text-[11px] ml-0.5" style={{ color: 'var(--muted)' }}></i>
      </button>
    )
  }

  return (
    <div ref={boxRef} className="relative" style={{ width: '320px' }}>
      <div className="flex items-center gap-2 px-2.5 py-1 input-bordered rounded" style={{ background: 'white' }}>
        <i className="icon-search text-xs" style={{ color: 'var(--muted)' }}></i>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (results.length) setOpen(true) }}
          onKeyDown={onKeyDown}
          placeholder="Search ticker or company…"
          className="input-clean text-sm flex-1"
          autoComplete="off"
        />
        {loading && <i className="icon-loader-circle text-xs animate-spin" style={{ color: 'var(--muted)' }}></i>}
        {value && (
          <button type="button" onClick={clear} className="toolbar-btn" title="Clear">
            <i className="icon-x text-xs"></i>
          </button>
        )}
      </div>

      {open && (results.length > 0 || (!loading && query.trim())) && (
        <div
          className="absolute z-40 mt-1 w-full max-h-72 overflow-y-auto border rounded-md"
          style={{ borderColor: 'var(--border-strong)', background: 'white', boxShadow: '0 12px 32px rgba(0,0,0,0.12)' }}
        >
          {results.length === 0 ? (
            <div className="px-3 py-2.5 text-xs" style={{ color: 'var(--muted)' }}>No matches for “{query.trim()}”.</div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.symbol}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(r)}
                className="w-full text-left px-3 py-2 flex items-center gap-3"
                style={{ background: i === active ? 'var(--bg-warm)' : 'transparent', cursor: 'pointer', border: 'none' }}
              >
                <span className="font-mono text-sm font-semibold w-16 shrink-0">{r.symbol}</span>
                <span className="text-sm truncate flex-1" style={{ color: 'var(--ink)' }}>{r.name}</span>
                <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--muted)' }}>{[r.type, r.exchange].filter(Boolean).join(' · ')}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
