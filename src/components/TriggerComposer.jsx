'use client'

import { useMemo, useRef, useState } from 'react'
import {
  TRIGGER_OPERATORS, OPERATOR_SUGGESTIONS, availablePeriods, metricIndex,
  latestMetric, formatMetricValue, suggestScale,
} from '../lib/triggers.js'

// A typed, autocompleting builder for one invalidation trigger. It reads as a
// natural sentence — "Total Revenue < 300B and > 200B quarterly" — but is fully
// structured: each accepted word is a token, and what you can type next is
// constrained by a small grammar (metric → operator → value → and/or/period).
// Mirrors the editor's "type / for commands" affordance.

const symbolOf = (op) => (TRIGGER_OPERATORS.find((o) => o.op === op) || {}).label || op
const periodLabel = (p) => (p === 'quarterly' ? 'Quarterly' : 'Annual')

// What kind of token may come next, given the tokens so far.
function expectedType(tokens) {
  const last = tokens[tokens.length - 1]
  if (!last) return 'metric'
  switch (last.type) {
    case 'metric': return 'op'
    case 'op': return 'value'
    case 'value': return 'tail'      // connector (and/or) or period — or stop
    case 'connector': return 'op'
    case 'period': return 'done'
    default: return 'metric'
  }
}

// Rebuild the token list from a stored/structured trigger (draft restore).
function tokensFromTrigger(t) {
  const toks = []
  if (!t?.metric) return toks
  toks.push({ type: 'metric', label: t.metric, statement: t.statement || 'income', kind: t.kind || 'money' })
  const comps = Array.isArray(t.comparisons) && t.comparisons.length
    ? t.comparisons
    : (t.op && t.value != null ? [{ op: t.op, value: t.value, scale: t.scale, connector: null }] : [])
  comps.forEach((c, i) => {
    if (i > 0) toks.push({ type: 'connector', connector: c.connector || 'and' })
    toks.push({ type: 'op', op: c.op })
    if (c.value != null && c.value !== '') toks.push({ type: 'value', value: Number(c.value), scale: c.scale || null })
  })
  if (t.period) toks.push({ type: 'period', period: t.period })
  return toks
}

// Fold the tokens back into the structured trigger the app stores/evaluates.
function triggerFromTokens(tokens, statements) {
  const metricTok = tokens.find((t) => t.type === 'metric')
  const periodTok = tokens.find((t) => t.type === 'period')
  const comparisons = []
  let connector = null
  for (const tok of tokens) {
    if (tok.type === 'connector') connector = tok.connector
    else if (tok.type === 'op') { comparisons.push({ op: tok.op, value: null, scale: null, connector }); connector = null }
    else if (tok.type === 'value') {
      const last = comparisons[comparisons.length - 1]
      if (last) { last.value = tok.value; last.scale = tok.scale }
    }
  }
  const statement = metricTok?.statement || 'income'
  const kind = metricTok?.kind || 'money'
  const period = periodTok?.period || (availablePeriods(statements, statement)[0]?.key || 'annual')
  const first = comparisons[0] || {}
  return {
    metric: metricTok?.label || '',
    statement, kind, period,
    currency: statements?.currency || '',
    comparisons,
    connectors: comparisons.slice(1).map((c) => c.connector || 'and'),
    op: first.op || '<',
    value: first.value ?? null,
    scale: first.scale || 'M',
  }
}

// Parse a typed threshold like "300", "1.5b", "28,770m" into { value, scale }.
// Money/share metrics accept an optional K/M/B suffix; per-share values are 1:1.
function parseValue(text, kind, suggestedScale) {
  const m = String(text).trim().replace(/,/g, '').match(/^(-?\d*\.?\d+)\s*([kmb])?$/i)
  if (!m) return null
  const value = Number(m[1])
  if (!Number.isFinite(value)) return null
  const scale = kind === 'perShare' ? null : (m[2] ? m[2].toUpperCase() : suggestedScale)
  return { value, scale }
}

