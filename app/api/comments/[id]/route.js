import { NextResponse } from 'next/server'
import { errorStatus } from '../../../../src/lib/auth.js'
import { removeThesisComment } from '../../../../src/lib/commentsStore.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(_request, { params }) {
  const { id } = await params
  try {
    return NextResponse.json(await removeThesisComment(id))
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: errorStatus(error) })
  }
}
