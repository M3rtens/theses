import { NextResponse } from 'next/server'
import { publishScheduledPublicationNow } from '../../../../../src/lib/scheduledPublicationsStore.js'
import { errorStatus } from '../../../../../src/lib/auth.js'
import {
  readJsonObject,
  REQUEST_LIMITS,
  validateThesisPayload,
  validationResponse,
} from '../../../../../src/lib/apiValidation.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request, { params }) {
  const { id } = await params
  let thesis
  try {
    thesis = validateThesisPayload(await readJsonObject(request, REQUEST_LIMITS.publish))
  } catch (error) {
    const validation = validationResponse(error)
    if (validation) return NextResponse.json({ error: validation.message }, { status: validation.status })
    throw error
  }
  try {
    const published = await publishScheduledPublicationNow(id, thesis)
    return published
      ? NextResponse.json(published, { status: 201 })
      : NextResponse.json({ error: 'scheduled publication not found' }, { status: 404 })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: errorStatus(error) })
  }
}
