import { NextResponse } from 'next/server'
import { errorStatus, requireUserContext } from '../../../../src/lib/auth.js'
import {
  convertDocxBuffer,
  DocxImportError,
  readDocxRequest,
} from '../../../../src/lib/docxImport.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    // Authenticate before buffering or parsing attacker-controlled document data.
    await requireUserContext()
    const { buffer, filename } = await readDocxRequest(request)
    return NextResponse.json({
      filename,
      ...await convertDocxBuffer(buffer),
    })
  } catch (error) {
    if (!(error instanceof DocxImportError) && errorStatus(error) >= 500) {
      console.error('DOCX import failed', error)
    }
    const status = error instanceof DocxImportError ? error.status : errorStatus(error)
    const message = status >= 500 ? 'document import unavailable' : error.message
    return NextResponse.json({ error: message }, { status })
  }
}
