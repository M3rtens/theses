import AppShell from '../src/components/AppShell.jsx'

const ROOT_VIEWS = new Set([
  'dashboard', 'editor', 'profile', 'mytheses', 'drafts', 'triggers',
  'notifications', 'leaderboard', 'discover',
])

export default async function Page({ searchParams }) {
  const query = await searchParams
  const requestedView = String(query?.view || '')
  return <AppShell initialView={ROOT_VIEWS.has(requestedView) ? requestedView : null} />
}
