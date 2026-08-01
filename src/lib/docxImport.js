import mammoth from 'mammoth'
import { sanitizeThesisHtml } from './html.js'

export const DOCX_MAX_BYTES = 8 * 1024 * 1024
export const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const DOCX_MAX_HTML_BYTES = 1_500_000

export class DocxImportError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'DocxImportError'
    this.status = status
  }
}

function decodedFilename(value) {
  try {
    return decodeURIComponent(value || '')
  } catch {
    throw new DocxImportError('invalid document filename')
  }
}

export async function readDocxRequest(request) {
  const contentType = (request.headers.get('content-type') || '').split(';', 1)[0].toLowerCase()
  if (![DOCX_CONTENT_TYPE, 'application/octet-stream'].includes(contentType)) {
    throw new DocxImportError('content-type must be a DOCX document', 415)
  }

  const filename = decodedFilename(request.headers.get('x-file-name')).trim()
  if (!filename.toLowerCase().endsWith('.docx')) {
    throw new DocxImportError('only .docx files are supported')
  }

  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > DOCX_MAX_BYTES) {
    throw new DocxImportError('DOCX file must be 8 MB or smaller', 413)
  }

  const buffer = Buffer.from(await request.arrayBuffer())
  if (!buffer.length) throw new DocxImportError('DOCX file is empty')
  if (buffer.length > DOCX_MAX_BYTES) throw new DocxImportError('DOCX file must be 8 MB or smaller', 413)
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new DocxImportError('file is not a valid DOCX document')
  }
  return { buffer, filename }
}

function importedText(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

export function prepareImportedDocxHtml(value) {
  const html = sanitizeThesisHtml(value)
  if (Buffer.byteLength(html, 'utf8') > DOCX_MAX_HTML_BYTES) {
    throw new DocxImportError('converted document is too large to import', 413)
  }
  const text = importedText(html)
  return {
    html,
    wordCount: text ? text.split(/\s+/).length : 0,
  }
}

export async function convertDocxBuffer(buffer) {
  let result
  try {
    result = await mammoth.convertToHtml({ buffer }, {
      externalFileAccess: false,
      includeDefaultStyleMap: true,
      ignoreEmptyParagraphs: false,
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
        "p[style-name='Quote'] => blockquote:fresh",
      ],
    })
  } catch {
    throw new DocxImportError('DOCX file could not be read; it may be corrupted', 422)
  }

  const imported = prepareImportedDocxHtml(result.value)
  if (!imported.wordCount) throw new DocxImportError('DOCX document contains no importable text', 422)
  return {
    ...imported,
    warningCount: (result.messages || []).filter((message) => message.type === 'warning').length,
  }
}
