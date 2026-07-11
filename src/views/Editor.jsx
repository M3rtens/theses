import { useEffect, useRef, useState } from 'react'

const INITIAL_TRIGGERS = [
  { id: 1, condition: 'Gross margin falls below 45%', metric: 'Gross Margin', threshold: '45%', current: '50.8%', status: 'clear' },
  { id: 2, condition: 'EUV shipment count < 40 units annually', metric: 'EUV Shipments', threshold: '40 units', current: '62 units', status: 'clear' },
  { id: 3, condition: 'China revenue exceeds 25% of total', metric: 'China Revenue %', threshold: '25%', current: '21%', status: 'warning' },
]

const INITIAL_EDITOR_HTML = `
  <h1>The Monopoly Below the Surface</h1>
  <p>ASML is the only company on earth capable of manufacturing extreme ultraviolet (EUV) lithography systems. This isn't a near-monopoly — it's a single-source chokepoint in the most strategic supply chain of the 21st century.</p>
  <h2>The Core Argument</h2>
  <p>The market prices ASML as a cyclical semiconductor equipment vendor. It is, in reality, a <strong>structural monopoly</strong> with three reinforcing moats:</p>
  <ul>
    <li><strong>Technical impossibility of competition:</strong> Zeiss is the only optics partner capable of the required precision, and Zeiss is contractually locked to ASML.</li>
    <li><strong>20+ year development cycles:</strong> EUV took 17 years and €6B+ to commercialize. Next-generation High-NA is already shipping.</li>
    <li><strong>Captive customer base:</strong> TSMC, Samsung, and Intel cannot produce leading-edge chips without ASML's machines.</li>
  </ul>
  <h2>Why the Market is Wrong</h2>
  <p>Current multiples discount a cyclical downturn in 2025–2026. <em>They miss that the backlog has structurally re-rated.</em> The order book now extends through 2029, with non-cancellable deposits representing 41% of order value — up from 18% in 2021.</p>
  <blockquote>"If you want to bet against the entire semiconductor industry, short ASML. If you want to own the semiconductor industry, own ASML." — Analyst note, Morgan Stanley</blockquote>
  <h2>Path to $1,400</h2>
  <p>At 32x forward earnings — a discount to its 5-year average of 38x — ASML reaches $1,400 by 2026 under conservative assumptions:</p>
  <ol>
    <li>EUV shipment volume grows 18% CAGR through 2028</li>
    <li>Service revenue compounds at 12% (high-margin, recurring)</li>
    <li>High-NA pricing premium of 35% materializes</li>
  </ol>
  <p>The downside is protected by a non-cancellable backlog that exceeds two years of revenue.</p>
`

const EMBED_HTML = '<div contenteditable="false" class="my-4 p-4 border rounded" style="border-color: var(--border); background: var(--bg-warm);"><div class="text-[10px] font-mono uppercase tracking-wider" style="color: var(--muted);">Embedded Chart</div><div class="text-sm font-medium mt-1">Revenue &amp; Margin Trajectory</div><div class="text-xs mt-1" style="color: var(--ink-soft);">Linked to model · auto-updates</div></div>'

const SLASH_ITEMS = [
  { action: 'h1', icon: <span className="font-serif font-semibold text-xs">H1</span>, label: 'Heading 1', desc: 'Large section heading' },
  { action: 'h2', icon: <span className="font-serif font-semibold text-xs">H2</span>, label: 'Heading 2', desc: 'Medium heading' },
  { action: 'p', icon: <span className="text-xs">¶</span>, label: 'Text', desc: 'Plain paragraph' },
  { action: 'blockquote', icon: <i className="lucide-quote text-xs"></i>, label: 'Quote', desc: 'Capture a citation' },
  { action: 'insertUnorderedList', icon: <i className="lucide-list text-xs"></i>, label: 'Bullet List', desc: 'Unordered items' },
  { action: 'insertOrderedList', icon: <i className="lucide-list-ordered text-xs"></i>, label: 'Numbered List', desc: 'Ordered items' },
  { action: 'embed', icon: <i className="lucide-bar-chart-3 text-xs"></i>, label: 'Embed Chart', desc: 'Financials, charts, models' },
]

