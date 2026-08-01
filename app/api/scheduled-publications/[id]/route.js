import { NextResponse } from 'next/server'
import {
  cancelScheduledPublication,
  deleteScheduledPublication,
  retryScheduledOperation,
  updateScheduledPublication,
} from '../../../../src/lib/scheduledPublicationsStore.js'
import { errorStatus } from '../../../../src/lib/auth.js'
import {
  readJsonObject,
  REQUEST_LIMITS,
  isCalendarDate,
  validateScheduledPublicationPayload,
  validateThesisPayload,
  validationResponse,
} from '../../../../src/lib/apiValidation.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(request, { params }) {
  const { id } = await params
  let body
  try {
    body = await readJsonObject(request, REQUEST_LIMITS.publish)
  } catch (error) {
    const validation = validationResponse(error)
    if (validation) return NextResponse.json({ error: validation.message }, { status: validation.status })
    throw error
  }

  try {
    if (body.action === 'cancel') {
      const saved = await cancelScheduledPublication(id)
      return saved
        ? NextResponse.json(saved)
        : NextResponse.json({ error: 'scheduled publication not found' }, { status: 404 })
    }
    if (body.action === 'retry') {
      const saved = await retryScheduledOperation(id)
      return saved
        ? NextResponse.json(saved)
        : NextResponse.json({ error: 'scheduled operation not found' }, { status: 404 })
    }
    if (!['update', 'save-draft'].includes(body.action) || !body.thesis || typeof body.thesis !== 'object') {
      return NextResponse.json({ error: 'unknown scheduled publication action' }, { status: 400 })
    }
    const input = body.action === 'save-draft'
      ? {
          thesis: validateThesisPayload(body.thesis),
          scheduledDate: isCalendarDate(body.thesis.scheduledPublicationDate)
            ? body.thesis.scheduledPublicationDate
            : new Date().toISOString().slice(0, 10),
        }
      : validateScheduledPublicationPayload(body.thesis)
    const saved = await updateScheduledPublication(
      id,
      input.thesis,
      input.scheduledDate,
      body.action === 'update',
    )
    return saved
      ? NextResponse.json(saved)
      : NextResponse.json({ error: 'scheduled publication not found' }, { status: 404 })
  } catch (error) {
    const validation = validationResponse(error)
    if (validation) return NextResponse.json({ error: validation.message }, { status: validation.status })
    return NextResponse.json({ error: error.message }, { status: errorStatus(error) })
  }
}

export async function DELETE(_request, { params }) {
  const { id } = await params
  try {
    const deleted = await deleteScheduledPublication(id)
    return deleted
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json({ error: 'scheduled publication not found' }, { status: 404 })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: errorStatus(error) })
  }
}
