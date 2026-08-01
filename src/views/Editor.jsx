import { useEffect, useRef, useState } from 'react'
import SecuritySearch from '../components/SecuritySearch.jsx'
import { useUser } from '../components/UserProvider.jsx'
import { useData } from '../components/DataProvider.jsx'
import { SECTORS } from '../lib/sectors.js'
import { fmtPrice, currencySymbol } from '../lib/format.js'
import {
  deleteDraft as deleteLocalDraft,
  hasDraftContent,
  markDraftSynced,
  saveDraft as persistLocalDraft,
} from '../lib/drafts.js'
import SpreadsheetEditor from '../components/SpreadsheetEditor.jsx'
import ThesisEditor from '../components/ThesisEditor.jsx'
import { latestMetric, formatMetricValue, triggerLabel, evaluateTrigger, comparisonsOf } from '../lib/triggers.js'
import TriggerComposer from '../components/TriggerComposer.jsx'

const DOCX_MAX_BYTES = 8 * 1024 * 1024
const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const STMT_TABS = [
  { key: 'income', label: 'Income Statement' },
  { key: 'balance', label: 'Balance Sheet' },
  { key: 'cashflow', label: 'Cash Flow' },
]

// Live status chip styling for a trigger being built against fetched financials.
const TRIGGER_STATUS_STYLE = {
  breached: { label: 'BREACHED', color: 'var(--bear)', soft: 'var(--bear-soft)' },
  warning: { label: 'WARNING', color: 'var(--warn)', soft: 'var(--warn-soft)' },
  clear: { label: 'CLEAR', color: 'var(--bull)', soft: 'var(--bull-soft)' },
}

// Kept only temporarily while the original mockup is retired from the source.
const showLegacyModel = false

const dateValue = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const localDateValue = () => {
  return dateValue(new Date())
}

const dateFromValue = (value) => {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

const formatPublicationDate = (value) => dateFromValue(value).toLocaleDateString('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

async function readDraftResponse(response) {
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.error || `HTTP ${response.status}`)
    error.status = response.status
    error.current = data?.current
    throw error
  }
  return data
}

