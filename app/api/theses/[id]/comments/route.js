import { NextResponse } from 'next/server'
import { errorStatus } from '../../../../../src/lib/auth.js'
import {
  readJsonObject,
  REQUEST_LIMITS,
  validateCommentPayload,
  validationResponse,
} from '../../../../../src/lib/apiValidation.js'
import { createThesisComment, listThesisComments } from '../../../../../src/lib/commentsStore.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request, { params }) {
  const { id } = await params
  try {
    return NextResponse.json(await listThesisComments(id))
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: errorStatus(error) })
  }
}

export async function POST(request, { params }) {
  let input
  try {
    input = validateCommentPayload(await readJsonObject(request, REQUEST_LIMITS.comment))
  } catch (error) {
    const validation = validationResponse(error)
    if (validation) return NextResponse.json({ error: validation.message }, { status: validation.status })
    throw error
  }
  const { id } = await params
  try {
    return NextResponse.json(await createThesisComment(id, input), { status: 201 })
  } catch (error) {
    const response = NextResponse.json({ error: error.message }, { status: errorStatus(error) })
    if (error.status === 429) response.headers.set('Retry-After', '3600')
    return response
  }
}
