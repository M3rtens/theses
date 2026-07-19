import App from '../src/App.jsx'
import Login from '../src/components/Login.jsx'
import UserProvider from '../src/components/UserProvider.jsx'
import DataProvider from '../src/components/DataProvider.jsx'
import { createClient } from '../src/lib/supabase/server'
import { deriveIdentity } from '../src/lib/user.js'

export default async function Page() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // No session → gate the whole app behind the login screen.
  if (!user) return <Login />

  return (
    <UserProvider user={deriveIdentity(user)}>
      <DataProvider>
        <App />
      </DataProvider>
    </UserProvider>
  )
}
