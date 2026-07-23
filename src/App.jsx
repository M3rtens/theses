'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { fmtPrice } from './lib/format.js'

const PROTECTED_VIEWS = new Set(['dashboard', 'editor', 'profile', 'mytheses', 'drafts', 'triggers'])

export default function App() {
  const user = useUser()
  const router = useRouter()
  const { refresh } = useData()
  const [view, setView] = useState(() => (user ? 'dashboard' : 'discover'))
  const [editorDraft, setEditorDraft] = useState(null)
  const [activeThesis, setActiveThesis] = useState(null)
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
    setEditorDraft(next === 'editor' ? payload : null)
    if (next === 'thesis') setActiveThesis(payload)
    setView(next)
    window.scrollTo(0, 0)
  }, [router, user])

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
    showToast('Publishing · locking entry price from exchange feed…')
    try {
      const res = await fetch('/api/theses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(pendingDraft),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      // Published successfully — remove the originating draft, if any, so it no
      // longer shows in Drafts.
      if (pendingDraft.draftId) deleteDraft(pendingDraft.draftId, user?.id)
      setPublishOpen(false)
      setPendingDraft(null)
      // Pull the new thesis into the cache so every view reflects it.
      refresh()
      showToast(`Thesis published. Entry locked at ${fmtPrice(data.entry, data.currency)} · Timestamp sealed.`)
      setTimeout(() => navigate('mytheses'), 800)
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
      case 'profile': return <Profile navigate={navigate} />
      case 'mytheses': return <MyTheses navigate={navigate} />
      case 'drafts': return <Drafts navigate={navigate} />
      case 'triggers': return <Triggers navigate={navigate} />
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