export default function Editor({ navigate, showToast, onOpenPublish }) {
  const [side, setSide] = useState('bull')
  const [activeTab, setActiveTab] = useState('thesis')
  const [triggers, setTriggers] = useState(INITIAL_TRIGGERS)
  const [slash, setSlash] = useState(null) // { x, y }
  const [dragging, setDragging] = useState(false)

  const editorRef = useRef(null)
  const dragCounter = useRef(0)

  // Seed the contenteditable body once on mount.
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = INITIAL_EDITOR_HTML
  }, [])

  const format = (command, value = null) => {
    document.execCommand(command, false, value)
    editorRef.current?.focus()
  }

  const insertDivider = () => document.execCommand('insertHorizontalRule')
  const insertEmbed = () => document.execCommand('insertHTML', false, EMBED_HTML)

  const closeSlash = () => setSlash(null)

  const onEditorInput = () => {
    const sel = window.getSelection()
    if (!sel.rangeCount) return
    const range = sel.getRangeAt(0)
    const text = range.startContainer.textContent || ''
    const offset = range.startOffset
    const lastChar = text.slice(offset - 1, offset)
    if (lastChar === '/' && !slash) {
      const rect = range.getBoundingClientRect()
      setSlash({ x: rect.left, y: rect.bottom + 4 })
    }
  }

  const slashAction = (action) => {
    closeSlash()
    editorRef.current?.focus()
    if (action === 'embed') insertEmbed()
    else if (action === 'blockquote') format('formatBlock', 'blockquote')
    else if (action === 'p') format('formatBlock', 'p')
    else format(action)
  }

  // Close slash menu on outside click.
  useEffect(() => {
    if (!slash) return
    const onClick = (e) => {
      if (!e.target.closest('.slash-menu') && !e.target.closest('#editor')) closeSlash()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [slash])

  const handleDroppedFile = (file) => {
    if (!file) return
    showToast(`Parsing "${file.name}"…`)
    setTimeout(() => showToast(`Auto-formatted ${file.name} · 2,847 words imported`), 1200)
  }

  // Drag-and-drop of Word documents onto the editor view.
  const onDragEnter = () => {
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
    handleDroppedFile(e.dataTransfer.files[0])
  }

  const addTrigger = () => {
    setTriggers(prev => {
      const id = Math.max(...prev.map(t => t.id)) + 1
      return [...prev, { id, condition: 'New trigger condition…', metric: 'Custom', threshold: '—', current: '—', status: 'clear' }]
    })
  }
  const removeTrigger = (id) => setTriggers(prev => prev.filter(t => t.id !== id))
  const updateTrigger = (id, value) => setTriggers(prev => prev.map(t => t.id === id ? { ...t, condition: value } : t))

  const saveDraft = () => showToast('Draft saved locally · ' + new Date().toLocaleTimeString())

  const sideBox = (active, color) => active
    ? { borderColor: `var(--${color})`, background: `var(--${color}-soft)` }
    : { borderColor: 'var(--border)', background: 'white' }
  const bullTextColor = side === 'bull' ? 'var(--bull)' : 'var(--ink-soft)'
  const bearTextColor = side === 'bear' ? 'var(--bear)' : 'var(--ink-soft)'

  const tabHidden = (tab) => activeTab === tab ? '' : 'hidden'

  return (
    <div onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <header className="px-12 pt-8 pb-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('dashboard')} className="toolbar-btn"><i className="lucide-arrow-left"></i></button>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Draft · Auto-saved 2 min ago</div>
            <h1 className="font-serif text-2xl font-medium">New Investment Thesis</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={saveDraft} className="btn-secondary text-sm px-4 py-2 rounded-md">Save Draft</button>
          <button onClick={onOpenPublish} className="btn-primary text-sm px-4 py-2 rounded-md flex items-center gap-2">
            <i className="lucide-lock text-xs"></i> Publish &amp; Lock
          </button>
        </div>
      </header>

      <div className="px-12 py-8 max-w-4xl">
        <input
          type="text"
          placeholder="Give your thesis a clear, declarative title…"
          className="input-clean font-serif text-4xl font-medium placeholder:text-[color:var(--faint)] mb-2"
          defaultValue="ASML: The Monopoly Below the Surface"
        />

        <div className="flex flex-wrap items-center gap-3 mb-6 pb-6 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Ticker</span>
            <input type="text" defaultValue="ASML" className="font-mono text-sm font-semibold px-2 py-1 input-bordered rounded w-20 text-center" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Company</span>
            <input type="text" defaultValue="ASML Holding N.V." className="text-sm px-2 py-1 input-bordered rounded" style={{ width: '200px' }} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Sector</span>
            <select className="text-sm px-2 py-1 input-bordered rounded" defaultValue="Semiconductors">
              <option>Semiconductors</option>
              <option>Software</option>
              <option>Energy</option>
              <option>Financials</option>
              <option>Healthcare</option>
              <option>Consumer</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>Position Declaration</div>
            <div className="flex gap-2">
              <button onClick={() => setSide('bull')} className="flex-1 py-3 px-4 border-2 rounded-md text-left transition-all" style={{ ...sideBox(side === 'bull', 'bull'), cursor: 'pointer' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm" style={{ color: bullTextColor }}>BULL / LONG</div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--ink-soft)' }}>Price appreciation expected</div>
                  </div>
                  <i className="lucide-trending-up text-lg" style={{ color: bullTextColor }}></i>
                </div>
              </button>
              <button onClick={() => setSide('bear')} className="flex-1 py-3 px-4 border-2 rounded-md text-left transition-all" style={{ ...sideBox(side === 'bear', 'bear'), cursor: 'pointer' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm" style={{ color: bearTextColor }}>BEAR / SHORT</div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>Decline expected</div>
                  </div>
                  <i className="lucide-trending-down text-lg" style={{ color: bearTextColor }}></i>
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
                  <div className="font-mono text-2xl font-semibold">$905.40</div>
                  <div className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>ASML · NYSE</div>
                </div>
              </div>
            </div>
            <label className="flex items-center gap-2 mt-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
              <input type="checkbox" className="accent-current" />
              <span>Set future publication date instead (also non-changeable)</span>
            </label>
          </div>
        </div>

        <div className="mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <h3 className="font-serif text-lg font-medium">Invalidation Triggers</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>Define conditions that would break this thesis. The app monitors them automatically.</p>
            </div>
            <button onClick={addTrigger} className="text-xs font-medium flex items-center gap-1.5 px-3 py-1.5 border rounded-md hover:bg-gray-50" style={{ borderColor: 'var(--border-strong)', background: 'transparent', cursor: 'pointer' }}>
              <i className="lucide-plus text-xs"></i> Add Trigger
            </button>
          </div>
          <div className="space-y-2">
            {triggers.map(t => (
              <div key={t.id} className="flex items-center gap-3 p-3 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
                <i className="lucide-target text-sm" style={{ color: 'var(--muted)' }}></i>
                <input type="text" defaultValue={t.condition} className="flex-1 text-sm input-clean" onChange={(e) => updateTrigger(t.id, e.target.value)} />
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: t.status === 'warning' ? 'var(--warn-soft)' : 'var(--bg-warm)', color: t.status === 'warning' ? 'var(--warn)' : 'var(--ink-soft)' }}>{t.status === 'warning' ? 'WARNING' : 'CLEAR'}</span>
                <button onClick={() => removeTrigger(t.id)} className="toolbar-btn"><i className="lucide-x text-xs"></i></button>
              </div>
            ))}
          </div>
        </div>

        <div className="border-b mb-6 flex items-center gap-1" style={{ borderColor: 'var(--border)' }}>
          {['thesis', 'model', 'financials', 'charts'].map(tab => (
            <button key={tab} className={`tab-btn ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className={tabHidden('thesis')}>
          <div className="sticky top-0 z-20 flex items-center gap-0.5 py-2 mb-3 border-b bg-white" style={{ borderColor: 'var(--border)' }}>
            <button className="toolbar-btn" onClick={() => format('bold')} title="Bold"><i className="lucide-bold"></i></button>
            <button className="toolbar-btn" onClick={() => format('italic')} title="Italic"><i className="lucide-italic"></i></button>
            <button className="toolbar-btn" onClick={() => format('underline')} title="Underline"><i className="lucide-underline"></i></button>
            <button className="toolbar-btn" onClick={() => format('strikeThrough')} title="Strikethrough"><i className="lucide-strikethrough"></i></button>
            <div className="w-px h-4 mx-1" style={{ background: 'var(--border)' }}></div>
            <button className="toolbar-btn" onClick={() => format('formatBlock', 'h1')} title="Heading 1"><span className="font-serif text-xs font-semibold">H1</span></button>
            <button className="toolbar-btn" onClick={() => format('formatBlock', 'h2')} title="Heading 2"><span className="font-serif text-xs font-semibold">H2</span></button>
            <button className="toolbar-btn" onClick={() => format('formatBlock', 'p')} title="Paragraph"><span className="text-xs">¶</span></button>
            <button className="toolbar-btn" onClick={() => format('formatBlock', 'blockquote')} title="Quote"><i className="lucide-quote"></i></button>
            <div className="w-px h-4 mx-1" style={{ background: 'var(--border)' }}></div>
            <button className="toolbar-btn" onClick={() => format('insertUnorderedList')} title="Bullet list"><i className="lucide-list"></i></button>
            <button className="toolbar-btn" onClick={() => format('insertOrderedList')} title="Numbered list"><i className="lucide-list-ordered"></i></button>
            <div className="w-px h-4 mx-1" style={{ background: 'var(--border)' }}></div>
            <button className="toolbar-btn" onClick={() => format('createLink')} title="Link"><i className="lucide-link"></i></button>
            <button className="toolbar-btn" onClick={insertDivider} title="Divider"><i className="lucide-minus"></i></button>
            <button className="toolbar-btn" onClick={insertEmbed} title="Embed"><i className="lucide-bar-chart-3"></i></button>
            <div className="ml-auto text-[10px] font-mono" style={{ color: 'var(--faint)' }}>Type / for commands</div>
          </div>

          {dragging && (
            <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none" style={{ background: 'rgba(255,255,255,0.9)' }}>
              <div className="drop-zone dragging p-12 rounded-lg text-center">
                <i className="lucide-file-text text-3xl" style={{ color: 'var(--ink)' }}></i>
                <p className="font-serif text-xl mt-3">Drop Word document to auto-format</p>
                <p className="text-xs font-mono mt-1" style={{ color: 'var(--muted)' }}>.docx · .doc · .rtf supported</p>
              </div>
            </div>
          )}

          <div
            id="editor"
            ref={editorRef}
            className="editor-content"
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Begin your thesis… Type / for commands, or drag in a Word document."
            onInput={onEditorInput}
          />
        </div>

        <div className={tabHidden('model')}>
          <div className="border rounded-md overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)' }}>
              <div className="flex items-center gap-2">
                <i className="lucide-table text-sm"></i>
                <span className="text-sm font-medium">asml_model_v3.xlsx</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5" style={{ background: 'white', color: 'var(--muted)' }}>Sheet 1 of 4</span>
              </div>
              <div className="flex items-center gap-1">
                <button className="toolbar-btn"><i className="lucide-undo-2 text-xs"></i></button>
                <button className="toolbar-btn"><i className="lucide-redo-2 text-xs"></i></button>
                <div className="w-px h-4 mx-1" style={{ background: 'var(--border)' }}></div>
                <button className="toolbar-btn"><i className="lucide-plus text-xs"></i></button>
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
        </div>

        <div className={tabHidden('financials')}>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-5 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
              <div className="text-[10px] font-mono uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>Income Statement Highlights</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span style={{ color: 'var(--ink-soft)' }}>Revenue (TTM)</span><span className="font-mono">€27.3B</span></div>
                <div className="flex justify-between"><span style={{ color: 'var(--ink-soft)' }}>Gross Profit</span><span className="font-mono">€13.8B</span></div>
                <div className="flex justify-between"><span style={{ color: 'var(--ink-soft)' }}>Operating Income</span><span className="font-mono">€8.9B</span></div>
                <div className="flex justify-between"><span style={{ color: 'var(--ink-soft)' }}>Net Income</span><span className="font-mono">€7.0B</span></div>
                <div className="flex justify-between border-t pt-2 mt-2" style={{ borderColor: 'var(--border)' }}><span style={{ color: 'var(--ink-soft)' }}>Operating Margin</span><span className="font-mono font-semibold">32.6%</span></div>
              </div>
            </div>
            <div className="p-5 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
              <div className="text-[10px] font-mono uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>Balance Sheet Strength</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span style={{ color: 'var(--ink-soft)' }}>Cash &amp; Equivalents</span><span className="font-mono">€5.4B</span></div>
                <div className="flex justify-between"><span style={{ color: 'var(--ink-soft)' }}>Total Debt</span><span className="font-mono">€2.1B</span></div>
                <div className="flex justify-between"><span style={{ color: 'var(--ink-soft)' }}>Net Cash Position</span><span className="font-mono ret-pos">+€3.3B</span></div>
                <div className="flex justify-between"><span style={{ color: 'var(--ink-soft)' }}>Backlog (non-cancellable)</span><span className="font-mono">€36B</span></div>
                <div className="flex justify-between border-t pt-2 mt-2" style={{ borderColor: 'var(--border)' }}><span style={{ color: 'var(--ink-soft)' }}>Backlog / Annual Rev</span><span className="font-mono font-semibold">2.3x</span></div>
              </div>
            </div>
          </div>
        </div>

        <div className={tabHidden('charts')}>
          <div className="p-6 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Embedded Chart</div>
            <h4 className="font-serif text-lg font-medium mb-4">EUV Shipment Volume vs. Competitor Capability</h4>
            <svg viewBox="0 0 600 240" className="w-full">
              <defs>
                <pattern id="grid" width="60" height="30" patternUnits="userSpaceOnUse">
                  <path d="M 60 0 L 0 0 0 30" fill="none" stroke="#E8E6DF" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="600" height="240" fill="url(#grid)" />
              <g fill="#1A1A17">
                <rect x="60" y="180" width="40" height="40" />
                <rect x="140" y="150" width="40" height="70" />
                <rect x="220" y="110" width="40" height="110" />
                <rect x="300" y="70" width="40" height="150" />
                <rect x="380" y="40" width="40" height="180" />
                <rect x="460" y="20" width="40" height="200" />
              </g>
              <line x1="60" y1="220" x2="540" y2="220" stroke="#8B2C2C" strokeWidth="2" />
              <text x="540" y="215" textAnchor="end" fontSize="10" fontFamily="JetBrains Mono" fill="#8B2C2C">Competitor capability: 0 units</text>
              <g fontSize="10" fontFamily="JetBrains Mono" fill="#8C8A82" textAnchor="middle">
                <text x="80" y="235">2019</text>
                <text x="160" y="235">2020</text>
                <text x="240" y="235">2021</text>
                <text x="320" y="235">2022</text>
                <text x="400" y="235">2023</text>
                <text x="480" y="235">2024E</text>
              </g>
            </svg>
            <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>Source: Company filings, industry analysis. Competitor capability remains at zero through 2024.</p>
          </div>
        </div>
      </div>

      {slash && (
        <div className="slash-menu" style={{ position: 'fixed', left: slash.x, top: slash.y }}>
          {SLASH_ITEMS.map(item => (
            <div key={item.action} className="slash-item" onClick={() => slashAction(item.action)}>
              <div className="icon">{item.icon}</div>
              <div>
                <div className="font-medium">{item.label}</div>
                <div className="text-[11px]" style={{ color: 'var(--muted)' }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
