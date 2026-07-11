import 'server-only'
import YahooFinance from 'yahoo-finance2'

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] })

const CURRENCY_SYMBOL = { USD: '$', EUR: '€', GBP: '£', JPY: '¥' }
const sym = (c) => CURRENCY_SYMBOL[c] || (c ? `${c} ` : '$')
const toBillions = (n, c) => (n == null ? null : `${sym(c)}${(n / 1e9).toFixed(1)}B`)

function toTime(date) {
  const d = new Date(date)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

const BENCHMARK = '^GSPC' // S&P 500

// Home country -> Yahoo exchange code(s), in preference order. Used to point a
// bare ticker at the company's primary listing (and thus its native currency)
// instead of the default US line Yahoo returns for the un-suffixed symbol.
const COUNTRY_EXCHANGES = {
  Netherlands: ['AMS'],
  Germany: ['GER', 'FRA'],
  France: ['PAR'],
  'United Kingdom': ['LSE'],
  Canada: ['TOR'],
  Switzerland: ['EBS'],
  Italy: ['MIL'],
  Spain: ['MCE'],
  Sweden: ['STO'],
  Norway: ['OSL'],
  Denmark: ['CPH'],
  Finland: ['HEL'],
  Belgium: ['BRU'],
  Ireland: ['ISE'],
  Portugal: ['LIS'],
  Austria: ['VIE'],
  Australia: ['ASX'],
  'Hong Kong': ['HKG'],
  Japan: ['JPX'],
  Brazil: ['SAO'],
  India: ['NSI', 'BSE'],
  Taiwan: ['TAI'],
  'South Korea': ['KSC'],
}

// Resolve a symbol to its primary-exchange listing when we can identify one;
// otherwise return it unchanged. Cached per process to avoid repeat lookups.
const primaryCache = new Map()
async function resolvePrimarySymbol(symbol) {
  if (symbol.includes('.')) return symbol // caller already specified an exchange
  if (primaryCache.has(symbol)) return primaryCache.get(symbol)

  let resolved = symbol
  try {
    const profile = await yf.quoteSummary(symbol, { modules: ['assetProfile'] })
    const codes = COUNTRY_EXCHANGES[profile?.assetProfile?.country]
    if (codes) {
      const res = await yf.search(symbol)
      const base = symbol.toUpperCase()
      const match = (res?.quotes || []).find(
        (q) => q.symbol && codes.includes(q.exchange) && q.symbol.toUpperCase().startsWith(base),
      )
      if (match) resolved = match.symbol
    }
  } catch {
    // network/parse issue — fall back to the original symbol
  }
  primaryCache.set(symbol, resolved)
  return resolved
}

// Everything the thesis detail view + price chart need for one symbol.
export async function getThesisData(inputSymbol, from) {
  const symbol = await resolvePrimarySymbol(inputSymbol)
  const period1 = from || '2024-03-14'

  const [chartA, chartB, summary, quote] = await Promise.all([
    yf.chart(symbol, { period1, interval: '1d' }),
    yf.chart(BENCHMARK, { period1, interval: '1d' }).catch(() => null),
    yf.quoteSummary(symbol, { modules: ['assetProfile', 'financialData', 'price', 'defaultKeyStatistics'] }).catch(() => null),
    yf.quote(symbol).catch(() => null),
  ])

  const rows = (chartA?.quotes || []).filter((q) => q.close != null)
  if (!rows.length) throw new Error(`No price history for ${symbol}`)

  const history = rows.map((q) => ({ time: toTime(q.date), value: Number(q.close.toFixed(2)) }))
  const entry = history[0].value
  const current = Number((quote?.regularMarketPrice ?? history[history.length - 1].value).toFixed(2))
  const closes = rows.map((q) => q.close)
  const high = Number(Math.max(...closes).toFixed(2))
  const low = Number(Math.min(...closes).toFixed(2))
  const ret = ((current - entry) / entry) * 100

  // Rebase the benchmark to the entry price so it overlays on the same scale.
  let benchmark = []
  let spReturn = null
  const bRows = (chartB?.quotes || []).filter((q) => q.close != null)
  if (bRows.length) {
    const spFirst = bRows[0].close
    benchmark = bRows.map((q) => ({ time: toTime(q.date), value: Number((entry * (q.close / spFirst)).toFixed(2)) }))
    spReturn = ((bRows[bRows.length - 1].close / spFirst) - 1) * 100
  }
  const alpha = spReturn == null ? null : ret - spReturn

  const fd = summary?.financialData ?? {}
  const fcur = fd.financialCurrency || quote?.currency
  const opIncome = fd.operatingMargins != null && fd.totalRevenue != null ? fd.operatingMargins * fd.totalRevenue : null
  const netInc = summary?.defaultKeyStatistics?.netIncomeToCommon ?? null
  const cash = fd.totalCash ?? null
  const debt = fd.totalDebt ?? null
  const netCash = cash != null && debt != null ? cash - debt : null

  const financials = {
    revenue: toBillions(fd.totalRevenue, fcur),
    grossProfit: toBillions(fd.grossProfits, fcur),
    operatingIncome: toBillions(opIncome, fcur),
    netIncome: toBillions(netInc, fcur),
    operatingMargin: fd.operatingMargins != null ? `${(fd.operatingMargins * 100).toFixed(1)}%` : null,
    cash: toBillions(cash, fcur),
    totalDebt: toBillions(debt, fcur),
    netCash: netCash == null ? null : `${netCash >= 0 ? '+' : '−'}${toBillions(Math.abs(netCash), fcur)}`,
  }

  return {
    symbol,
    requestedSymbol: inputSymbol,
    company: quote?.longName || summary?.price?.longName || symbol,
    sector: summary?.assetProfile?.industry || summary?.assetProfile?.sector || null,
    currency: quote?.currency || 'USD',
    entry,
    current,
    high,
    low,
    ret: Number(ret.toFixed(1)),
    spReturn: spReturn == null ? null : Number(spReturn.toFixed(1)),
    alpha: alpha == null ? null : Number(alpha.toFixed(1)),
    history,
    benchmark,
    financials,
  }
}

// Free-text security search for the editor's ticker picker. Returns tradeable
// listings (equities, ETFs, funds) with the fields the UI needs to display and
// preselect a company. Keeps Yahoo's own exchange-suffixed symbols so a foreign
// listing can be chosen directly and priced in its native currency.
export async function searchSecurities(query) {
  const q = String(query || '').trim()
  if (q.length < 1) return []
  const TRADEABLE = new Set(['EQUITY', 'ETF', 'MUTUALFUND', 'INDEX'])
  let res
  try {
    res = await yf.search(q, { quotesCount: 10, newsCount: 0 })
  } catch {
    return []
  }
  return (res?.quotes || [])
    .filter((q2) => q2.isYahooFinance && q2.symbol && TRADEABLE.has(q2.quoteType))
    .map((q2) => ({
      symbol: q2.symbol,
      name: q2.longname || q2.shortname || q2.symbol,
      exchange: q2.exchDisp || q2.exchange || null,
      type: q2.typeDisp || q2.quoteType || null,
      sector: q2.sectorDisp || q2.sector || null,
      industry: q2.industryDisp || q2.industry || null,
    }))
}

// Snapshot a symbol's live price in its native currency, for sealing a thesis's
// entry at publication. Resolves to the primary listing first so the locked price
// (and everything derived from it) is in the company's own currency, never a US line.
export async function lockEntryPrice(inputSymbol) {
  const symbol = await resolvePrimarySymbol(inputSymbol)
  const [quote, summary] = await Promise.all([
    yf.quote(symbol),
    yf.quoteSummary(symbol, { modules: ['assetProfile', 'price'] }).catch(() => null),
  ])
  const price = quote?.regularMarketPrice
  if (price == null) throw new Error(`No live price for ${inputSymbol}`)
  return {
    resolvedSymbol: symbol,
    currency: quote?.currency || 'USD',
    price: Number(price.toFixed(2)),
    company: quote?.longName || quote?.shortName || summary?.price?.longName || symbol,
    exchange: quote?.fullExchangeName || quote?.exchange || null,
    sector: summary?.assetProfile?.industry || summary?.assetProfile?.sector || null,
  }
}

// Native entry/current/return for a batch of thesis cards. Each item carries the
// requested symbol and the publication date; we resolve the primary listing, read
// the close on (or just after) the entry date, and pair it with the live price so
// every card renders in the company's own currency — never a US-converted line.
export async function getCardData(items) {
  return Promise.all(
    (items || []).map(async ({ symbol: inputSymbol, from }) => {
      try {
        const symbol = await resolvePrimarySymbol(inputSymbol)
        const period1 = from || '2024-01-01'
        const [chart, quote] = await Promise.all([
          yf.chart(symbol, { period1, interval: '1d' }),
          yf.quote(symbol).catch(() => null),
        ])
        const rows = (chart?.quotes || []).filter((q) => q.close != null)
        if (!rows.length) return { symbol: inputSymbol, error: true }
        const entry = Number(rows[0].close.toFixed(2))
        const current = Number((quote?.regularMarketPrice ?? rows[rows.length - 1].close).toFixed(2))
        // Raw price move; the client applies side (bull/bear) to get position return.
        const priceReturn = Number((((current - entry) / entry) * 100).toFixed(1))
        return {
          symbol: inputSymbol,
          resolvedSymbol: symbol,
          currency: quote?.currency || 'USD',
          entry,
          current,
          priceReturn,
        }
      } catch {
        return { symbol: inputSymbol, error: true }
      }
    }),
  )
}

// Lightweight batch quotes for the watchlist / cards. Each requested symbol is
// resolved to its primary listing; results stay keyed by the original symbol.
export async function getQuotes(symbols) {
  const pairs = await Promise.all(symbols.map(async (s) => [s, await resolvePrimarySymbol(s)]))
  const resolvedBy = Object.fromEntries(pairs)
  const unique = [...new Set(Object.values(resolvedBy))]

  const res = await yf.quote(unique)
  const arr = Array.isArray(res) ? res : [res]
  const byResolved = Object.fromEntries(arr.map((q) => [q.symbol, q]))

  return symbols.map((s) => {
    const q = byResolved[resolvedBy[s]]
    return {
      symbol: s,
      resolvedSymbol: resolvedBy[s],
      price: q?.regularMarketPrice ?? null,
      currency: q?.currency ?? null,
      changePercent: q?.regularMarketChangePercent ?? null,
    }
  })
}
