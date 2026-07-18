'use client'

import { createContext, useContext } from 'react'

// Carries the signed-in user's display identity (see deriveIdentity) to every
// view, so surfaces like the sidebar, profile, and leaderboard show the real
// account rather than a hardcoded placeholder.
const UserContext = createContext(null)

export function useUser() {
  return useContext(UserContext)
}

export default function UserProvider({ user, children }) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>
}
