import { NextResponse } from 'next/server'
import { errorStatus } from '../../../../src/lib/auth.js'
import {
  readJsonObject,
  REQUEST_LIMITS,
  validateSavedSearchPayload,
  validationResponse,
} from '../../../../src/lib/apiValidation.js'
import { deleteSavedSearch, updateSavedSearch } from '../../../../src/lib/savedSearchesStore.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(request, { params }) {
  let input
  try {
    input = validateSavedSearchPayload(await readJsonObject(request, REQUEST_LIMITS.savedSearch))
  } catch (error) {
    const validation = validationResponse(error)
    if (validation) return NextResponse.json({ error: validation.message }, { status: validation.status })
    throw error
  }
  const { id } = await params
  try {
    const saved = await updateSavedSearch(id, input)
    return saved
      ? NextResponse.json(saved)
      : NextResponse.json({ error: 'saved search not found' }, { status: 404 })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: errorStatus(error) })
  }
}

export async function DELETE(_request, { params }) {
  const { id } = await params
  try {
    return NextResponse.json({ deleted: await deleteSavedSearch(id) })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: errorStatus(error) })
  }
}
