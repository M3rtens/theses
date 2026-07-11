// Shared, client-safe price/currency formatting. Kept separate from yahoo.js
// (which is server-only) so both server routes and client components can use it.

export const CURRENCY_SYMBOL = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'CHF ',
  HKD: 'HK$', SEK: 'kr ', NOK: 'kr ', DKK: 'kr ', SGD: 'S$', INR: '₹', BRL: 'R$',
  TWD: 'NT$', KRW: '₩',
}

// Symbol for a currency code, falling back to the code itself, then to '$'.
export const currencySymbol = (c) => CURRENCY_SYMBOL[c] || (c ? `${c} ` : '$')

// Format a numeric price in its native currency, e.g. fmtPrice(905.4, 'EUR') -> '€905.40'.
export const fmtPrice = (n, currency) =>
  n == null
    ? '—'
    : currencySymbol(currency) +
      Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
