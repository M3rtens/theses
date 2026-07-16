import { NextResponse } from 'next/server'
import { appendUpdate } from '../../../../../src/lib/thesesStore.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/theses/:id/updates -> append a timestamped update note to a thesis.
// Body: { text }. The timestamp is sealed server-side; the client cannot set it.
export async function POST(request, { params }) {
  const { id } = await params

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const text = String(body?.text || '').trim()
  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  try {
    const update = await appendUpdate(id, text)
    if (!update) {
      return NextResponse.json({ error: 'thesis not found' }, { status: 404 })
    }
    return NextResponse.json(update, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
