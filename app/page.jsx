import App from '../src/App.jsx'
import UserProvider from '../src/components/UserProvider.jsx'
import DataProvider from '../src/components/DataProvider.jsx'
import { createClient } from '../src/lib/supabase/server'
import { deriveIdentity } from '../src/lib/user.js'

export default async function Page() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Resolve identity without gating the page: guests receive the same app shell
  // with public navigation and read-only community data.
  return (
    <UserProvider user={user ? deriveIdentity(user) : null}>
      <DataProvider>
        <App />
      </DataProvider>
    </UserProvider>
  )
}
