'use client'

import { useState } from 'react'
import { newCitationId, normalizeCitationUrl } from '../lib/citations.js'

const today = () => new Date().toISOString().slice(0, 10)
const emptyForm = () => ({
  title: '',
  publisher: '',
  author: '',
  url: '',
  publishedAt: '',
  accessedAt: today(),
})

export default function CitationManager({ citations, onChange, onInsert, showToast }) {
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [open, setOpen] = useState(false)

  const updateField = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const reset = () => {
    setForm(emptyForm())
    setEditingId(null)
    setOpen(false)
  }

  const save = () => {
    const url = normalizeCitationUrl(form.url)
    if (!form.title.trim()) {
      showToast?.('Add a source title.')
      return
    }
    if (!url) {
      showToast?.('Enter a safe http or https source URL.')
      return
    }
    const citation = {
      id: editingId || newCitationId(),
      title: form.title.trim(),
      publisher: form.publisher.trim(),
      author: form.author.trim(),
      url,
      publishedAt: form.publishedAt || null,
      accessedAt: form.accessedAt || null,
    }
    const next = editingId
      ? citations.map((item) => item.id === editingId ? citation : item)
      : [...citations, citation]
    onChange(next)
    reset()
    showToast?.(editingId ? 'Source updated.' : 'Source added. Insert it where the claim appears.')
  }

  const edit = (citation) => {
    setEditingId(citation.id)
    setForm({
      title: citation.title || '',
      publisher: citation.publisher || '',
      author: citation.author || '',
      url: citation.url || '',
      publishedAt: citation.publishedAt || '',
      accessedAt: citation.accessedAt || '',
    })
    setOpen(true)
  }

  const remove = (citation) => {
    if (!window.confirm(`Remove “${citation.title}” and every inline reference to it?`)) return
    onChange(citations.filter((item) => item.id !== citation.id))
  }

  const move = (index, direction) => {
    const destination = index + direction
    if (destination < 0 || destination >= citations.length) return
    const next = [...citations]
    const moved = next[index]
    next[index] = next[destination]
    next[destination] = moved
    onChange(next)
  }

  return (
    <div>
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
        <div>
          <h3 className="font-serif text-xl font-medium">Sources &amp; Citations</h3>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-soft)' }}>Sources and inline reference numbers are sealed when the thesis is published.</p>
        </div>
        {!open && citations.length < 50 && (
          <button type="button" onClick={() => setOpen(true)} className="btn-secondary text-xs px-3 py-2 rounded-md inline-flex items-center gap-1.5">
            <i className="icon-plus text-xs"></i> Add source
          </button>
        )}
      </div>

      {open && (
        <div className="p-4 border rounded-md mb-5" style={{ borderColor: 'var(--border-strong)', background: 'var(--bg-warm)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="sm:col-span-2 text-xs">
              <span className="block font-medium mb-1">Source title *</span>
              <input value={form.title} maxLength={300} onChange={(event) => updateField('title', event.target.value)} className="w-full input-bordered rounded px-3 py-2 text-sm" placeholder="Article, filing, report, or dataset title" />
            </label>
            <label className="text-xs">
              <span className="block font-medium mb-1">Publisher</span>
              <input value={form.publisher} maxLength={160} onChange={(event) => updateField('publisher', event.target.value)} className="w-full input-bordered rounded px-3 py-2 text-sm" placeholder="Company, journal, or publication" />
            </label>
            <label className="text-xs">
              <span className="block font-medium mb-1">Author</span>
              <input value={form.author} maxLength={160} onChange={(event) => updateField('author', event.target.value)} className="w-full input-bordered rounded px-3 py-2 text-sm" placeholder="Optional author" />
            </label>
            <label className="sm:col-span-2 text-xs">
              <span className="block font-medium mb-1">URL *</span>
              <input value={form.url} onChange={(event) => updateField('url', event.target.value)} className="w-full input-bordered rounded px-3 py-2 text-sm" placeholder="https://example.com/source" inputMode="url" />
            </label>
            <label className="text-xs">
              <span className="block font-medium mb-1">Publication date</span>
              <input type="date" value={form.publishedAt} onChange={(event) => updateField('publishedAt', event.target.value)} className="w-full input-bordered rounded px-3 py-2 text-sm" />
            </label>
            <label className="text-xs">
              <span className="block font-medium mb-1">Accessed date</span>
              <input type="date" value={form.accessedAt} onChange={(event) => updateField('accessedAt', event.target.value)} className="w-full input-bordered rounded px-3 py-2 text-sm" />
            </label>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={reset} className="btn-secondary text-xs px-3 py-1.5 rounded-md">Cancel</button>
            <button type="button" onClick={save} className="btn-primary text-xs px-3 py-1.5 rounded-md">{editingId ? 'Save changes' : 'Add source'}</button>
          </div>
        </div>
      )}

      {!citations.length && !open && (
        <div className="p-8 border border-dashed rounded-md text-center" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
          <i className="icon-book-open text-xl"></i>
          <p className="text-sm mt-2">No sources yet.</p>
          <p className="text-xs mt-1">Add evidence, then insert its number beside a claim in the Thesis tab.</p>
        </div>
      )}

      <ol className="space-y-3">
        {citations.map((citation, index) => (
          <li key={citation.id} className="p-4 border rounded-md flex items-start gap-3" style={{ borderColor: 'var(--border)', background: 'white' }}>
            <span className="w-7 h-7 rounded flex items-center justify-center font-mono text-xs font-semibold shrink-0" style={{ background: 'var(--bg-warm)', color: 'var(--ink)' }}>{index + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{citation.title}</div>
              <div className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>{[citation.author, citation.publisher, citation.publishedAt].filter(Boolean).join(' · ')}</div>
              <a href={citation.url} target="_blank" rel="noopener noreferrer" className="block text-[11px] font-mono truncate mt-1 hover:underline" style={{ color: 'var(--bull)' }}>{citation.url}</a>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="toolbar-btn" aria-label="Move source up"><i className="icon-chevron-up text-xs"></i></button>
              <button type="button" disabled={index === citations.length - 1} onClick={() => move(index, 1)} className="toolbar-btn" aria-label="Move source down"><i className="icon-chevron-down text-xs"></i></button>
              <button type="button" onClick={() => onInsert(citation, index + 1)} className="btn-secondary text-[11px] px-2 py-1 rounded">Cite</button>
              <button type="button" onClick={() => edit(citation)} className="toolbar-btn" aria-label="Edit source"><i className="icon-pencil text-xs"></i></button>
              <button type="button" onClick={() => remove(citation)} className="toolbar-btn" aria-label="Remove source"><i className="icon-trash-2 text-xs"></i></button>
            </div>
          </li>
        ))}
      </ol>
      {citations.length >= 50 && <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>This thesis has reached the 50-source limit.</p>}
    </div>
  )
}
