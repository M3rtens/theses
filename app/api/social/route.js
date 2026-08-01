import { NextResponse } from 'next/server'
import { errorStatus } from '../../../src/lib/auth.js'
import {
  readJsonObject,
  REQUEST_LIMITS,
  validateSocialMutationPayload,
  validationResponse,
} from '../../../src/lib/apiValidation.js'
import { listSocialWorkspace, setSocialRelationship } from '../../../src/lib/socialStore.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(await listSocialWorkspace())
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: errorStatus(error) })
  }
}

async function mutate(request, enabled) {
  let input
  try {
    input = validateSocialMutationPayload(await readJsonObject(request, REQUEST_LIMITS.social))
  } catch (error) {
    const validation = validationResponse(error)
    if (validation) return NextResponse.json({ error: validation.message }, { status: validation.status })
    throw error
  }
  try {
    return NextResponse.json(await setSocialRelationship(input, enabled))
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: errorStatus(error) })
  }
}

export async function POST(request) {
  return mutate(request, true)
}

export async function DELETE(request) {
  return mutate(request, false)
}
