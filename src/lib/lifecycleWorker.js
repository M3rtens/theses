import 'server-only'
import { randomUUID } from 'node:crypto'
import { buildThesisRefreshPatch } from './refreshMetrics.js'
import {
  lifecycleErrorCode,
  marketSnapshotEligibility,
} from './lifecycle.js'
import { createAdminClient } from './supabase/admin.js'
import {
  getFinancialStatements,
  getMarketSnapshot,
  getQuotes,
} from './yahoo.js'

const BATCH_SIZE = 25
const DEFAULT_BUDGET_MS = 45_000

const marketPayload = (snapshot) => ({
  price: snapshot.price,
  marketTime: snapshot.marketTime,
  marketState: snapshot.marketState,
  resolvedSymbol: snapshot.resolvedSymbol,
  currency: snapshot.currency,
  company: snapshot.company,
  exchange: snapshot.exchange,
  sector: snapshot.sector,
  exchangeTimezone: snapshot.exchangeTimezone,
})

async function updateJobMetadata(admin, job, snapshot, leaseToken) {
  const timezone = snapshot.exchangeTimezone || job.exchange_timezone || 'UTC'
  const patch = {
    resolved_symbol: snapshot.resolvedSymbol || job.resolved_symbol,
    exchange: snapshot.exchange || job.exchange,
    exchange_timezone: timezone,
  }
  const { error } = await admin
    .from('lifecycle_jobs')
    .update(patch)
    .eq('id', job.id)
    .eq('lease_token', leaseToken)
  if (error) throw error
  return timezone
}

async function processLifecycleJob(admin, job, leaseToken) {
  let snapshot
  try {
    snapshot = await getMarketSnapshot(job.resolved_symbol)
  } catch (error) {
    await admin.rpc('fail_lifecycle_job', {
      p_job_id: job.id,
      p_lease_token: leaseToken,
      p_error_code: lifecycleErrorCode(error),
    })
    return 'failed'
  }

  let timezone
  try {
    timezone = await updateJobMetadata(admin, job, snapshot, leaseToken)
  } catch {
    timezone = job.exchange_timezone || snapshot.exchangeTimezone || 'UTC'
  }
  const eligibility = marketSnapshotEligibility(
    snapshot,
    job.scheduled_date,
    timezone,
  )
  if (!eligibility.eligible) {
    if (eligibility.failure) {
      await admin.rpc('fail_lifecycle_job', {
        p_job_id: job.id,
        p_lease_token: leaseToken,
        p_error_code: eligibility.reason,
      })
      return 'failed'
    }
    await admin.rpc('release_lifecycle_job', {
      p_job_id: job.id,
      p_lease_token: leaseToken,
      p_delay_seconds: 60,
    })
    return 'deferred'
  }

  const rpc = job.kind === 'publish' ? 'finalize_publication_job' : 'finalize_close_job'
  const args = job.kind === 'publish'
    ? {
        p_job_id: job.id,
        p_market: marketPayload(snapshot),
        p_lease_token: leaseToken,
        p_user_id: null,
      }
    : {
        p_job_id: job.id,
        p_market: marketPayload(snapshot),
        p_lease_token: leaseToken,
      }
  const { data, error } = await admin.rpc(rpc, args)
  if (!error && data) return 'completed'

  await admin.rpc('fail_lifecycle_job', {
    p_job_id: job.id,
    p_lease_token: leaseToken,
    p_error_code: lifecycleErrorCode(error),
  })
  return 'failed'
}

export async function runLifecycleWorker({ budgetMs = DEFAULT_BUDGET_MS } = {}) {
  const admin = createAdminClient()
  const startedAt = Date.now()
  const summary = { claimed: 0, completed: 0, deferred: 0, failed: 0 }

  while (Date.now() - startedAt < budgetMs) {
    const leaseToken = randomUUID()
    const { data: jobs, error } = await admin.rpc('claim_lifecycle_jobs', {
      p_lease_token: leaseToken,
      p_limit: BATCH_SIZE,
    })
    if (error) throw error
    if (!jobs?.length) break
    summary.claimed += jobs.length

    const outcomes = await Promise.all(jobs.map((job) => processLifecycleJob(admin, job, leaseToken)))
    outcomes.forEach((outcome) => { summary[outcome] += 1 })
    if (jobs.length < BATCH_SIZE) break
  }
  return summary
}

async function processRefreshBatch(admin, rows, leaseToken) {
  const theses = rows.map((row) => ({ ...row.data, id: row.id, ownerId: row.user_id }))
  const symbols = [...new Set(theses
    .map((thesis) => thesis.resolvedSymbol || thesis.ticker)
    .filter(Boolean))]
  let quotes = []
  try {
    quotes = symbols.length ? await getQuotes(symbols) : []
  } catch {
    quotes = []
  }
  const quoteBySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]))

  const statementSymbols = [...new Set(theses
    .filter((thesis) => thesis.triggers?.some((trigger) => trigger?.metric))
    .map((thesis) => thesis.resolvedSymbol || thesis.ticker)
    .filter(Boolean))]
  const statementsBySymbol = new Map(await Promise.all(statementSymbols.map(async (symbol) => {
    try {
      return [symbol, await getFinancialStatements(symbol)]
    } catch {
      return [symbol, null]
    }
  })))

  const results = await Promise.all(theses.map(async (thesis) => {
    const symbol = thesis.resolvedSymbol || thesis.ticker
    const quote = quoteBySymbol.get(symbol)
    const card = quote?.price == null ? null : { current: quote.price }
    const needsStatements = thesis.triggers?.some((trigger) => trigger?.metric)
    const statements = needsStatements ? statementsBySymbol.get(symbol) : null
    const hasPrice = card && !card.error
    if (!hasPrice && (!needsStatements || !statements)) {
      await admin.rpc('fail_thesis_refresh', {
        p_thesis_id: thesis.id,
        p_lease_token: leaseToken,
      })
      return 'failed'
    }

    const patch = buildThesisRefreshPatch(thesis, card, statements)
    const { error } = await admin.rpc('apply_thesis_refresh', {
      p_thesis_id: thesis.id,
      p_lease_token: leaseToken,
      p_patch: patch,
    })
    if (!error) return 'completed'
    await admin.rpc('fail_thesis_refresh', {
      p_thesis_id: thesis.id,
      p_lease_token: leaseToken,
    })
    return 'failed'
  }))
  return results
}

export async function runRefreshWorker({ budgetMs = DEFAULT_BUDGET_MS } = {}) {
  const admin = createAdminClient()
  const startedAt = Date.now()
  const summary = { claimed: 0, completed: 0, failed: 0 }

  while (Date.now() - startedAt < budgetMs) {
    const leaseToken = randomUUID()
    const { data: rows, error } = await admin.rpc('claim_thesis_refreshes', {
      p_lease_token: leaseToken,
      p_limit: BATCH_SIZE,
    })
    if (error) throw error
    if (!rows?.length) break
    summary.claimed += rows.length
    const outcomes = await processRefreshBatch(admin, rows, leaseToken)
    outcomes.forEach((outcome) => { summary[outcome] += 1 })
    if (rows.length < BATCH_SIZE) break
  }
  return summary
}
