import App from '../App.jsx'
import UserProvider from './UserProvider.jsx'
import DataProvider from './DataProvider.jsx'
import { createClient } from '../lib/supabase/server.js'
import { deriveIdentity } from '../lib/user.js'

export default async function AppShell(props) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <UserProvider user={user ? deriveIdentity(user) : null}>
      <DataProvider>
        <App {...props} />
      </DataProvider>
    </UserProvider>
  )
}
