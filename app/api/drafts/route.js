import { NextResponse } from 'next/server'
import { errorStatus } from '../../../src/lib/auth.js'
import {
  createCloudDraft,
  listCloudDrafts,
} from '../../../src/lib/cloudDraftsStore.js'
import {
  readJsonObject,
  REQUEST_LIMITS,
  validateDraftCreatePayload,
  validationResponse,
} from '../../../src/lib/apiValidation.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(await listCloudDrafts())
  } catch (error) {
    return NextResponse.json(
      { error: error.message, ...(error.current ? { current: error.current } : {}) },
      { status: errorStatus(error) },
    )
  }
}

export async function POST(request) {
  let input
  try {
    input = validateDraftCreatePayload(
      await readJsonObject(request, REQUEST_LIMITS.draft),
    )
  } catch (error) {
    const validation = validationResponse(error)
    if (validation) return NextResponse.json({ error: validation.message }, { status: validation.status })
    throw error
  }

  try {
    const saved = await createCloudDraft(input.draft, input.localId)
    return saved
      ? NextResponse.json(saved, { status: 201 })
      : NextResponse.json({ error: 'cloud draft could not be created' }, { status: 500 })
  } catch (error) {
    return NextResponse.json(
      { error: error.message, ...(error.current ? { current: error.current } : {}) },
      { status: errorStatus(error) },
    )
  }
}
