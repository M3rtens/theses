import Link from 'next/link'
import { useData } from '../components/DataProvider.jsx'
import ThesisCard from '../components/ThesisCard.jsx'

export default function Saved({ navigate }) {
  const { social, loading } = useData()
  const following = social.following || []
  const bookmarks = social.bookmarks || []

  return (
    <>
      <header className="px-4 pt-6 pb-5 sm:px-6 sm:pt-8 sm:pb-6 lg:px-12 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Workspace</div>
        <h1 className="font-serif text-3xl font-medium tracking-tight">Saved</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>Analysts you follow and theses you want to watch.</p>
      </header>

      <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-12 max-w-6xl space-y-10">
        <section>
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="font-serif text-xl font-medium">Following</h2>
            <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>{following.length} analyst{following.length === 1 ? '' : 's'}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {following.map((analyst) => (
              <Link key={analyst.userId} href={`/analysts/${analyst.slug}`} className="border rounded-md p-4 flex items-start gap-3 hover:bg-gray-50" style={{ borderColor: 'var(--border)', background: 'white' }}>
                <span className="w-10 h-10 rounded-full flex items-center justify-center font-mono text-xs font-semibold shrink-0" style={{ background: 'var(--ink)', color: 'white' }}>{analyst.avatar || '—'}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{analyst.name}</span>
                    {analyst.verified && <i className="icon-badge-check text-xs" style={{ color: 'var(--bull)' }} aria-label="Verified analyst"></i>}
                  </span>
                  <span className="block text-[11px] font-mono" style={{ color: 'var(--muted)' }}>{analyst.handle}</span>
                  {analyst.bio && <span className="block text-xs mt-2 line-clamp-2" style={{ color: 'var(--ink-soft)' }}>{analyst.bio}</span>}
                </span>
              </Link>
            ))}
          </div>
          {!loading.social && !following.length && <p className="text-sm" style={{ color: 'var(--muted)' }}>You are not following any analysts yet. Open an analyst profile from Discover or the leaderboard to follow them.</p>}
        </section>

        <section>
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="font-serif text-xl font-medium">Bookmarked theses</h2>
            <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>{bookmarks.length} saved</span>
          </div>
          <div className="space-y-3">
            {bookmarks.map((thesis) => <ThesisCard key={thesis.id} thesis={thesis} onOpen={() => navigate('thesis', thesis)} />)}
          </div>
          {!loading.social && !bookmarks.length && <p className="text-sm" style={{ color: 'var(--muted)' }}>No bookmarked theses yet. Use the bookmark button on any published thesis.</p>}
        </section>
      </div>
    </>
  )
}
