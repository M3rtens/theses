const buckets = new Map()
const MAX_BUCKETS = 10_000

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

// Best-effort per-instance protection for public provider-backed routes. The
// deployment edge should enforce the same limits globally across instances.
export function checkRateLimit(request, { scope, limit, windowMs = 60_000 }, now = Date.now()) {
  prune(now)
  const key = `${scope}:${clientAddress(request)}`
  let bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs }
    buckets.set(key, bucket)
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    }
  }

  bucket.count += 1
  return { allowed: true, retryAfter: 0 }
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
}
