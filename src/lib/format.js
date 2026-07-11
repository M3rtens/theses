// Shared, client-safe price/currency formatting. Kept separate from yahoo.js
// (which is server-only) so both server routes and client components can use it.

export const CURRENCY_SYMBOL = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'CHF ',
  HKD: 'HK$', SEK: 'kr ', NOK: 'kr ', DKK: 'kr ', SGD: 'S$', INR: '₹', BRL: 'R$',
  TWD: 'NT$', KRW: '₩',
}

// London (and a few other) lines quote in pence, reported as GBp/GBX by Yahoo.
// We show these as pounds, so pence values must be divided by 100.
const PENCE = new Set(['GBp', 'GBX'])
export const isPence = (c) => PENCE.has(c)

// Symbol for a currency code, falling back to the code itself, then to '$'.
// Pence quotes display under the pound symbol.
export const currencySymbol = (c) =>
  PENCE.has(c) ? '£' : CURRENCY_SYMBOL[c] || (c ? `${c} ` : '$')

// Format a numeric price in its native currency, e.g. fmtPrice(905.4, 'EUR') -> '€905.40'.
// Pence quotes are converted to pounds: fmtPrice(3038.5, 'GBp') -> '£30.39'.
export const fmtPrice = (n, currency) => {
  if (n == null) return '—'
  const value = PENCE.has(currency) ? Number(n) / 100 : Number(n)
  return (
    currencySymbol(currency) +
    value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  )
}
