import { redirect } from 'next/navigation'
import Login from '../../src/components/Login.jsx'
import { createClient } from '../../src/lib/supabase/server'

export default async function SignInPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect('/')
  return <Login />
}
