import 'server-only'
import { cache } from 'react'
import { getPublicAnalystBySlug } from './publicAnalystsStore.js'
import { getPublicThesisById } from './publicThesesStore.js'

// generateMetadata and the page component read the same record during one
// render. React cache keeps that server work to a single lookup.
export const findPublicThesis = cache(getPublicThesisById)
export const findPublicAnalyst = cache(getPublicAnalystBySlug)

export function plainTextExcerpt(html, maximum = 180) {
  const text = String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= maximum) return text
  return `${text.slice(0, maximum).replace(/\s+\S*$/, '')}…`
}
