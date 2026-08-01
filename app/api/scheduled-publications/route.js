import { NextResponse } from 'next/server'
import {
  createScheduledPublication,
  listScheduledPublications,
} from '../../../src/lib/scheduledPublicationsStore.js'
import { errorStatus } from '../../../src/lib/auth.js'
import {
  readJsonObject,
  REQUEST_LIMITS,
  validateScheduledPublicationPayload,
  validationResponse,
} from '../../../src/lib/apiValidation.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(await listScheduledPublications())
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: errorStatus(error) })
  }
}

export async function POST(request) {
  let input
  try {
    input = validateScheduledPublicationPayload(
      await readJsonObject(request, REQUEST_LIMITS.publish),
    )
  } catch (error) {
    const validation = validationResponse(error)
    if (validation) return NextResponse.json({ error: validation.message }, { status: validation.status })
    throw error
  }

  try {
    return NextResponse.json(
      await createScheduledPublication(input.thesis, input.scheduledDate),
      { status: 202 },
    )
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: errorStatus(error) })
  }
}
