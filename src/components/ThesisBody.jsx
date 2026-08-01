'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ModelChart from './ModelChart.jsx'

export default function ThesisBody({ html, model }) {
  const [targets, setTargets] = useState([])
  const bodyRef = useRef(null)

  useEffect(() => {
    const nextTargets = Array.from(bodyRef.current?.querySelectorAll('[data-thesis-chart-id]') || [])
    nextTargets.forEach((target) => target.replaceChildren())
    setTargets(nextTargets)
  }, [html, model])

  const charts = Array.isArray(model?.charts) ? model.charts : []
  return <>
    <article ref={bodyRef} data-thesis-body className="editor-content" style={{ minHeight: 'auto' }} dangerouslySetInnerHTML={{ __html: html }} />
    {targets.map((target) => {
      const id = target.getAttribute('data-thesis-chart-id')
      const chart = charts.find((item) => item.id === id)
      return chart ? createPortal(<ModelChart chart={chart} model={model} />, target, id) : null
    })}
  </>
}
