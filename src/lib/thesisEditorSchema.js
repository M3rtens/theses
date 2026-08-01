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

  renderHTML() {
    return [
      'div',
      {
        class: 'thesis-chart-placeholder my-4 p-4 border rounded',
        'data-thesis-chart-placeholder': 'true',
        contenteditable: 'false',
      },
      ['div', { class: 'text-[10px] font-mono uppercase tracking-wider' }, 'Embedded Chart'],
      ['div', { class: 'text-sm font-medium mt-1' }, 'Revenue & Margin Trajectory'],
      ['div', { class: 'text-xs mt-1' }, 'Linked to model · auto-updates'],
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
  ]
}
