'use client'

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { createThesisEditorExtensions } from '../lib/thesisEditorSchema.js'
import { normalizePublicUrl } from '../lib/urls.js'

const COMMANDS = [
  { action: 'h1', icon: <span className="font-serif font-semibold text-xs">H1</span>, label: 'Heading 1', desc: 'Large section heading' },
  { action: 'h2', icon: <span className="font-serif font-semibold text-xs">H2</span>, label: 'Heading 2', desc: 'Medium heading' },
  { action: 'p', icon: <span className="text-xs">¶</span>, label: 'Text', desc: 'Plain paragraph' },
  { action: 'blockquote', icon: <i className="icon-quote text-xs"></i>, label: 'Quote', desc: 'Capture a citation' },
  { action: 'bulletList', icon: <i className="icon-list text-xs"></i>, label: 'Bullet List', desc: 'Unordered items' },
  { action: 'orderedList', icon: <i className="icon-list-ordered text-xs"></i>, label: 'Numbered List', desc: 'Ordered items' },
  { action: 'divider', icon: <i className="icon-minus text-xs"></i>, label: 'Divider', desc: 'Separate sections' },
  { action: 'embed', icon: <i className="icon-chart-no-axes-column text-xs"></i>, label: 'Embed Chart', desc: 'Financials, charts, models' },
]

