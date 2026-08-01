// Turns a raw Supabase auth user into the display identity the UI needs:
// name, @handle, avatar initials, email, and (if Google supplied one) a photo.
// Kept in one place so every surface renders the same identity.

// Two-letter initials for the avatar circle. "Ada Lovelace" -> "AL";
// single-word names fall back to their first two characters.
function initialsOf(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return String(name).trim().slice(0, 2).toUpperCase() || '—'
}

export function deriveIdentity(user) {
  const meta = user?.user_metadata || {}
  const email = user?.email || ''
  const emailLocal = email.split('@')[0] || 'analyst'
  const name = meta.full_name || meta.name || emailLocal
  return {
    id: user?.id || null,
    name,
    firstName: String(name).trim().split(/\s+/)[0] || name,
    handle: `@${emailLocal}`,
    avatar: initialsOf(name),
    email,
    picture: meta.avatar_url || meta.picture || null,
    createdAt: user?.created_at || null,
  }
}

// Overlay the real identity onto a leaderboard row (the "you" row), leaving its
// computed stats untouched.
export function withIdentity(row, identity) {
  if (!identity) return row
  return {
    ...row,
    name: identity.name,
    handle: identity.handle,
    avatar: identity.avatar,
    picture: identity.picture,
  }
}
