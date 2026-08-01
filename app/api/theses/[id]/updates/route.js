import { NextResponse } from 'next/server'
import { appendUpdate } from '../../../../../src/lib/thesesStore.js'
import { errorStatus, requireUserContext } from '../../../../../src/lib/auth.js'
import {
  readJsonObject,
  REQUEST_LIMITS,
  validateUpdatePayload,
  validationResponse,
} from '../../../../../src/lib/apiValidation.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/theses/:id/updates -> append a timestamped update note to a thesis.
// Body: { text }. The timestamp is sealed server-side; the client cannot set it.
export async function POST(request, { params }) {
  try {
    await requireUserContext()
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: errorStatus(e) })
  }

  const { id } = await params

  let body
  try {
    body = validateUpdatePayload(await readJsonObject(request, REQUEST_LIMITS.update))
  } catch (error) {
    const validation = validationResponse(error)
    if (validation) return NextResponse.json({ error: validation.message }, { status: validation.status })
    throw error
  }

  try {
    const update = await appendUpdate(id, body.text)
    if (!update) {
      return NextResponse.json({ error: 'thesis not found' }, { status: 404 })
    }
    return NextResponse.json(update, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: errorStatus(e) })
  }
}