export default function Editor({ draft = null, navigate, showToast, onOpenPublish }) {
  const user = useUser()
  const { loadDrafts } = useData()
  // Rebuild the internal trigger shape from a saved draft's structured rows.
  const draftTriggers = draft?.triggers?.length
    ? draft.triggers.map((t, i) => ({
        id: i + 1,
        metric: t.metric || '',
        statement: t.statement || 'income',
        kind: t.kind || 'money',
        period: t.period || 'annual',
        currency: t.currency || '',
        comparisons: Array.isArray(t.comparisons) && t.comparisons.length
          ? t.comparisons
          : (t.op && t.value != null ? [{ op: t.op, value: Number(t.value), scale: t.scale || 'M', connector: null }] : []),
        connectors: Array.isArray(t.connectors) ? t.connectors : [],
        op: t.op || '<',
        value: t.value ?? null,
        scale: t.scale || 'M',
      }))
    : null

  const [side, setSide] = useState(draft?.side || 'bull')
  const [activeTab, setActiveTab] = useState('thesis')
  const [triggers, setTriggers] = useState(draftTriggers || [])
  const [dragging, setDragging] = useState(false)
  const [importingDocument, setImportingDocument] = useState(false)
  const scheduledPublicationId = draft?.scheduledPublicationId || null
  const [localDraftId, setLocalDraftId] = useState(
    scheduledPublicationId ? null : (draft?.localDraftId || (!draft?.cloudDraftId ? draft?.id : null) || null),
  )
  const [cloudDraftId, setCloudDraftId] = useState(draft?.cloudDraftId || null)
  const [cloudDraftVersion, setCloudDraftVersion] = useState(draft?.cloudDraftVersion || null)
  const [saveStatus, setSaveStatus] = useState(() => (
    scheduledPublicationId || draft?.cloudDraftId ? 'saved' : draft?.offline ? 'offline' : 'idle'
  ))
  const [editRevision, setEditRevision] = useState(0)
  const [security, setSecurity] = useState(() => {
    if (draft) {
      return draft.ticker && draft.ticker !== '—'
        ? { symbol: draft.ticker, name: draft.company || draft.ticker, exchange: '' }
        : null
    }
    return null
  })
  const [preview, setPreview] = useState(null)     // live price/financials for the selected security
  const [previewLoading, setPreviewLoading] = useState(false)
  const [statements, setStatements] = useState(null) // full financial statements
  const [stmtLoading, setStmtLoading] = useState(false)
  const [stmtView, setStmtView] = useState('income')      // income | balance | cashflow
  const [stmtPeriod, setStmtPeriod] = useState('annual')  // annual | quarterly
  const [model, setModel] = useState(draft?.model || null)
  const [useFuturePublication, setUseFuturePublication] = useState(Boolean(draft?.scheduledPublicationDate))
  const [scheduledPublicationDate, setScheduledPublicationDate] = useState(
    draft?.scheduledPublicationDate || draft?.lastScheduledPublicationDate || localDateValue(),
  )
  const [publicationCalendarOpen, setPublicationCalendarOpen] = useState(false)
  const [publicationCalendarMonth, setPublicationCalendarMonth] = useState(() => {
    const selected = dateFromValue(
      draft?.scheduledPublicationDate || draft?.lastScheduledPublicationDate || localDateValue(),
    )
    return new Date(selected.getFullYear(), selected.getMonth(), 1)
  })

  const thesisEditorRef = useRef(null)
  const titleRef = useRef(null)
  const sectorRef = useRef(null)
  const dragCounter = useRef(0)
  const documentInputRef = useRef(null)
  const stmtSymbol = useRef(null)  // symbol the loaded statements belong to
  const publicationDatePickerRef = useRef(null)
  const localDraftIdRef = useRef(localDraftId)
  const cloudDraftIdRef = useRef(cloudDraftId)
  const cloudDraftVersionRef = useRef(cloudDraftVersion)
  const saveQueueRef = useRef(Promise.resolve())
  const autosaveRef = useRef(null)
  const latestDraftRef = useRef(null)
  const editRevisionRef = useRef(0)
  const lastLocalRevisionRef = useRef(0)

  const markDirty = () => {
    editRevisionRef.current += 1
    setEditRevision(editRevisionRef.current)
  }

  useEffect(() => {
    if (!publicationCalendarOpen) return
    const closeOnOutsideClick = (event) => {
      if (!publicationDatePickerRef.current?.contains(event.target)) setPublicationCalendarOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setPublicationCalendarOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [publicationCalendarOpen])

  // Whenever the chosen security changes, pull its live price + financials so the
  // Entry Price Lock and Financials panels preview exactly what will be sealed.
  useEffect(() => {
    const symbol = security?.symbol
    if (!symbol) { setPreview(null); return }
    let cancelled = false
    setPreviewLoading(true)
    setPreview(null)
    fetch(`/api/thesis?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (!cancelled && d && !d.error) setPreview(d) })
      .catch(() => { if (!cancelled) setPreview(null) })
      .finally(() => { if (!cancelled) setPreviewLoading(false) })
    return () => { cancelled = true }
  }, [security?.symbol])

  // Load full statements whenever a security is selected. They feed both the
  // Financials tab and the invalidation-trigger builder (which ties each trigger
  // to a real statement line item), so they can't wait for the tab to open.
  useEffect(() => {
    const symbol = security?.symbol
    if (!symbol) { setStatements(null); stmtSymbol.current = null; return }
    if (stmtSymbol.current === symbol) return // already loaded for this symbol
    let cancelled = false
    setStmtLoading(true)
    setStatements(null)
    fetch(`/api/financials?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (!cancelled && d && !d.error) { setStatements(d); stmtSymbol.current = symbol } })
      .catch(() => { if (!cancelled) stmtSymbol.current = null })
      .finally(() => { if (!cancelled) setStmtLoading(false) })
    return () => { cancelled = true }
  }, [security?.symbol])

  // Format a raw statement value for display. money → millions (accounting
  // parentheses for negatives); perShare → currency + 2dp; shares → millions.
  const fmtCell = (v, kind) => {
    if (v == null) return '—'
    if (kind === 'perShare') {
      return currencySymbol(statements?.currency) + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
    if (kind === 'shares') return (v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'M'
    const m = v / 1e6
    const s = Math.abs(m).toLocaleString('en-US', { maximumFractionDigits: 0 })
    return m < 0 ? `(${s})` : s
  }

  const activeStmt = statements?.[stmtView]?.[stmtPeriod]

  // A trigger's usable comparisons — those with a finite threshold.
  const validComparisons = (t) => comparisonsOf(t).filter((c) => Number.isFinite(Number(c.value)))

  // Serialise one editor trigger into its stored form. Carries the structured
  // fields (metric/statement/period/comparisons) so it can be re-evaluated against
  // live financials, plus a human-readable label `c` and its current status `s`.
  const toStoredTrigger = (t) => {
    const currency = t.currency || statements?.currency || ''
    const comparisons = validComparisons(t).map((c) => ({ op: c.op, value: Number(c.value), scale: c.scale || 'M', connector: c.connector || null }))
    const first = comparisons[0] || {}
    const structured = {
      metric: t.metric || '', statement: t.statement || 'income', period: t.period || 'annual',
      kind: t.kind || 'money', currency, comparisons,
      connectors: comparisons.slice(1).map((c) => c.connector || 'and'),
      op: first.op || '<', value: first.value ?? null, scale: first.scale || 'M',
    }
    const complete = Boolean(t.metric) && comparisons.length > 0
    const { status } = complete ? evaluateTrigger({ ...structured, s: 'clear' }, statements) : { status: 'clear' }
    return {
      ...structured,
      c: complete ? triggerLabel(structured) : (t.metric || 'Incomplete trigger'),
      s: status,
    }
  }

  const triggerIncomplete = (t) => !t.metric || validComparisons(t).length === 0

  // Gather the editor's fields into the payload the create endpoint expects.
  const buildThesis = () => ({
    title: titleRef.current?.value?.trim() || '',
    ticker: security?.symbol?.trim().toUpperCase() || '',
    company: security?.name?.trim() || '',
    sector: sectorRef.current?.value || '',
    side,
    body: thesisEditorRef.current?.getHTML() || '',
    triggers: triggers.map(toStoredTrigger),
    model,
    scheduledPublicationDate: useFuturePublication ? scheduledPublicationDate : null,
  })

  const openPublish = async () => {
    const draft = buildThesis()
    if (!draft.title || !draft.ticker) {
      showToast('Add a title and select a security before publishing.')
      return
    }
    if (triggers.some(triggerIncomplete)) {
      showToast('Finish each trigger — pick a line item and enter a threshold — or remove it before publishing.')
      return
    }
    // Flush any queued autosave first so successful publication can clean up
    // the exact cloud row, including a draft that was just created.
    if (!scheduledPublicationId) await queueOrdinarySave(draft)
    // Carry the draft id (if this thesis was saved as a draft) so it can be
    // removed once publishing succeeds. The create API ignores this field.
    onOpenPublish({
      ...draft,
      draftId: scheduledPublicationId ? null : localDraftIdRef.current,
      localDraftId: scheduledPublicationId ? null : localDraftIdRef.current,
      cloudDraftId: scheduledPublicationId ? null : cloudDraftIdRef.current,
      cloudDraftVersion: scheduledPublicationId ? null : cloudDraftVersionRef.current,
      scheduledPublicationId,
    })
  }

  const handleDocumentImport = async (file) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.docx')) {
      showToast('Only .docx Word documents are supported.')
      return
    }
    if (!file.size) {
      showToast('That DOCX file is empty.')
      return
    }
    if (file.size > DOCX_MAX_BYTES) {
      showToast('DOCX files must be 8 MB or smaller.')
      return
    }

    setImportingDocument(true)
    showToast(`Importing "${file.name}"…`)
    try {
      const response = await fetch('/api/import/docx', {
        method: 'POST',
        headers: {
          'content-type': DOCX_CONTENT_TYPE,
          'x-file-name': encodeURIComponent(file.name),
        },
        body: file,
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Document import failed')

      setActiveTab('thesis')
      if (!thesisEditorRef.current?.insertHTML(data.html)) throw new Error('Thesis editor is unavailable')
      requestAnimationFrame(() => thesisEditorRef.current?.focus())
      const warningNote = data.warningCount
        ? ` · ${data.warningCount} unsupported item${data.warningCount === 1 ? '' : 's'} simplified`
        : ''
      showToast(`Imported ${file.name} · ${data.wordCount} word${data.wordCount === 1 ? '' : 's'}${warningNote}`)
    } catch (error) {
      showToast(error.message || 'Document import failed')
    } finally {
      setImportingDocument(false)
      if (documentInputRef.current) documentInputRef.current.value = ''
    }
  }

  // Drag-and-drop of DOCX documents onto the editor view.
  const onDragEnter = (event) => {
    if (!event.dataTransfer?.types?.includes('Files')) return
    dragCounter.current++
    setDragging(true)
  }
  const onDragLeave = () => {
    dragCounter.current--
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setDragging(false)
    }
  }
  const onDrop = (e) => {
    e.preventDefault()
    dragCounter.current = 0
    setDragging(false)
    if (importingDocument) return
    handleDocumentImport(e.dataTransfer.files[0])
  }

  const addTrigger = () => {
    setTriggers(prev => {
      const id = prev.reduce((maxId, trigger) => {
        const triggerId = Number(trigger.id)
        return Number.isFinite(triggerId) ? Math.max(maxId, triggerId) : maxId
      }, 0) + 1
      return [...prev, { id, metric: '', statement: 'income', kind: 'money', period: '', currency: statements?.currency || '', comparisons: [], connectors: [] }]
    })
    markDirty()
  }
  const removeTrigger = (id) => {
    setTriggers(prev => prev.filter(t => t.id !== id))
    markDirty()
  }

  // The composer emits the fully structured trigger; merge it back, keeping id.
  const updateTriggerFromComposer = (id, structured) => {
    setTriggers(prev => prev.map(t => t.id === id ? { ...structured, id } : t))
    markDirty()
  }

  const persistOrdinaryDraft = async (built, manual, revision) => {
    if (!user?.id || !hasDraftContent(built)) return null
    setSaveStatus('saving')

    const local = persistLocalDraft(built, localDraftIdRef.current, user.id, {
      cloudDraftId: cloudDraftIdRef.current,
      cloudDraftVersion: cloudDraftVersionRef.current,
    })
    if (!local) {
      setSaveStatus('error')
      if (manual) showToast('Could not save the browser safety copy.')
      return null
    }
    localDraftIdRef.current = local.id
    setLocalDraftId(local.id)
    lastLocalRevisionRef.current = Math.max(lastLocalRevisionRef.current, revision)

    const acceptCloud = (saved, localId = local.id) => {
      cloudDraftIdRef.current = saved.cloudDraftId
      cloudDraftVersionRef.current = saved.cloudDraftVersion
      setCloudDraftId(saved.cloudDraftId)
      setCloudDraftVersion(saved.cloudDraftVersion)
      markDraftSynced(localId, user.id, saved)
      setSaveStatus('saved')
      return saved
    }

    const createCloud = async (draftToCreate, localId) => readDraftResponse(await fetch('/api/drafts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draft: draftToCreate, localId }),
    }))

    try {
      const wasNew = !cloudDraftIdRef.current
      const saved = cloudDraftIdRef.current
        ? await readDraftResponse(await fetch(`/api/drafts/${cloudDraftIdRef.current}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ draft: built, version: cloudDraftVersionRef.current || 1 }),
          }))
        : await createCloud(built, local.id)
      acceptCloud(saved)
      if (wasNew) loadDrafts()
      if (manual) showToast(`Draft saved to the cloud at ${new Date().toLocaleTimeString()}.`)
      return saved
    } catch (error) {
      if (error.status !== 409 || !error.current) {
        setSaveStatus('offline')
        if (manual) showToast('Cloud unavailable — draft saved safely in this browser.')
        return null
      }

      // The remote draft moved to a newer version. Restore that version under
      // its original identity, then continue the current editor as a new copy.
      const originalLocalId = local.id
      persistLocalDraft(error.current, originalLocalId, user.id, {
        cloudDraftId: error.current.cloudDraftId,
        cloudDraftVersion: error.current.cloudDraftVersion,
      })
      markDraftSynced(originalLocalId, user.id, error.current)

      const conflictId = `d-${Date.now()}-conflict-${Math.random().toString(36).slice(2, 7)}`
      const conflictDraft = {
        ...built,
        title: `${built.title || 'Untitled thesis'} (conflict copy)`,
      }
      if (titleRef.current) titleRef.current.value = conflictDraft.title
      const conflictLocal = persistLocalDraft(conflictDraft, conflictId, user.id, {
        cloudDraftId: null,
        cloudDraftVersion: null,
        syncedAt: null,
      })
      localDraftIdRef.current = conflictId
      cloudDraftIdRef.current = null
      cloudDraftVersionRef.current = null
      setLocalDraftId(conflictId)
      setCloudDraftId(null)
      setCloudDraftVersion(null)

      try {
        const saved = await createCloud(conflictDraft, conflictId)
        acceptCloud(saved, conflictId)
        setSaveStatus('conflict')
        showToast('Another device changed this draft. Your edit was preserved as a conflict copy.')
        loadDrafts()
        return saved
      } catch {
        if (!conflictLocal) deleteLocalDraft(conflictId, user.id)
        setSaveStatus('offline')
        showToast('Another device changed this draft. Your conflict copy is saved in this browser.')
        return null
      }
    }
  }

  const queueOrdinarySave = (built, manual = false) => {
    const revision = editRevisionRef.current
    const task = saveQueueRef.current
      .catch(() => null)
      .then(() => persistOrdinaryDraft(built, manual, revision))
    saveQueueRef.current = task
    return task
  }

  const saveDraft = async () => {
    const built = buildThesis()
    if (!hasDraftContent(built)) {
      showToast('Add some draft content before saving.')
      return
    }
    if (scheduledPublicationId) {
      const thesis = useFuturePublication
        ? built
        : { ...built, scheduledPublicationDate }
      try {
        setSaveStatus('saving')
        const response = await fetch(`/api/scheduled-publications/${scheduledPublicationId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: useFuturePublication ? 'update' : 'save-draft',
            thesis,
          }),
        })
        const saved = await response.json()
        if (!response.ok) throw new Error(saved?.error || `HTTP ${response.status}`)
        setSaveStatus('saved')
        showToast(useFuturePublication ? 'Scheduled publication updated.' : 'Private server draft saved.')
      } catch (error) {
        setSaveStatus('error')
        showToast(`Could not save scheduled draft: ${error.message}`)
      }
      return
    }

    await queueOrdinarySave(built, true)
  }

  latestDraftRef.current = buildThesis()
  autosaveRef.current = () => queueOrdinarySave(buildThesis())

  useEffect(() => {
    if (!editRevision || scheduledPublicationId) return undefined
    const timer = setTimeout(() => autosaveRef.current?.(), 1600)
    return () => clearTimeout(timer)
  }, [editRevision, scheduledPublicationId])

  useEffect(() => () => {
    if (scheduledPublicationId || !user?.id || editRevisionRef.current <= lastLocalRevisionRef.current) return
    const latest = latestDraftRef.current
    if (!hasDraftContent(latest)) return
    persistLocalDraft(latest, localDraftIdRef.current, user.id, {
      cloudDraftId: cloudDraftIdRef.current,
      cloudDraftVersion: cloudDraftVersionRef.current,
    })
  }, [scheduledPublicationId, user?.id])

  const sideBox = (active, color) => active
    ? { borderColor: `var(--${color})`, background: `var(--${color}-soft)` }
    : { borderColor: 'var(--border)', background: 'white' }
  const bullTextColor = side === 'bull' ? 'var(--bull)' : 'var(--ink-soft)'
  const bearTextColor = side === 'bear' ? 'var(--bear)' : 'var(--ink-soft)'

  const tabHidden = (tab) => activeTab === tab ? '' : 'hidden'
  const saveStatusText = {
    idle: 'Autosave ready',
    saving: 'Saving…',
    saved: scheduledPublicationId ? 'Scheduled draft saved' : `Cloud saved${cloudDraftVersion ? ` · v${cloudDraftVersion}` : ''}`,
    offline: 'Saved in this browser · waiting for cloud',
    conflict: 'Cloud saved as a conflict copy',
    error: 'Save failed',
  }[saveStatus]

  const todayValue = localDateValue()
  const today = dateFromValue(todayValue)
  const calendarYear = publicationCalendarMonth.getFullYear()
  const calendarMonth = publicationCalendarMonth.getMonth()
  const firstWeekday = (new Date(calendarYear, calendarMonth, 1).getDay() + 6) % 7
  const daysInCalendarMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate()
  const calendarDays = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInCalendarMonth }, (_, index) => new Date(calendarYear, calendarMonth, index + 1)),
  ]
  const canShowPreviousMonth = new Date(calendarYear, calendarMonth, 1) > new Date(today.getFullYear(), today.getMonth(), 1)

  const openPublicationCalendar = () => {
    const selected = dateFromValue(scheduledPublicationDate)
    setPublicationCalendarMonth(new Date(selected.getFullYear(), selected.getMonth(), 1))
    setPublicationCalendarOpen((open) => !open)
  }

  const choosePublicationDate = (value) => {
    setScheduledPublicationDate(value)
    setPublicationCalendarOpen(false)
    markDirty()
  }

  return (
    <div onChangeCapture={markDirty} onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <header className="px-4 pt-5 pb-5 sm:px-6 sm:pt-8 lg:px-12 border-b flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('dashboard')} className="toolbar-btn"><i className="icon-arrow-left"></i></button>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: saveStatus === 'offline' || saveStatus === 'error' ? 'var(--bear)' : 'var(--muted)' }}>Draft · {saveStatusText}</div>
            <h1 className="font-serif text-2xl font-medium">{draft ? 'Edit Thesis' : 'New Investment Thesis'}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={saveDraft} disabled={saveStatus === 'saving'} className="btn-secondary flex-1 sm:flex-none text-sm px-4 py-2 rounded-md">{saveStatus === 'saving' ? 'Saving…' : 'Save Draft'}</button>
          <button onClick={openPublish} disabled={saveStatus === 'saving'} className="btn-primary flex-1 sm:flex-none justify-center text-sm px-4 py-2 rounded-md flex items-center gap-2">
            <i className="icon-lock text-xs"></i> Publish &amp; Lock
          </button>
        </div>
      </header>

      <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-12 max-w-4xl">
        <input
          ref={titleRef}
          type="text"
          placeholder="Give your thesis a clear, declarative title…"
          className="input-clean font-serif text-3xl sm:text-4xl font-medium placeholder:text-[color:var(--faint)] mb-2"
          defaultValue={draft?.title || ''}
        />

        <div className="flex flex-wrap items-center gap-3 mb-6 pb-6 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Security</span>
            <SecuritySearch value={security} onSelect={(selected) => { setSecurity(selected); markDirty() }} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Sector</span>
            <select ref={sectorRef} className="text-sm px-2 py-1 input-bordered rounded" defaultValue={draft?.sector || ''}>
              <option value="">Select sector</option>
              {SECTORS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>Position Declaration</div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button onClick={() => { setSide('bull'); markDirty() }} className="flex-1 py-3 px-4 border-2 rounded-md text-left transition-all" style={{ ...sideBox(side === 'bull', 'bull'), cursor: 'pointer' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm" style={{ color: bullTextColor }}>BULL / LONG</div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--ink-soft)' }}>Price appreciation expected</div>
                  </div>
                  <i className="icon-trending-up text-lg" style={{ color: bullTextColor }}></i>
                </div>
              </button>
              <button onClick={() => { setSide('bear'); markDirty() }} className="flex-1 py-3 px-4 border-2 rounded-md text-left transition-all" style={{ ...sideBox(side === 'bear', 'bear'), cursor: 'pointer' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm" style={{ color: bearTextColor }}>BEAR / SHORT</div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>Decline expected</div>
                  </div>
                  <i className="icon-trending-down text-lg" style={{ color: bearTextColor }}></i>
                </div>
              </button>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>Entry Price Lock</div>
            <div className="p-3 border rounded-md" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>Recorded at publication timestamp</div>
                  <div className="font-mono text-xs mt-1" style={{ color: 'var(--muted)' }}>Cannot be backdated · System-locked</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-2xl font-semibold">
                    {previewLoading ? '…' : preview ? fmtPrice(preview.current, preview.currency) : '—'}
                  </div>
                  <div className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>
                    {security ? `${security.symbol}${security.exchange ? ` · ${security.exchange}` : ''}` : 'No security selected'}
                  </div>
                </div>
              </div>
            </div>
            <label className="flex items-center gap-2 mt-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
              <input
                type="checkbox"
                className="accent-current"
                checked={useFuturePublication}
                onChange={(event) => {
                  setUseFuturePublication(event.target.checked)
                  if (!event.target.checked) setPublicationCalendarOpen(false)
                }}
              />
              <span>Set future publication date instead (also non-changeable)</span>
            </label>
            {useFuturePublication && (
              <div className="mt-3 pl-5">
                <label htmlFor="scheduled-publication-date" className="block text-[10px] font-mono uppercase tracking-wider mb-1.5" style={{ color: 'var(--muted)' }}>
                  Publication date
                </label>
                <div className="publication-date-control" ref={publicationDatePickerRef}>
                  <button
                    id="scheduled-publication-date"
                    type="button"
                    className="publication-date-trigger"
                    aria-haspopup="dialog"
                    aria-expanded={publicationCalendarOpen}
                    aria-describedby="scheduled-publication-help"
                    onClick={openPublicationCalendar}
                  >
                    <i className="icon-calendar" aria-hidden="true"></i>
                    <span>{formatPublicationDate(scheduledPublicationDate)}</span>
                    <i className="icon-chevron-down" aria-hidden="true"></i>
                  </button>
                  {publicationCalendarOpen && (
                    <div className="publication-calendar" role="dialog" aria-label="Choose publication date">
                      <div className="publication-calendar-header">
                        <button
                          type="button"
                          aria-label="Previous month"
                          disabled={!canShowPreviousMonth}
                          onClick={() => setPublicationCalendarMonth(new Date(calendarYear, calendarMonth - 1, 1))}
                        >
                          <i className="icon-chevron-left" aria-hidden="true"></i>
                        </button>
                        <div>
                          {publicationCalendarMonth.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
                        </div>
                        <button
                          type="button"
                          aria-label="Next month"
                          onClick={() => setPublicationCalendarMonth(new Date(calendarYear, calendarMonth + 1, 1))}
                        >
                          <i className="icon-chevron-right" aria-hidden="true"></i>
                        </button>
                      </div>
                      <div className="publication-calendar-weekdays" aria-hidden="true">
                        {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
                      </div>
                      <div className="publication-calendar-days" role="grid">
                        {calendarDays.map((date, index) => {
                          if (!date) return <span key={`empty-${index}`} />
                          const value = dateValue(date)
                          const isSelected = value === scheduledPublicationDate
                          const isToday = value === todayValue
                          return (
                            <button
                              key={value}
                              type="button"
                              role="gridcell"
                              className={`${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                              disabled={value < todayValue}
                              aria-label={date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                              aria-selected={isSelected}
                              onClick={() => choosePublicationDate(value)}
                            >
                              {date.getDate()}
                            </button>
                          )
                        })}
                      </div>
                      <div className="publication-calendar-footer">
                        <button type="button" onClick={() => choosePublicationDate(todayValue)}>Today</button>
                        <span>{formatPublicationDate(scheduledPublicationDate)}</span>
                      </div>
                    </div>
                  )}
                </div>
                <p id="scheduled-publication-help" className="text-[10px] mt-1.5" style={{ color: 'var(--muted)' }}>
                  This date will be locked when the thesis is published.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mb-8">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 mb-3">
            <div>
              <h3 className="font-serif text-lg font-medium">Invalidation Triggers</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>Tie each condition to a reported financial line item. The app tracks it against the security&rsquo;s filings and flags the thesis when the condition holds.</p>
            </div>
            <button onClick={addTrigger} disabled={!security || !statements} className={`shrink-0 text-xs font-medium inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-md ${security && statements ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`} style={{ borderColor: 'var(--border-strong)', background: 'transparent', cursor: security && statements ? 'pointer' : 'not-allowed' }}>
              <i className="icon-plus text-xs"></i> Add Trigger
            </button>
          </div>

          {!security ? (
            <div className="p-4 border border-dashed rounded-md text-center text-xs" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)', color: 'var(--muted)' }}>Select a security to tie triggers to its financials.</div>
          ) : stmtLoading && !statements ? (
            <div className="p-4 border border-dashed rounded-md text-center text-xs" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)', color: 'var(--muted)' }}>Loading financial line items…</div>
          ) : !statements ? (
            <div className="p-4 border border-dashed rounded-md text-center text-xs" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)', color: 'var(--muted)' }}>Financial statements are unavailable for this security, so triggers can&rsquo;t be tracked.</div>
          ) : (
            <div className="space-y-3">
              {triggers.length === 0 && (
                <div className="p-4 border border-dashed rounded-md text-center text-xs" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)', color: 'var(--muted)' }}>No triggers yet. Add one to track a revenue, margin, cash, or other line item against your threshold.</div>
              )}
              {triggers.map(t => {
                const cur = t.currency || statements.currency
                const complete = Boolean(t.metric) && validComparisons(t).length > 0
                const latest = t.metric ? latestMetric(statements, t.statement, t.period || 'annual', t.metric, t.scale) : null
                const evalRes = complete ? evaluateTrigger({ ...t, s: 'clear' }, statements) : null
                const stStyle = evalRes ? TRIGGER_STATUS_STYLE[evalRes.status] : null
                return (
                  <div key={t.id}>
                    <TriggerComposer
                      trigger={t}
                      statements={statements}
                      onChange={(structured) => updateTriggerFromComposer(t.id, structured)}
                      onRemove={() => removeTrigger(t.id)}
                    />
                    {/* Live standing against the latest filing, once a metric is chosen */}
                    {t.metric && (
                      <div className="flex items-center gap-2.5 text-[11px] px-2.5 pt-1.5">
                        <span style={{ color: 'var(--muted)' }}>Latest <span className="font-mono" style={{ color: 'var(--ink-soft)' }}>{latest ? formatMetricValue(latest.value, latest.kind, cur, t.scale) : '—'}</span>{latest?.period && <span className="font-mono" style={{ color: 'var(--faint)' }}> · {latest.period}</span>}</span>
                        {stStyle && <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: stStyle.soft, color: stStyle.color }}>{stStyle.label}</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="border-b mb-6 flex items-center gap-1 overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
          {['thesis', 'model', 'financials', 'charts'].map(tab => (
            <button key={tab} className={`tab-btn ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className={tabHidden('thesis')}>
          {dragging && (
            <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none" style={{ background: 'rgba(255,255,255,0.9)' }}>
              <div className="drop-zone dragging p-12 rounded-lg text-center">
                <i className="icon-file-text text-3xl" style={{ color: 'var(--ink)' }}></i>
                <p className="font-serif text-xl mt-3">Drop DOCX document to import</p>
                <p className="text-xs font-mono mt-1" style={{ color: 'var(--muted)' }}>.docx · up to 8 MB</p>
              </div>
            </div>
          )}
          <ThesisEditor
            ref={thesisEditorRef}
            initialHtml={draft?.body || ''}
            onChange={markDirty}
            onImportFile={handleDocumentImport}
            importingDocument={importingDocument}
            documentInputRef={documentInputRef}
            showToast={showToast}
          />
        </div>

        <div className={tabHidden('model')}>
          <SpreadsheetEditor initialModel={model || undefined} onChange={(nextModel) => { setModel(nextModel); markDirty() }} />
          {showLegacyModel && <>
          <div className="border rounded-md overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)' }}>
              <div className="flex items-center gap-2">
                <i className="icon-table text-sm"></i>
                <span className="text-sm font-medium">asml_model_v3.xlsx</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5" style={{ background: 'white', color: 'var(--muted)' }}>Sheet 1 of 4</span>
              </div>
              <div className="flex items-center gap-1">
                <button className="toolbar-btn"><i className="icon-undo-2 text-xs"></i></button>
                <button className="toolbar-btn"><i className="icon-redo-2 text-xs"></i></button>
                <div className="w-px h-4 mx-1" style={{ background: 'var(--border)' }}></div>
                <button className="toolbar-btn"><i className="icon-plus text-xs"></i></button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="border-collapse" style={{ background: 'white' }}>
                <thead>
                  <tr>
                    <th className="excel-cell excel-row-header"></th>
                    <th className="excel-cell excel-header">2022A</th>
                    <th className="excel-cell excel-header">2023A</th>
                    <th className="excel-cell excel-header">2024E</th>
                    <th className="excel-cell excel-header">2025E</th>
                    <th className="excel-cell excel-header">2026E</th>
                    <th className="excel-cell excel-header">2027E</th>
                    <th className="excel-cell excel-header">2028E</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="excel-cell excel-row-header">1</td><td className="excel-cell" style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Revenue (€M)</td><td className="excel-cell"></td><td className="excel-cell"></td><td className="excel-cell"></td><td className="excel-cell"></td><td className="excel-cell"></td><td className="excel-cell"></td><td className="excel-cell"></td></tr>
                  <tr><td className="excel-cell excel-row-header">2</td><td className="excel-cell pl-4">EUV Systems</td><td className="excel-cell num-mono">7,402</td><td className="excel-cell num-mono">9,183</td><td className="excel-cell num-mono">11,210</td><td className="excel-cell num-mono">13,452</td><td className="excel-cell num-mono">15,834</td><td className="excel-cell num-mono">18,201</td><td className="excel-cell num-mono">20,548</td></tr>
                  <tr><td className="excel-cell excel-row-header">3</td><td className="excel-cell pl-4">DUV Systems</td><td className="excel-cell num-mono">3,118</td><td className="excel-cell num-mono">3,402</td><td className="excel-cell num-mono">3,591</td><td className="excel-cell num-mono">3,771</td><td className="excel-cell num-mono">3,960</td><td className="excel-cell num-mono">4,158</td><td className="excel-cell num-mono">4,366</td></tr>
                  <tr><td className="excel-cell excel-row-header">4</td><td className="excel-cell pl-4">Service</td><td className="excel-cell num-mono">5,612</td><td className="excel-cell num-mono">6,389</td><td className="excel-cell num-mono">7,156</td><td className="excel-cell num-mono">8,014</td><td className="excel-cell num-mono">8,976</td><td className="excel-cell num-mono">10,053</td><td className="excel-cell num-mono">11,259</td></tr>
                  <tr><td className="excel-cell excel-row-header">5</td><td className="excel-cell pl-4" style={{ fontWeight: 600 }}>Total Revenue</td><td className="excel-cell num-mono" style={{ fontWeight: 600, background: 'var(--bg-warm)' }}>16,132</td><td className="excel-cell num-mono" style={{ fontWeight: 600, background: 'var(--bg-warm)' }}>18,974</td><td className="excel-cell num-mono" style={{ fontWeight: 600, background: 'var(--bg-warm)' }}>21,957</td><td className="excel-cell num-mono" style={{ fontWeight: 600, background: 'var(--bg-warm)' }}>25,237</td><td className="excel-cell num-mono" style={{ fontWeight: 600, background: 'var(--bg-warm)' }}>28,770</td><td className="excel-cell num-mono" style={{ fontWeight: 600, background: 'var(--bg-warm)' }}>32,412</td><td className="excel-cell num-mono" style={{ fontWeight: 600, background: 'var(--bg-warm)' }}>36,173</td></tr>
                  <tr><td className="excel-cell excel-row-header">6</td><td className="excel-cell"></td><td className="excel-cell"></td><td className="excel-cell"></td><td className="excel-cell"></td><td className="excel-cell"></td><td className="excel-cell"></td><td className="excel-cell"></td><td className="excel-cell"></td></tr>
                  <tr><td className="excel-cell excel-row-header">7</td><td className="excel-cell" style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Gross Margin</td><td className="excel-cell"></td><td className="excel-cell"></td><td className="excel-cell"></td><td className="excel-cell"></td><td className="excel-cell"></td><td className="excel-cell"></td><td className="excel-cell"></td></tr>
                  <tr><td className="excel-cell excel-row-header">8</td><td className="excel-cell pl-4">EUV</td><td className="excel-cell num-mono">48.2%</td><td className="excel-cell num-mono">49.8%</td><td className="excel-cell num-mono">51.1%</td><td className="excel-cell num-mono" style={{ color: 'var(--bull)' }}>52.4%</td><td className="excel-cell num-mono" style={{ color: 'var(--bull)' }}>53.6%</td><td className="excel-cell num-mono" style={{ color: 'var(--bull)' }}>54.7%</td><td className="excel-cell num-mono" style={{ color: 'var(--bull)' }}>55.6%</td></tr>
                  <tr><td className="excel-cell excel-row-header">9</td><td className="excel-cell pl-4">Service</td><td className="excel-cell num-mono">42.1%</td><td className="excel-cell num-mono">42.8%</td><td className="excel-cell num-mono">43.4%</td><td className="excel-cell num-mono">44.0%</td><td className="excel-cell num-mono">44.6%</td><td className="excel-cell num-mono">45.2%</td><td className="excel-cell num-mono">45.8%</td></tr>
                  <tr><td className="excel-cell excel-row-header">10</td><td className="excel-cell pl-4" style={{ fontWeight: 600 }}>Blended GM</td><td className="excel-cell num-mono" style={{ fontWeight: 600, background: 'var(--bg-warm)' }}>49.8%</td><td className="excel-cell num-mono" style={{ fontWeight: 600, background: 'var(--bg-warm)' }}>50.8%</td><td className="excel-cell num-mono" style={{ fontWeight: 600, background: 'var(--bg-warm)' }}>51.9%</td><td className="excel-cell num-mono" style={{ fontWeight: 600, background: 'var(--bg-warm)' }}>53.0%</td><td className="excel-cell num-mono" style={{ fontWeight: 600, background: 'var(--bg-warm)' }}>53.9%</td><td className="excel-cell num-mono" style={{ fontWeight: 600, background: 'var(--bg-warm)' }}>54.7%</td><td className="excel-cell num-mono" style={{ fontWeight: 600, background: 'var(--bg-warm)' }}>55.4%</td></tr>
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t flex items-center justify-between text-[11px] font-mono" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)', color: 'var(--muted)' }}>
              <span>Cell B5: =SUM(B2:B4)</span>
              <span>Ready</span>
            </div>
          </div>
          <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>Model is embedded live. Changes to assumptions flow through to the thesis automatically.</p>
          </>}
        </div>

        <div className={tabHidden('financials')}>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-0.5 p-0.5 rounded-md" style={{ background: 'var(--bg-warm)', border: '1px solid var(--border)' }}>
              {STMT_TABS.map(s => (
                <button
                  key={s.key}
                  onClick={() => setStmtView(s.key)}
                  className="text-xs font-medium px-3 py-1.5 rounded"
                  style={stmtView === s.key ? { background: 'var(--ink)', color: 'white', cursor: 'pointer', border: 'none' } : { background: 'transparent', color: 'var(--ink-soft)', cursor: 'pointer', border: 'none' }}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-0.5 p-0.5 rounded-md" style={{ background: 'var(--bg-warm)', border: '1px solid var(--border)' }}>
              {[['annual', 'Annual'], ['quarterly', 'Quarterly']].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setStmtPeriod(key)}
                  className="text-xs font-medium px-3 py-1.5 rounded"
                  style={stmtPeriod === key ? { background: 'var(--ink)', color: 'white', cursor: 'pointer', border: 'none' } : { background: 'transparent', color: 'var(--ink-soft)', cursor: 'pointer', border: 'none' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {!security?.symbol ? (
            <div className="border rounded-md p-12 text-center text-sm" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>Select a security to load financial statements.</div>
          ) : stmtLoading ? (
            <div className="border rounded-md p-12 text-center text-sm" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>Loading financial statements…</div>
          ) : !activeStmt || !activeStmt.rows.length ? (
            <div className="border rounded-md p-12 text-center text-sm" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>No {stmtPeriod} {STMT_TABS.find(s => s.key === stmtView)?.label.toLowerCase()} data available for {statements?.symbol || security.symbol}.</div>
          ) : (
            <div className="border rounded-md overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ background: 'white' }}>
                  <thead>
                    <tr>
                      <th className="text-left text-[10px] font-mono uppercase tracking-wider px-4 py-2.5" style={{ background: 'var(--bg-warm)', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Line Item</th>
                      {activeStmt.periods.map((c, i) => (
                        <th key={i} className="text-right text-[11px] font-mono px-4 py-2.5" style={{ background: 'var(--bg-warm)', color: 'var(--ink-soft)', borderBottom: '1px solid var(--border)', minWidth: '92px' }}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeStmt.rows.map((r, ri) => (
                      <tr key={ri} style={r.bold ? { background: 'var(--bg-warm)' } : undefined}>
                        <td className="text-sm px-4 py-2" style={{ borderBottom: '1px solid var(--border)', fontWeight: r.bold ? 600 : 400, paddingLeft: r.indent ? '2rem' : undefined, color: r.indent ? 'var(--ink-soft)' : 'var(--ink)' }}>{r.label}</td>
                        {r.values.map((v, ci) => (
                          <td key={ci} className="num-mono text-xs text-right px-4 py-2" style={{ borderBottom: '1px solid var(--border)', fontWeight: r.bold ? 600 : 400, color: typeof v === 'number' && v < 0 ? 'var(--bear)' : undefined }}>{fmtCell(v, r.kind)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 border-t flex items-center justify-between text-[10px] font-mono" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)', color: 'var(--muted)' }}>
                <span>In millions of {statements.currency}, except per-share and share counts</span>
                <span>Live via Yahoo Finance</span>
              </div>
            </div>
          )}
        </div>

        <div className={tabHidden('charts')}>
          <div className="p-10 border border-dashed rounded-md text-center" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)' }}>
            <i className="icon-chart-no-axes-column text-xl" style={{ color: 'var(--faint)' }}></i>
            <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>No charts yet.</p>
          </div>
        </div>
      </div>

    </div>
  )
}
