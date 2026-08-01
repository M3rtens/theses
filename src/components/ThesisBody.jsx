'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ModelChart from './ModelChart.jsx'
import { normalizeCitationUrl } from '../lib/citations.js'

const EMPTY_CITATIONS = Object.freeze([])

export default function ThesisBody({ html, model, citations }) {
  const sources = Array.isArray(citations) ? citations : EMPTY_CITATIONS
  const [chartTargets, setChartTargets] = useState([])
  const [citationTargets, setCitationTargets] = useState([])
  const bodyRef = useRef(null)

  useEffect(() => {
    const nextCharts = Array.from(bodyRef.current?.querySelectorAll('[data-thesis-chart-id]') || [])
    const nextCitations = Array.from(bodyRef.current?.querySelectorAll('[data-thesis-citation-id]') || [])
    nextCharts.forEach((target) => target.replaceChildren())
    nextCitations.forEach((target) => target.replaceChildren())
    setChartTargets(nextCharts)
    setCitationTargets(nextCitations)
  }, [html, model, sources])

  const charts = Array.isArray(model?.charts) ? model.charts : []
  return <>
    <article ref={bodyRef} data-thesis-body className="editor-content" style={{ minHeight: 'auto' }} dangerouslySetInnerHTML={{ __html: html }} />
    {chartTargets.map((target) => {
      const id = target.getAttribute('data-thesis-chart-id')
      const chart = charts.find((item) => item.id === id)
      return chart ? createPortal(<ModelChart chart={chart} model={model} />, target, id) : null
    })}
    {citationTargets.map((target, targetIndex) => {
      const id = target.getAttribute('data-thesis-citation-id')
      const citationIndex = sources.findIndex((citation) => citation.id === id)
      return citationIndex >= 0
        ? createPortal(<a href={`#reference-${id}`} aria-label={`Source ${citationIndex + 1}`}>[{citationIndex + 1}]</a>, target, `${id}-${targetIndex}`)
        : null
    })}
    {sources.length > 0 && (
      <section className="mt-12 pt-8 border-t" style={{ borderColor: 'var(--border)' }} aria-labelledby="thesis-references-heading">
        <h3 id="thesis-references-heading" className="font-serif text-xl font-medium mb-4">Sources &amp; References</h3>
        <ol className="space-y-3">
          {sources.map((citation, index) => {
            const url = normalizeCitationUrl(citation.url)
            const details = [citation.author, citation.publisher, citation.publishedAt].filter(Boolean).join(' · ')
            return (
              <li key={citation.id} id={`reference-${citation.id}`} className="flex items-start gap-3 text-sm scroll-mt-20">
                <span className="font-mono text-xs pt-0.5" style={{ color: 'var(--muted)' }}>[{index + 1}]</span>
                <span className="min-w-0">
                  {url
                    ? <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">{citation.title}</a>
                    : <span className="font-medium">{citation.title}</span>}
                  {details && <span className="block text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>{details}</span>}
                  {citation.accessedAt && <span className="block text-[10px] font-mono mt-0.5" style={{ color: 'var(--muted)' }}>Accessed {citation.accessedAt}</span>}
                </span>
              </li>
            )
          })}
        </ol>
      </section>
    )}
  </>
}
