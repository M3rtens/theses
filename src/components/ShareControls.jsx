'use client'

import { useEffect, useRef, useState } from 'react'

function fallbackCopy(value) {
  const field = document.createElement('textarea')
  field.value = value
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()
  const copied = document.execCommand('copy')
  field.remove()
  return copied
}

export default function ShareControls({ path, title, text = '' }) {
  const [status, setStatus] = useState('')
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const showStatus = (message) => {
    setStatus(message)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setStatus(''), 2200)
  }

  const url = () => new URL(path, window.location.origin).href
  const copyLink = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url())
      else if (!fallbackCopy(url())) throw new Error('copy failed')
      showStatus('Link copied')
    } catch {
      showStatus('Could not copy link')
    }
  }

  const share = async () => {
    if (!navigator.share) {
      await copyLink()
      return
    }
    try {
      await navigator.share({ title, text, url: url() })
      showStatus('Shared')
    } catch (error) {
      if (error?.name !== 'AbortError') showStatus('Could not share')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={share} className="btn-secondary text-xs px-3 py-1.5 rounded-md inline-flex items-center gap-1.5">
        <i className="icon-share-2 text-xs"></i> Share
      </button>
      <button type="button" onClick={copyLink} className="btn-secondary text-xs px-3 py-1.5 rounded-md inline-flex items-center gap-1.5">
        <i className="icon-link text-xs"></i> Copy link
      </button>
      <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }} aria-live="polite">{status}</span>
    </div>
  )
}
