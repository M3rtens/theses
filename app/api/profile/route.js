import { NextResponse } from 'next/server'
import { errorStatus } from '../../../src/lib/auth.js'
import { getCloudProfile, saveCloudProfile } from '../../../src/lib/profilesStore.js'
import {
  readJsonObject,
  REQUEST_LIMITS,
  validateProfilePayload,
  validationResponse,
} from '../../../src/lib/apiValidation.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(await getCloudProfile())
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: errorStatus(error) })
  }
}

export async function PATCH(request) {
  let profile
  try {
    profile = validateProfilePayload(
      await readJsonObject(request, REQUEST_LIMITS.profile),
    )
  } catch (error) {
    const validation = validationResponse(error)
    if (validation) return NextResponse.json({ error: validation.message }, { status: validation.status })
    throw error
  }

  try {
    return NextResponse.json(await saveCloudProfile(profile))
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: errorStatus(error) })
  }
}
