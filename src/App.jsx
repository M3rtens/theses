'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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

export default function App() {
  const [view, setView] = useState('dashboard')
  const [editorDraft, setEditorDraft] = useState(null)
  const [toast, setToast] = useState('')
  const [publishOpen, setPublishOpen] = useState(false)
  const [pendingDraft, setPendingDraft] = useState(null)
  const [publishing, setPublishing] = useState(false)
  const toastTimer = useRef(null)

  // A second arg carries a draft into the editor (Continue editing); any other
  // navigation clears it so the editor opens fresh.
  const navigate = useCallback((next, payload = null) => {
    setEditorDraft(next === 'editor' ? payload : null)
    setView(next)
    window.scrollTo(0, 0)
  }, [])

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

  const openPublish = useCallback((draft) => {
    setPendingDraft(draft)
    setPublishOpen(true)
  }, [])

  const confirmPublish = async () => {
    if (!pendingDraft || publishing) return
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
      setPublishOpen(false)
      setPendingDraft(null)
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
      case 'thesis': return <ThesisDetail navigate={navigate} />
      case 'leaderboard': return <Leaderboard navigate={navigate} />
      case 'profile': return <Profile navigate={navigate} />
      case 'mytheses': return <MyTheses navigate={navigate} />
      case 'drafts': return <Drafts navigate={navigate} />
      case 'triggers': return <Triggers navigate={navigate} />
      case 'discover': return <Discover navigate={navigate} />
      default: return <Dashboard navigate={navigate} />
    }
  }

  return (
    <div id="app" className="relative z-10 flex min-h-screen">
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