function ToolbarButton({ active = false, disabled = false, label, onClick, children }) {
  return (
    <button
      type="button"
      className={`toolbar-btn ${active ? 'active' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

const ThesisEditor = forwardRef(function ThesisEditor({
  initialHtml = '',
  onChange,
  onImportFile,
  importingDocument = false,
  documentInputRef,
  showToast,
  onOpenCharts,
}, ref) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [slash, setSlash] = useState(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [, setTransactionRevision] = useState(0)
  const extensions = useMemo(() => createThesisEditorExtensions(), [])
  const slashRef = useRef(slash)
  slashRef.current = slash

  const editor = useEditor({
    immediatelyRender: false,
    content: initialHtml || '',
    extensions,
    editorProps: {
      attributes: {
        id: 'editor',
        class: 'editor-content',
        role: 'textbox',
        'aria-label': 'Thesis body',
        'aria-multiline': 'true',
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChangeRef.current?.(currentEditor.isEmpty ? '' : currentEditor.getHTML())
    },
    onTransaction: () => setTransactionRevision((current) => current + 1),
  })

  const closeSlash = () => {
    setSlash(null)
    setSlashIndex(0)
  }

  const refreshSlash = () => {
    if (!editor || !editor.isFocused || !editor.state.selection.empty) {
      if (slashRef.current) closeSlash()
      return
    }
    const { $from, from } = editor.state.selection
    const beforeCaret = $from.parent.textBetween(0, $from.parentOffset, '\n', '\0')
    const match = beforeCaret.match(/(?:^|\s)\/([^\s/]*)$/)
    if (!match) {
      if (slashRef.current) closeSlash()
      return
    }
    const query = match[1].toLowerCase()
    const commandFrom = from - query.length - 1
    try {
      const coordinates = editor.view.coordsAtPos(from)
      const menuHeight = 388
      const y = coordinates.bottom + menuHeight > window.innerHeight
        ? Math.max(12, coordinates.top - menuHeight - 4)
        : coordinates.bottom + 4
      setSlash({
        from: commandFrom,
        to: from,
        query,
        x: Math.max(12, Math.min(coordinates.left, window.innerWidth - 252)),
        y,
      })
    } catch {
      closeSlash()
    }
  }

  useEffect(() => {
    if (!editor) return undefined
    editor.on('update', refreshSlash)
    editor.on('selectionUpdate', refreshSlash)
    editor.on('focus', refreshSlash)
    editor.on('blur', closeSlash)
    return () => {
      editor.off('update', refreshSlash)
      editor.off('selectionUpdate', refreshSlash)
      editor.off('focus', refreshSlash)
      editor.off('blur', closeSlash)
    }
  })

  const filteredCommands = useMemo(() => COMMANDS.filter((item) => (
    !slash?.query || `${item.label} ${item.desc}`.toLowerCase().includes(slash.query)
  )), [slash?.query])

  useEffect(() => {
    if (slashIndex >= filteredCommands.length) setSlashIndex(0)
  }, [filteredCommands.length, slashIndex])

  const runCommand = (action) => {
    if (!editor) return
    let chain = editor.chain().focus()
    if (slashRef.current) chain = chain.deleteRange({ from: slashRef.current.from, to: slashRef.current.to })
    closeSlash()
    if (action === 'h1') chain.setHeading({ level: 1 }).run()
    else if (action === 'h2') chain.setHeading({ level: 2 }).run()
    else if (action === 'p') chain.setParagraph().run()
    else if (action === 'blockquote') chain.toggleBlockquote().run()
    else if (action === 'bulletList') chain.toggleBulletList().run()
    else if (action === 'orderedList') chain.toggleOrderedList().run()
    else if (action === 'divider') chain.setHorizontalRule().run()
    else if (action === 'embed') {
      chain.run()
      onOpenCharts?.()
    }
  }

  const editLink = () => {
    if (!editor) return
    const current = editor.getAttributes('link').href || ''
    const entered = window.prompt('Enter URL', current)
    if (entered == null) return
    if (!entered.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    const href = normalizePublicUrl(entered, { assumeHttps: true })
    if (!href) {
      showToast?.('Enter a safe http, https, email, telephone, or anchor link.')
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href, target: '_blank', rel: 'noopener noreferrer' }).run()
  }

  useImperativeHandle(ref, () => ({
    focus: () => editor?.commands.focus('end'),
    getHTML: () => (editor && !editor.isEmpty ? editor.getHTML() : ''),
    insertHTML: (html) => {
      if (!editor || !html) return false
      const chain = editor.chain().focus('end')
      if (!editor.isEmpty) chain.setHorizontalRule()
      chain.insertContent(html).run()
      return true
    },
    insertChart: (chart) => {
      if (!editor || !chart?.id) return false
      editor.chain().focus('end').insertContent({
        type: 'chartPlaceholder',
        attrs: { chartId: chart.id, title: chart.title, chartType: chart.type },
      }).run()
      return true
    },
    removeChart: (chartId) => {
      if (!editor || !chartId) return false
      const ranges = []
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'chartPlaceholder' && node.attrs.chartId === chartId) ranges.push({ from: pos, to: pos + node.nodeSize })
      })
      const transaction = editor.state.tr
      ranges.reverse().forEach(({ from, to }) => transaction.delete(from, to))
      if (ranges.length) editor.view.dispatch(transaction)
      return Boolean(ranges.length)
    },
  }), [editor])

  const handleKeyDown = (event) => {
    if (!slash || event.isComposing) return
    if (event.key === 'Escape') {
      event.preventDefault()
      closeSlash()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!filteredCommands.length) return
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setSlashIndex((current) => (current + direction + filteredCommands.length) % filteredCommands.length)
    } else if ((event.key === 'Enter' || event.key === 'Tab') && filteredCommands.length) {
      event.preventDefault()
      runCommand(filteredCommands[slashIndex]?.action || filteredCommands[0].action)
    }
  }

  return (
    <div className="structured-thesis-editor" onKeyDown={handleKeyDown}>
      <div className="sticky top-[57px] md:top-0 z-20 flex items-center gap-0.5 py-2 mb-3 border-b bg-white overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
        <ToolbarButton label="Undo" disabled={!editor?.can().chain().focus().undo().run()} onClick={() => editor?.chain().focus().undo().run()}><i className="icon-undo-2"></i></ToolbarButton>
        <ToolbarButton label="Redo" disabled={!editor?.can().chain().focus().redo().run()} onClick={() => editor?.chain().focus().redo().run()}><i className="icon-redo-2"></i></ToolbarButton>
        <div className="w-px h-4 mx-1" style={{ background: 'var(--border)' }}></div>
        <ToolbarButton label="Bold" active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}><i className="icon-bold"></i></ToolbarButton>
        <ToolbarButton label="Italic" active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}><i className="icon-italic"></i></ToolbarButton>
        <ToolbarButton label="Underline" active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()}><i className="icon-underline"></i></ToolbarButton>
        <ToolbarButton label="Strikethrough" active={editor?.isActive('strike')} onClick={() => editor?.chain().focus().toggleStrike().run()}><i className="icon-strikethrough"></i></ToolbarButton>
        <div className="w-px h-4 mx-1" style={{ background: 'var(--border)' }}></div>
        <ToolbarButton label="Heading 1" active={editor?.isActive('heading', { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}><span className="font-serif text-xs font-semibold">H1</span></ToolbarButton>
        <ToolbarButton label="Heading 2" active={editor?.isActive('heading', { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><span className="font-serif text-xs font-semibold">H2</span></ToolbarButton>
        <ToolbarButton label="Paragraph" active={editor?.isActive('paragraph')} onClick={() => editor?.chain().focus().setParagraph().run()}><span className="text-xs">¶</span></ToolbarButton>
        <ToolbarButton label="Quote" active={editor?.isActive('blockquote')} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><i className="icon-quote"></i></ToolbarButton>
        <div className="w-px h-4 mx-1" style={{ background: 'var(--border)' }}></div>
        <ToolbarButton label="Bullet list" active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}><i className="icon-list"></i></ToolbarButton>
        <ToolbarButton label="Numbered list" active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><i className="icon-list-ordered"></i></ToolbarButton>
        <ToolbarButton label="Link" active={editor?.isActive('link')} onClick={editLink}><i className="icon-link"></i></ToolbarButton>
        <ToolbarButton label="Divider" onClick={() => editor?.chain().focus().setHorizontalRule().run()}><i className="icon-minus"></i></ToolbarButton>
        <ToolbarButton label="Embed chart" onClick={() => onOpenCharts?.()}><i className="icon-chart-no-axes-column"></i></ToolbarButton>
        <button type="button" className="editor-command-hint hidden sm:block ml-auto" onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().insertContent('/').run()}>
          Type <kbd>/</kbd> for commands
        </button>
        <button
          type="button"
          className="editor-command-hint whitespace-nowrap sm:ml-2"
          onClick={() => documentInputRef.current?.click()}
          disabled={importingDocument}
          title="Import a Word DOCX document"
        >
          <i className="icon-file-text text-xs mr-1"></i>{importingDocument ? 'Importing…' : 'Import DOCX'}
        </button>
        <input
          ref={documentInputRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(event) => onImportFile(event.target.files?.[0])}
        />
      </div>

      {editor ? <EditorContent editor={editor} /> : <div className="editor-content" aria-busy="true" />}

      {slash && (
        <div className="slash-menu" role="listbox" aria-label="Editor commands" style={{ position: 'fixed', left: slash.x, top: slash.y }}>
          {filteredCommands.map((item, index) => (
            <button
              type="button"
              key={item.action}
              className={`slash-item w-full text-left ${index === slashIndex ? 'active' : ''}`}
              role="option"
              aria-selected={index === slashIndex}
              onMouseEnter={() => setSlashIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runCommand(item.action)}
            >
              <span className="icon">{item.icon}</span>
              <span>
                <span className="block font-medium">{item.label}</span>
                <span className="block text-[11px]" style={{ color: 'var(--muted)' }}>{item.desc}</span>
              </span>
            </button>
          ))}
          {!filteredCommands.length && <div className="px-3 py-4 text-xs text-center" style={{ color: 'var(--muted)' }}>No matching commands</div>}
        </div>
      )}
    </div>
  )
})

export default ThesisEditor
