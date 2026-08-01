import { NextResponse } from 'next/server'
import { errorStatus } from '../../../../src/lib/auth.js'
import {
  deleteCloudDraft,
  updateCloudDraft,
} from '../../../../src/lib/cloudDraftsStore.js'
import {
  readJsonObject,
  REQUEST_LIMITS,
  validateDraftUpdatePayload,
  validationResponse,
} from '../../../../src/lib/apiValidation.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(request, { params }) {
  const { id } = await params
  let input
  try {
    input = validateDraftUpdatePayload(
      await readJsonObject(request, REQUEST_LIMITS.draft),
    )
  } catch (error) {
    const validation = validationResponse(error)
    if (validation) return NextResponse.json({ error: validation.message }, { status: validation.status })
    throw error
  }

  try {
    const saved = await updateCloudDraft(id, input.draft, input.version)
    return saved
      ? NextResponse.json(saved)
      : NextResponse.json({ error: 'cloud draft not found' }, { status: 404 })
  } catch (error) {
    return NextResponse.json(
      { error: error.message, ...(error.current ? { current: error.current } : {}) },
      { status: errorStatus(error) },
    )
  }
}

export async function DELETE(_request, { params }) {
  const { id } = await params
  try {
    const deleted = await deleteCloudDraft(id)
    return deleted
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json({ error: 'cloud draft not found' }, { status: 404 })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: errorStatus(error) })
  }
}