const chipStyle = (bg, color) => ({ background: bg, color, borderRadius: 4, padding: '1px 6px', fontSize: 12, lineHeight: '18px', whiteSpace: 'nowrap' })

export default function TriggerComposer({ trigger, statements, onChange, onRemove }) {
  const [tokens, setTokens] = useState(() => tokensFromTrigger(trigger))
  const [input, setInput] = useState('')
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)

  const index = useMemo(() => metricIndex(statements), [statements])
  const metricTok = tokens.find((t) => t.type === 'metric')
  const expected = expectedType(tokens)
  const kind = metricTok?.kind || 'money'
  const currency = statements?.currency || ''

  // Latest reported figure for the chosen metric — used to suggest a scale and
  // to hint the current value while entering a threshold.
  const latest = metricTok
    ? latestMetric(statements, metricTok.statement, availablePeriods(statements, metricTok.statement)[0]?.key || 'annual', metricTok.label, 'M')
    : null
  const suggestedScale = latest ? suggestScale(latest.raw) : 'M'

  const commit = (nextTokens) => {
    setTokens(nextTokens)
    setInput('')
    setActive(0)
    onChange(triggerFromTokens(nextTokens, statements))
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const q = input.trim().toLowerCase()

  // Build the suggestion list for the current grammar slot. Each item can be
  // applied (keyboard or click) to append its token(s).
  const suggestions = useMemo(() => {
    if (expected === 'metric') {
      return index
        .filter((m) => !q || m.label.toLowerCase().includes(q))
        .slice(0, 8)
        .map((m) => ({
          key: `${m.statement}:${m.label}`,
          label: m.label,
          sub: m.statementLabel,
          apply: () => commit([...tokens, { type: 'metric', label: m.label, statement: m.statement, kind: m.kind }]),
        }))
    }
    if (expected === 'op') {
      return OPERATOR_SUGGESTIONS
        .filter((o) => !q || o.symbol === input.trim() || o.label.includes(q) || o.terms.some((term) => term.includes(q)))
        .map((o) => ({
          key: o.op,
          label: `${o.symbol}  ${o.label}`,
          apply: () => commit([...tokens, { type: 'op', op: o.op }]),
        }))
    }
    if (expected === 'value') {
      const parsed = parseValue(input, kind, suggestedScale)
      if (!parsed) return []
      const preview = formatMetricValue(parsed.value, kind, currency, parsed.scale)
      return [{
        key: 'value',
        label: `Use ${preview}`,
        sub: parsed.scale ? `${parsed.value} × ${parsed.scale}` : null,
        apply: () => commit([...tokens, { type: 'value', value: parsed.value, scale: parsed.scale }]),
      }]
    }
    if (expected === 'tail') {
      const items = [
        { key: 'and', label: 'and', sub: 'add another condition', apply: () => commit([...tokens, { type: 'connector', connector: 'and' }]) },
        { key: 'or', label: 'or', sub: 'either condition breaks it', apply: () => commit([...tokens, { type: 'connector', connector: 'or' }]) },
        ...availablePeriods(statements, metricTok?.statement || 'income').map((p) => ({
          key: p.key,
          label: p.label,
          sub: 'reporting cadence · finishes the rule',
          apply: () => commit([...tokens, { type: 'period', period: p.key }]),
        })),
      ]
      return items.filter((it) => !q || it.label.toLowerCase().includes(q))
    }
    return []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expected, q, input, tokens, index, kind, suggestedScale, currency])

  const removeLast = () => {
    if (!tokens.length) return
    commit(tokens.slice(0, -1))
  }

  const onKeyDown = (e) => {
    if (e.key === 'Backspace' && input === '') {
      e.preventDefault()
      removeLast()
      return
    }
    if (e.key === 'Escape') { setOpen(false); return }
    if (!suggestions.length) {
      // In value mode an unparseable entry has no suggestion; Enter does nothing.
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp')) e.preventDefault()
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % suggestions.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + suggestions.length) % suggestions.length) }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      suggestions[Math.min(active, suggestions.length - 1)]?.apply()
    }
  }

  const placeholder = tokens.length === 0
    ? 'Start typing a line item — e.g. Revenue…'
    : expected === 'op' ? 'is greater than, less than…'
      : expected === 'value' ? 'a number — e.g. 300 or 1.5b…'
        : expected === 'tail' ? 'and · or · a reporting period…'
          : expected === 'done' ? '' : 'type…'

  const promptFor = {
    metric: 'Pick a financial line item to watch',
    op: 'Choose a comparison',
    value: `Enter a threshold${latest ? ` — latest is ${formatMetricValue(latest.value, latest.kind, currency, latest.scale)}` : ''}`,
    tail: 'Chain another condition, set the reporting period, or leave it',
    done: 'Rule complete',
  }[expected]

  return (
    <div className="border rounded-md" style={{ borderColor: 'var(--border)', background: 'white', position: 'relative' }}>
      <div className="flex flex-wrap items-center gap-1.5 p-2.5" onClick={() => inputRef.current?.focus()}>
        <i className="icon-target text-sm shrink-0" style={{ color: 'var(--muted)' }}></i>

        {tokens.map((tok, i) => {
          if (tok.type === 'metric') return <span key={i} style={chipStyle('var(--bg-warm)', 'var(--ink)')} className="font-medium">{tok.label}</span>
          if (tok.type === 'op') return <span key={i} className="font-mono" style={chipStyle('var(--bg-warm)', 'var(--ink-soft)')}>{symbolOf(tok.op)}</span>
          if (tok.type === 'value') return <span key={i} className="font-mono" style={chipStyle('var(--bg-warm)', 'var(--ink-soft)')}>{tok.value}{tok.scale || ''}</span>
          if (tok.type === 'connector') return <span key={i} className="font-mono uppercase text-[10px]" style={chipStyle('transparent', 'var(--muted)')}>{tok.connector}</span>
          if (tok.type === 'period') return <span key={i} style={chipStyle('var(--bg-warm)', 'var(--ink-soft)')}>{periodLabel(tok.period)}</span>
          return null
        })}

        {expected !== 'done' && (
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); setActive(0); setOpen(true) }}
            onKeyDown={onKeyDown}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            placeholder={placeholder}
            className="flex-1 min-w-[140px] text-sm outline-none bg-transparent"
            style={{ color: 'var(--ink)' }}
          />
        )}
        {expected === 'done' && <span className="flex-1 min-w-[40px]" />}

        <button onClick={onRemove} className="toolbar-btn shrink-0" aria-label="Remove trigger"><i className="icon-x text-xs"></i></button>
      </div>

      {open && expected !== 'done' && (
        <div className="absolute left-0 right-0 z-30 mt-1 border rounded-md shadow-lg overflow-hidden" style={{ borderColor: 'var(--border-strong)', background: 'white', top: '100%' }}>
          <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider border-b" style={{ color: 'var(--muted)', borderColor: 'var(--border)', background: 'var(--bg-warm)' }}>{promptFor}</div>
          {suggestions.length === 0 ? (
            <div className="px-3 py-2.5 text-xs" style={{ color: 'var(--muted)' }}>
              {expected === 'value' ? 'Type a number, optionally with K, M, or B (e.g. 1.5b).' : 'No matches — keep typing.'}
            </div>
          ) : (
            suggestions.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); s.apply() }}
                onMouseEnter={() => setActive(i)}
                className="w-full text-left px-3 py-2 flex items-center justify-between gap-3"
                style={{ background: i === active ? 'var(--bg-warm)' : 'transparent', cursor: 'pointer' }}
              >
                <span className="text-sm" style={{ color: 'var(--ink)' }}>{s.label}</span>
                {s.sub && <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--muted)' }}>{s.sub}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
