import { NextResponse } from 'next/server'
import { errorStatus } from '../../../src/lib/auth.js'
import {
  readJsonObject,
  REQUEST_LIMITS,
  validateSavedSearchPayload,
  validationResponse,
} from '../../../src/lib/apiValidation.js'
import { createSavedSearch, listSavedSearches } from '../../../src/lib/savedSearchesStore.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(await listSavedSearches())
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: errorStatus(error) })
  }
}

export async function POST(request) {
  let input
  try {
    input = validateSavedSearchPayload(await readJsonObject(request, REQUEST_LIMITS.savedSearch))
  } catch (error) {
    const validation = validationResponse(error)
    if (validation) return NextResponse.json({ error: validation.message }, { status: validation.status })
    throw error
  }
  try {
    return NextResponse.json(await createSavedSearch(input), { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: errorStatus(error) })
  }
}
