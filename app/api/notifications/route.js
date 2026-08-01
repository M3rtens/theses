import { NextResponse } from 'next/server'
import { listNotifications, markNotificationsRead } from '../../../src/lib/notificationsStore.js'
import { errorStatus } from '../../../src/lib/auth.js'
import {
  readJsonObject,
  REQUEST_LIMITS,
  validateNotificationReadPayload,
  validationResponse,
} from '../../../src/lib/apiValidation.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(await listNotifications())
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: errorStatus(error) })
  }
}

export async function PATCH(request) {
  let input
  try {
    input = validateNotificationReadPayload(
      await readJsonObject(request, REQUEST_LIMITS.notifications),
    )
  } catch (error) {
    const validation = validationResponse(error)
    if (validation) return NextResponse.json({ error: validation.message }, { status: validation.status })
    throw error
  }

  try {
    return NextResponse.json({ read: await markNotificationsRead(input) })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: errorStatus(error) })
  }
}
