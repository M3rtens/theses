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

export default function App() {
  const [view, setView] = useState('dashboard')
  const [toast, setToast] = useState('')
  const [publishOpen, setPublishOpen] = useState(false)
  const toastTimer = useRef(null)

  const navigate = useCallback((next) => {
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

  const confirmPublish = () => {
    setPublishOpen(false)
    showToast('Thesis published. Entry locked at $905.40 · Timestamp sealed.')
    setTimeout(() => navigate('thesis'), 800)
  }

  const renderView = () => {
    switch (view) {
      case 'dashboard': return <Dashboard navigate={navigate} />
      case 'editor': return <Editor navigate={navigate} showToast={showToast} onOpenPublish={() => setPublishOpen(true)} />
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

      <PublishModal open={publishOpen} onClose={() => setPublishOpen(false)} onConfirm={confirmPublish} />
      <Toast message={toast} />
    </div>
  )
}
