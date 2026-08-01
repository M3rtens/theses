import sanitizeHtml from 'sanitize-html'

const EMBED_CLASSES = [
  'my-4',
  'p-4',
  'border',
  'rounded',
  'text-[10px]',
  'font-mono',
  'uppercase',
  'tracking-wider',
  'text-sm',
  'font-medium',
  'mt-1',
  'text-xs',
]

export function sanitizeThesisHtml(value) {
  return sanitizeHtml(String(value || ''), {
    allowedTags: [
      'p', 'br', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's',
      'strike', 'blockquote', 'ul', 'ol', 'li', 'a', 'hr', 'div', 'span',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      div: ['class'],
      span: ['class'],
    },
    allowedClasses: {
      div: EMBED_CLASSES,
      span: EMBED_CLASSES,
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    enforceHtmlBoundary: true,
    transformTags: {
      a: (_tagName, attributes) => {
        const target = attributes.target === '_blank' ? '_blank' : undefined
        return {
          tagName: 'a',
          attribs: {
            ...(attributes.href ? { href: attributes.href } : {}),
            ...(target ? { target, rel: 'noopener noreferrer' } : {}),
          },
        }
      },
    },
  })
}

