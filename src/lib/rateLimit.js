import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const buckets = new Map()
const sharedLimiters = new Map()
const MAX_BUCKETS = 10_000
let redis
let warnedSharedFailure = false

function clientAddress(request) {
  const forwarded = request.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown'
}

function prune(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
  while (buckets.size >= MAX_BUCKETS) {
    buckets.delete(buckets.keys().next().value)
  }
}

function checkLocalRateLimit(address, { scope, limit, windowMs }, now) {
  prune(now)
  const key = `${scope}:${address}`
  let bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs }
    buckets.set(key, bucket)
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      source: 'local',
    }
  }

  bucket.count += 1
  return { allowed: true, retryAfter: 0, source: 'local' }
}

export function sharedRateLimitConfigured(env = process.env) {
  return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)
}

function getSharedLimiter({ scope, limit, windowMs }) {
  if (!sharedRateLimitConfigured()) return null
  const key = `${scope}:${limit}:${windowMs}`
  if (sharedLimiters.has(key)) return sharedLimiters.get(key)
  redis ||= Redis.fromEnv()
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
    prefix: `theses:ratelimit:${scope}`,
    analytics: false,
    timeout: 1_000,
  })
  sharedLimiters.set(key, limiter)
  return limiter
}

// Provider-backed routes use a shared sliding-window counter when Redis is
// configured. Local development and Redis failures retain the bounded in-memory
// limiter, so provider outages do not make the market-data endpoints unprotected.
export async function checkRateLimit(
  request,
  { scope, limit, windowMs = 60_000 },
  now = Date.now(),
  sharedLimiter = undefined,
) {
  const address = clientAddress(request)
  const options = { scope, limit, windowMs }
  const limiter = sharedLimiter === undefined ? getSharedLimiter(options) : sharedLimiter
  if (limiter) {
    try {
      const result = await limiter.limit(address)
      if (result.reason !== 'timeout') {
        return {
          allowed: result.success,
          retryAfter: result.success ? 0 : Math.max(1, Math.ceil((result.reset - now) / 1000)),
          source: 'shared',
        }
      }
      if (!warnedSharedFailure) {
        warnedSharedFailure = true
        console.warn('Shared rate limiter timed out; using the local fallback.')
      }
    } catch (error) {
      if (!warnedSharedFailure) {
        warnedSharedFailure = true
        console.error('Shared rate limiter unavailable; using the local fallback.', error instanceof Error ? error.message : '')
      }
    }
  }
  return checkLocalRateLimit(address, options, now)
}

export function rateLimitFailure(result) {
  if (result.allowed) return null
  return {
    body: { error: 'too many requests; try again shortly' },
    init: {
      status: 429,
      headers: { 'Retry-After': String(result.retryAfter) },
    },
  }
}

export function resetRateLimitsForTests() {
  buckets.clear()
  sharedLimiters.clear()
  redis = undefined
  warnedSharedFailure = false
}
