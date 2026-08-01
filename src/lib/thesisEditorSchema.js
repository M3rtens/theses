import { Node } from '@tiptap/core'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import { normalizePublicUrl } from './urls.js'

export const ChartPlaceholder = Node.create({
  name: 'chartPlaceholder',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      chartId: { default: null, parseHTML: (element) => element.getAttribute('data-thesis-chart-id') },
      title: { default: 'Embedded Chart', parseHTML: (element) => element.getAttribute('data-thesis-chart-title') || element.querySelector('.font-medium')?.textContent || 'Embedded Chart' },
      chartType: { default: 'line', parseHTML: (element) => element.getAttribute('data-thesis-chart-type') || 'line' },
    }
  },

  parseHTML() {
    return [{
      tag: 'div[data-thesis-chart-placeholder], div.my-4.p-4.border.rounded',
      getAttrs: (element) => (
        element.getAttribute('data-thesis-chart-placeholder') === 'true'
        || /embedded chart/i.test(element.textContent || '')
          ? {}
          : false
      ),
    }]
  },

  renderHTML({ node }) {
    const { chartId, title, chartType } = node.attrs
    return [
      'div',
      {
        class: 'thesis-chart-placeholder my-4 p-4 border rounded',
        'data-thesis-chart-placeholder': 'true',
        ...(chartId ? { 'data-thesis-chart-id': chartId } : {}),
        'data-thesis-chart-title': title,
        'data-thesis-chart-type': chartType,
        contenteditable: 'false',
      },
      ['div', { class: 'text-[10px] font-mono uppercase tracking-wider' }, chartId ? `${chartType} chart` : 'Embedded Chart'],
      ['div', { class: 'text-sm font-medium mt-1' }, title],
      ['div', { class: 'text-xs mt-1' }, chartId ? 'Linked to sealed model data' : 'Choose a chart from the Charts tab'],
    ]
  },
})

export const CitationReference = Node.create({
  name: 'citationReference',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      citationId: { default: null, parseHTML: (element) => element.getAttribute('data-thesis-citation-id') },
      label: { default: '1', parseHTML: (element) => element.getAttribute('data-thesis-citation-label') || String(element.textContent || '').replace(/\D/g, '') || '1' },
    }
  },

  parseHTML() {
    return [{ tag: 'sup[data-thesis-citation-id]' }]
  },

  renderHTML({ node }) {
    const { citationId, label } = node.attrs
    return [
      'sup',
      {
        class: 'thesis-citation',
        'data-thesis-citation-id': citationId,
        'data-thesis-citation-label': label,
        contenteditable: 'false',
      },
      ['a', { href: `#reference-${citationId}` }, `[${label}]`],
    ]
  },
})

export function createThesisEditorExtensions() {
  return [
    StarterKit.configure({
      code: false,
      codeBlock: false,
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        enableClickSelection: true,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        protocols: ['http', 'https', 'mailto', 'tel'],
        isAllowedUri: (url) => normalizePublicUrl(url, { assumeHttps: true }) != null,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      },
    }),
    Placeholder.configure({ placeholder: 'Begin your thesis… Type / for commands, or import a DOCX document.' }),
    ChartPlaceholder,
    CitationReference,
  ]
}
