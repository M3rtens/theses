'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useUser } from './UserProvider.jsx'
import { relativeTime } from '../lib/drafts.js'

const REPORT_REASONS = [
  ['spam', 'Spam'],
  ['harassment', 'Harassment'],
  ['misinformation', 'Misleading information'],
  ['other', 'Other'],
]

async function readResponse(response) {
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`)
  return data
}

export default function ThesisDiscussion({ thesisId }) {
  const user = useUser()
  const router = useRouter()
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState(null)

  const loadComments = async () => {
    if (!thesisId) return
    try {
      const rows = await readResponse(await fetch(`/api/theses/${thesisId}/comments`))
      setComments(Array.isArray(rows) ? rows : [])
      setError('')
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setComments([])
    setLoading(true)
    setError('')
    setDraft('')
    setReplyTo(null)
    setReport(null)
    loadComments()
    // loadComments is deliberately scoped to the current thesis id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thesisId, user?.id])

  const repliesByParent = useMemo(() => comments.reduce((map, comment) => {
    if (comment.parentId) {
      const replies = map.get(comment.parentId) || []
      replies.push(comment)
      map.set(comment.parentId, replies)
    }
    return map
  }, new Map()), [comments])
  const roots = comments.filter((comment) => !comment.parentId)
  const visibleCount = comments.filter((comment) => comment.status === 'visible').length

  const requireSignIn = () => {
    router.push('/sign-in')
  }

  const submitComment = async () => {
    if (!user) return requireSignIn()
    if (!draft.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      await readResponse(await fetch(`/api/theses/${thesisId}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: draft, parentId: replyTo?.id || null }),
      }))
      setDraft('')
      setReplyTo(null)
      await loadComments()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  const removeComment = async (comment) => {
    if (!window.confirm(comment.userId === user?.id
      ? 'Remove your comment? Replies will remain visible.'
      : 'Moderate this comment? Its text will be hidden and the action recorded.')) return
    setBusy(true)
    setError('')
    try {
      await readResponse(await fetch(`/api/comments/${comment.id}`, { method: 'DELETE' }))
      await loadComments()
    } catch (removeError) {
      setError(removeError.message)
    } finally {
      setBusy(false)
    }
  }

  const submitReport = async () => {
    if (!report || busy) return
    setBusy(true)
    setError('')
    try {
      await readResponse(await fetch(`/api/comments/${report.id}/report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: report.reason, details: report.details }),
      }))
      setReport(null)
      await loadComments()
    } catch (reportError) {
      setError(reportError.message)
    } finally {
      setBusy(false)
    }
  }

  const startReply = (comment) => {
    if (!user) return requireSignIn()
    setReplyTo(comment)
    setDraft('')
    document.getElementById(`discussion-composer-${thesisId}`)?.focus()
  }

  const renderComment = (comment, reply = false) => {
    const removed = comment.status === 'removed'
    return (
      <article key={comment.id} className={`${reply ? 'ml-6 sm:ml-10' : ''} border rounded-md p-4`} style={{ borderColor: 'var(--border)', background: removed ? 'var(--bg-warm)' : 'white' }}>
        <div className="flex items-start gap-3">
          <span className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-[10px] font-semibold shrink-0" style={{ background: removed ? 'var(--border)' : 'var(--ink)', color: removed ? 'var(--muted)' : 'white' }}>{comment.avatar || '—'}</span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {comment.authorSlug
                ? <Link href={`/analysts/${comment.authorSlug}`} className="text-sm font-medium hover:underline">{comment.author}</Link>
                : <span className="text-sm font-medium">{comment.author}</span>}
              {comment.verified && <i className="icon-badge-check text-[11px]" style={{ color: 'var(--bull)' }} aria-label="Verified analyst"></i>}
              <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>{relativeTime(Date.parse(comment.createdAt))}</span>
              {comment.reportCount > 0 && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>{comment.reportCount} report{comment.reportCount === 1 ? '' : 's'}</span>}
            </div>
            {removed
              ? <p className="text-sm italic mt-2" style={{ color: 'var(--muted)' }}>This comment was removed.</p>
              : <p className="text-sm leading-relaxed whitespace-pre-wrap mt-2" style={{ color: 'var(--ink-soft)' }}>{comment.body}</p>}
            {!removed && (
              <div className="flex flex-wrap items-center gap-3 mt-3 text-[11px]">
                {!reply && <button type="button" onClick={() => startReply(comment)} className="font-medium hover:underline" style={{ color: 'var(--ink-soft)', background: 'transparent' }}>Reply</button>}
                {comment.canRemove && <button type="button" disabled={busy} onClick={() => removeComment(comment)} className="hover:underline" style={{ color: 'var(--bear)', background: 'transparent' }}>{comment.userId === user?.id ? 'Remove' : 'Moderate'}</button>}
                {comment.canReport && (
                  <button type="button" disabled={busy || comment.reportedByViewer} onClick={() => setReport({ id: comment.id, reason: 'spam', details: '' })} className="hover:underline" style={{ color: 'var(--muted)', background: 'transparent' }}>{comment.reportedByViewer ? 'Reported' : 'Report'}</button>
                )}
              </div>
            )}
          </div>
        </div>
      </article>
    )
  }

  return (
    <section className="mt-12 pt-10 border-t" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-baseline justify-between gap-4 mb-5">
        <div>
          <h3 className="font-serif text-xl font-medium">Discussion</h3>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Discuss the published record. Comments do not alter the sealed thesis.</p>
        </div>
        <span className="text-xs font-mono shrink-0" style={{ color: 'var(--muted)' }}>{visibleCount} comment{visibleCount === 1 ? '' : 's'}</span>
      </div>

      <div className="p-4 border rounded-md mb-6" style={{ borderColor: 'var(--border-strong)', background: 'var(--bg-warm)' }}>
        {replyTo && (
          <div className="flex items-center justify-between gap-3 mb-2 text-xs">
            <span style={{ color: 'var(--ink-soft)' }}>Replying to <strong>{replyTo.author}</strong></span>
            <button type="button" onClick={() => { setReplyTo(null); setDraft('') }} className="hover:underline" style={{ color: 'var(--muted)', background: 'transparent' }}>Cancel reply</button>
          </div>
        )}
        <textarea
          id={`discussion-composer-${thesisId}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => { if (!user) requireSignIn() }}
          placeholder={user ? (replyTo ? 'Write a constructive reply…' : 'Add to the discussion…') : 'Sign in to join the discussion'}
          rows={3}
          maxLength={2000}
          readOnly={!user}
          className="w-full text-sm p-3 border rounded resize-y"
          style={{ borderColor: 'var(--border)', background: 'white', color: 'var(--ink)' }}
        />
        <div className="flex items-center justify-between gap-3 mt-2">
          <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>{draft.length}/2000</span>
          <button type="button" disabled={busy || !draft.trim()} onClick={submitComment} className="btn-primary text-xs px-3 py-1.5 rounded-md" style={{ opacity: busy || !draft.trim() ? 0.5 : 1 }}>{busy ? 'Posting…' : replyTo ? 'Post reply' : 'Post comment'}</button>
        </div>
      </div>

      {error && <p className="text-xs mb-4" style={{ color: 'var(--bear)' }}>{error}</p>}
      {loading && <p className="text-sm" style={{ color: 'var(--muted)' }}>Loading discussion…</p>}
      {!loading && !roots.length && <p className="text-sm" style={{ color: 'var(--muted)' }}>No comments yet. Start the discussion.</p>}
      <div className="space-y-3">
        {roots.map((comment) => (
          <div key={comment.id} className="space-y-2">
            {renderComment(comment)}
            {(repliesByParent.get(comment.id) || []).map((reply) => renderComment(reply, true))}
          </div>
        ))}
      </div>

      {report && (
        <div className="mt-4 p-4 border rounded-md" style={{ borderColor: 'var(--border-strong)', background: 'white' }}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h4 className="text-sm font-medium">Report comment</h4>
            <button type="button" onClick={() => setReport(null)} className="toolbar-btn" aria-label="Cancel report"><i className="icon-x text-sm"></i></button>
          </div>
          <select value={report.reason} onChange={(event) => setReport((current) => ({ ...current, reason: event.target.value }))} className="w-full text-sm p-2 border rounded mb-2" style={{ borderColor: 'var(--border)', background: 'white' }}>
            {REPORT_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <textarea value={report.details} onChange={(event) => setReport((current) => ({ ...current, details: event.target.value }))} maxLength={500} rows={2} placeholder="Optional details" className="w-full text-sm p-2 border rounded resize-y" style={{ borderColor: 'var(--border)', background: 'white' }} />
          <div className="flex justify-end mt-2">
            <button type="button" disabled={busy} onClick={submitReport} className="btn-secondary text-xs px-3 py-1.5 rounded-md">{busy ? 'Submitting…' : 'Submit report'}</button>
          </div>
        </div>
      )}
    </section>
  )
}
