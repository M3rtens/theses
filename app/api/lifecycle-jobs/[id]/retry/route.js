import { NextResponse } from 'next/server'
import { errorStatus } from '../../../../../src/lib/auth.js'
import { retryLifecycleJob } from '../../../../../src/lib/notificationsStore.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_request, { params }) {
  const { id } = await params
  try {
    const job = await retryLifecycleJob(id)
    return job
      ? NextResponse.json({ status: job.status })
      : NextResponse.json({ error: 'lifecycle job not found' }, { status: 404 })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: errorStatus(error) })
  }
}
