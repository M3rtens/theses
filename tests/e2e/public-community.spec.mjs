import { expect, test } from '@playwright/test'

const thesis = (overrides) => ({
  id: 1,
  ownerId: 'analyst-alpha',
  title: 'Durable software growth',
  ticker: 'SOFT',
  company: 'Software Co',
  side: 'bull',
  sector: 'Software',
  publishDate: '1 Aug 2026',
  createdAt: '2026-08-01T00:00:00.000Z',
  ret: 12.4,
  updates: 2,
  snippet: 'Recurring revenue and durable margins support the long-term thesis.',
  author: 'Alpha Analyst',
  handle: '@alpha',
  authorSlug: 'alpha-analyst-00000000000000000000000000000001',
  ...overrides,
})

const discoverRows = [
  thesis({ id: 1 }),
  thesis({ id: 2, title: 'Healthcare platform expansion', ticker: 'HLTH', sector: 'Healthcare', ret: 7.1 }),
  thesis({ id: 3, title: 'Energy cash-flow inflection', ticker: 'NRGY', sector: 'Energy', side: 'bear', ret: -2.5 }),
]

const analyst = (overrides) => ({
  userId: 'analyst-alpha',
  name: 'Alpha Analyst',
  handle: '@alpha',
  avatar: 'AA',
  slug: 'alpha-analyst-00000000000000000000000000000001',
  isYou: false,
  theses: 4,
  winRate: 75,
  avgReturn: 12.4,
  annualized: 18.2,
  avgHold: '120d',
  best: 'SOFT · Long · +24.8%',
  bestRet: 24.8,
  rank: 1,
  ...overrides,
})

test.beforeEach(async ({ page }) => {
  await page.route('**/api/discover**', async (route) => {
    const url = new URL(route.request().url())
    const requestedPage = Number(url.searchParams.get('page') || 1)
    const query = (url.searchParams.get('q') || '').toLowerCase()
    const sector = url.searchParams.get('sector') || 'all'
    const matching = discoverRows.filter((row) => (
      (!query || row.title.toLowerCase().includes(query))
      && (sector === 'all' || row.sector === sector)
    ))
    const items = query || sector !== 'all'
      ? matching
      : requestedPage === 1 ? matching.slice(0, 2) : matching.slice(2)
    const totalPages = query || sector !== 'all' ? 1 : 2
    await route.fulfill({
      json: {
        items,
        pagination: { page: requestedPage, pageSize: 2, totalItems: matching.length, totalPages },
        facets: { sectors: ['Energy', 'Healthcare', 'Software'] },
      },
    })
  })

  await page.route('**/api/leaderboard**', async (route) => {
    const url = new URL(route.request().url())
    const side = url.searchParams.get('side') || 'all'
    const rows = side === 'bear'
      ? [analyst({ theses: 1, avgReturn: -2.5, annualized: -2.5, avgHold: '20d', best: 'NRGY · Short · −2.5%' })]
      : [analyst(), analyst({
          userId: 'analyst-beta', name: 'Beta Analyst', handle: '@beta', avatar: 'BA',
          slug: 'beta-analyst-00000000000000000000000000000002', rank: 2,
          theses: 3, winRate: 67, avgReturn: 8.2, annualized: 11.3,
          avgHold: '95d', best: 'HLTH · Long · +16.1%', bestRet: 16.1,
        })]
    await route.fulfill({
      json: {
        items: rows,
        pagination: { page: 1, pageSize: 25, totalItems: rows.length, totalPages: 1 },
        facets: { sectors: ['Energy', 'Healthcare', 'Software'] },
        viewer: null,
      },
    })
  })
})

test('guest can page and search Discover, then filter the leaderboard', async ({ page }) => {
  const response = await page.goto('/')
  const policy = response.headers()['content-security-policy']
  const nonce = policy.match(/'nonce-([^']+)'/)?.[1]
  expect(nonce).toBeTruthy()
  const secondPolicy = (await page.request.get('/')).headers()['content-security-policy']
  expect(secondPolicy.match(/'nonce-([^']+)'/)?.[1]).not.toBe(nonce)
  expect(policy.split('; ').find((directive) => directive.startsWith('script-src'))).not.toContain("'unsafe-inline'")
  const frameworkNonces = await page.locator('script[src*="/_next/"]').evaluateAll((scripts) => scripts.map((script) => script.nonce))
  expect(frameworkNonces.length).toBeGreaterThan(0)
  expect(frameworkNonces.every((value) => value === nonce)).toBe(true)

  await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Durable software growth' })).toHaveAttribute('href', '/theses/1')
  await expect(page.getByText('Showing 1–2 of 3 matching theses')).toBeVisible()

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('link', { name: 'Energy cash-flow inflection' })).toBeVisible()
  await expect(page.getByText('Page 2 of 2')).toBeVisible()

  await page.getByPlaceholder('Search theses by title…').fill('healthcare')
  await expect(page.getByRole('link', { name: 'Healthcare platform expansion' })).toBeVisible()
  await expect(page.getByText('1 matching theses', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Leaderboard' }).click()
  await expect(page).toHaveURL(/view=leaderboard/)
  await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Alpha Analyst' })).toHaveAttribute(
    'href',
    '/analysts/alpha-analyst-00000000000000000000000000000001',
  )

  await page.getByRole('button', { name: 'Short only' }).click()
  await expect(page.getByText('1 matching analyst', { exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '1', exact: true }).last()).toBeVisible()
  await expect(page.getByText('NRGY · Short · −2.5%')).toBeVisible()
})
