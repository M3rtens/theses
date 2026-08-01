'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useUser } from './components/UserProvider.jsx'
import { useData } from './components/DataProvider.jsx'
import { deleteDraft } from './lib/drafts.js'
import { createClient } from './lib/supabase/client'
import Sidebar from './components/Sidebar.jsx'
import Toast from './components/Toast.jsx'
import PublishModal from './components/PublishModal.jsx'
import Dashboard from './views/Dashboard.jsx'
import Editor from './views/Editor.jsx'
import ThesisDetail from './views/ThesisDetail.jsx'
import Leaderboard from './views/Leaderboard.jsx'
import Profile from './views/Profile.jsx'
import MyTheses from './views/MyTheses.jsx'
import Drafts from './views/Drafts.jsx'
import Triggers from './views/Triggers.jsx'
import Discover from './views/Discover.jsx'
import Notifications from './views/Notifications.jsx'
import AnalystProfile from './views/AnalystProfile.jsx'
import { fmtPrice } from './lib/format.js'

const PROTECTED_VIEWS = new Set(['dashboard', 'editor', 'profile', 'mytheses', 'drafts', 'triggers', 'notifications'])

export default function App({ initialView = null, initialThesis = null, initialAnalyst = null }) {
  const user = useUser()
  const router = useRouter()
  const pathname = usePathname()
  const { refresh } = useData()
  const allowedInitialView = initialView && (!PROTECTED_VIEWS.has(initialView) || user)
    ? initialView
    : (user ? 'dashboard' : 'discover')
  const [view, setView] = useState(allowedInitialView)
  const [editorDraft, setEditorDraft] = useState(null)
  const [activeThesis, setActiveThesis] = useState(initialThesis)
  const [activeAnalyst, setActiveAnalyst] = useState(initialAnalyst)
  const [toast, setToast] = useState('')
  const [publishOpen, setPublishOpen] = useState(false)
  const [pendingDraft, setPendingDraft] = useState(null)
  const [publishing, setPublishing] = useState(false)
  const toastTimer = useRef(null)
  // Skip the cache refresh on the profile upsert's first (mount) run — the
  // provider already loaded fresh data; only later identity changes need it.
  const identitySettled = useRef(false)

  // A second arg carries a draft into the editor (Continue editing); any other
  // navigation clears it so the editor opens fresh.
  const navigate = useCallback((next, payload = null) => {
    if (!user && PROTECTED_VIEWS.has(next)) {
      router.push('/sign-in')
      return
    }
    if (next === 'thesis' && payload?.id) {
      router.push(`/theses/${payload.id}`)
      return
    }
    if (next === 'analyst' && payload?.slug) {
      router.push(`/analysts/${payload.slug}`)
      return
    }
    setEditorDraft(next === 'editor' ? payload : null)
    setView(next)
    window.scrollTo(0, 0)
    if (pathname !== '/') router.push(`/?view=${encodeURIComponent(next)}`)
    else window.history.replaceState(null, '', `/?view=${encodeURIComponent(next)}`)
  }, [pathname, router, user])

  // Server-backed route changes can preserve the client shell. Keep its local
  // view selection aligned with the new canonical route props.
  useEffect(() => {
    if (!initialView) return
    if (!user && PROTECTED_VIEWS.has(initialView)) {
      setView('discover')
      return
    }
    setView(initialView)
    setActiveThesis(initialThesis)
    setActiveAnalyst(initialAnalyst)
    window.scrollTo(0, 0)
  }, [initialView, initialThesis, initialAnalyst, user])

  // A sign-out refresh can preserve client component state. Move any protected
  // view back to the public feed as soon as the session disappears.
  useEffect(() => {
    if (!user && PROTECTED_VIEWS.has(view)) {
      setEditorDraft(null)
      setActiveThesis(null)
      setView('discover')
    }
  }, [user, view])

  const showToast = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3200)
  }, [])

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        navigate('editor')
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  useEffect(() => {
    document.body.classList.toggle('modal-open', publishOpen)
  }, [publishOpen])

  // Keep the user's public profile row in step with their current identity, so
  // the leaderboard and public pages show the right name/avatar (and pick up
  // name changes). Owner-only write, enforced by RLS.
  useEffect(() => {
    if (!user?.id) return
    createClient()
      .from('profiles')
      .upsert({
        id: user.id,
        name: user.name,
        handle: user.handle,
        avatar: user.avatar,
        updated_at: new Date().toISOString(),
      })
      .then(() => {
        // Reflect a name/avatar change on the leaderboard and community feed.
        if (identitySettled.current) refresh()
        identitySettled.current = true
      }, () => { /* profiles table not ready / offline */ })
  }, [user?.id, user?.name, user?.handle, user?.avatar, refresh])

  const openPublish = useCallback((draft) => {
    if (!user) {
      router.push('/sign-in')
      return
    }
    setPendingDraft(draft)
    setPublishOpen(true)
  }, [router, user])

  const confirmPublish = async () => {
    if (!user || !pendingDraft || publishing) return
    setPublishing(true)
    const scheduled = Boolean(pendingDraft.scheduledPublicationDate)
    const scheduledId = pendingDraft.scheduledPublicationId
    showToast(scheduled ? 'Saving publication schedule…' : 'Publishing · locking entry price from exchange feed…')
    try {
      const endpoint = scheduledId
        ? scheduled
          ? `/api/scheduled-publications/${scheduledId}`
          : `/api/scheduled-publications/${scheduledId}/publish-now`
        : scheduled
          ? '/api/scheduled-publications'
          : '/api/theses'
      const requestBody = scheduledId && scheduled
        ? { action: 'update', thesis: pendingDraft }
        : pendingDraft
      const res = await fetch(endpoint, {
        method: scheduledId && scheduled ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      const localDraftId = pendingDraft.localDraftId || pendingDraft.draftId
      if (localDraftId) deleteDraft(localDraftId, user?.id)
      if (pendingDraft.cloudDraftId) {
        // Publication already succeeded, so draft cleanup is deliberately
        // best-effort and cannot roll the publication back.
        await fetch(`/api/drafts/${pendingDraft.cloudDraftId}`, { method: 'DELETE' }).catch(() => null)
      }
      setPublishOpen(false)
      setPendingDraft(null)
      refresh()
      if (scheduled) {
        showToast(`Publication scheduled for ${pendingDraft.scheduledPublicationDate}. You can edit or cancel it until processing begins.`)
        setTimeout(() => navigate('drafts'), 500)
      } else {
        showToast(`Thesis published. Entry locked at ${fmtPrice(data.entry, data.currency)} · Timestamp sealed.`)
        setTimeout(() => navigate('mytheses'), 800)
      }
    } catch (e) {
      showToast(`Publish failed: ${e.message}`)
    } finally {
      setPublishing(false)
    }
  }

  const renderView = () => {
    switch (view) {
      case 'dashboard': return <Dashboard navigate={navigate} />
      case 'editor': return <Editor key={editorDraft?.id || 'new'} draft={editorDraft} navigate={navigate} showToast={showToast} onOpenPublish={openPublish} />
      case 'thesis': return <ThesisDetail navigate={navigate} thesis={activeThesis} />
      case 'leaderboard': return <Leaderboard />
      case 'analyst': return <AnalystProfile analyst={activeAnalyst} navigate={navigate} />
      case 'profile': return <Profile navigate={navigate} />
      case 'mytheses': return <MyTheses navigate={navigate} />
      case 'drafts': return <Drafts navigate={navigate} />
      case 'triggers': return <Triggers navigate={navigate} />
      case 'notifications': return <Notifications navigate={navigate} />
      case 'discover': return <Discover navigate={navigate} />
      default: return <Dashboard navigate={navigate} />
    }
  }

  return (
    <div id="app" className="relative z-10 flex min-h-screen flex-col md:flex-row">
      <Sidebar view={view} navigate={navigate} />
      <main className="flex-1 min-w-0">
        <section key={view} className="view view-enter">
          {renderView()}
        </section>
      </main>

      <PublishModal open={publishOpen} publishing={publishing} draft={pendingDraft} onClose={() => setPublishOpen(false)} onConfirm={confirmPublish} />
      <Toast message={toast} />
    </div>
  )
}
