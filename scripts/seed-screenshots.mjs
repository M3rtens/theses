import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const SEED_MARKER = 'theses-screenshot-v1'
const args = process.argv.slice(2)

const flagValue = (flag) => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : null
}

const clean = args.includes('--clean')
const ownerIdArg = flagValue('--owner-id')
const ownerNameArg = flagValue('--owner-name')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local')
}

const supabase = createClient(url, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const ensureResult = (result, label) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
  return result.data
}

async function listAuthUsers() {
  const users = []
  let page = 1
  while (true) {
    const result = await supabase.auth.admin.listUsers({ page, perPage: 100 })
    const batch = ensureResult(result, 'Could not list Auth users')?.users || []
    users.push(...batch)
    if (batch.length < 100) return users
    page += 1
  }
}

const profilesResult = await supabase.from('profiles').select('id, name, handle, avatar')
const profiles = ensureResult(profilesResult, 'Could not read profiles') || []
const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
let authUsers = await listAuthUsers()

const isDemoUser = (user) => user.app_metadata?.seed_marker === SEED_MARKER

function resolveOwner() {
  const realUsers = authUsers.filter((user) => !isDemoUser(user))
  if (ownerIdArg) {
    const exact = realUsers.find((user) => user.id === ownerIdArg)
    if (!exact) throw new Error(`No non-demo Auth user matches --owner-id ${ownerIdArg}`)
    return exact
  }

  if (ownerNameArg) {
    const target = ownerNameArg.trim().toLowerCase()
    const matches = realUsers.filter((user) => {
      const profileName = profileById.get(user.id)?.name
      const metadataName = user.user_metadata?.full_name || user.user_metadata?.name
      return [profileName, metadataName].some((name) => String(name || '').trim().toLowerCase() === target)
    })
    if (matches.length !== 1) {
      throw new Error(`Expected one non-demo Auth user named "${ownerNameArg}", found ${matches.length}`)
    }
    return matches[0]
  }

  if (realUsers.length === 1) return realUsers[0]

  const choices = realUsers.map((user) => {
    const name = profileById.get(user.id)?.name || user.user_metadata?.full_name || user.user_metadata?.name || 'Unnamed'
    return `${name} (${user.id.slice(0, 8)}...)`
  })
  throw new Error(`Multiple real users exist. Re-run with --owner-name or --owner-id. Choices: ${choices.join(', ')}`)
}

async function cleanSeedData() {
  const rows = ensureResult(
    await supabase.from('theses').select('id, data'),
    'Could not read seed theses',
  ) || []
  const seedIds = rows
    .filter((row) => row.data?.seedMarker === SEED_MARKER)
    .map((row) => row.id)

  if (seedIds.length) {
    ensureResult(
      await supabase.from('theses').delete().in('id', seedIds),
      'Could not delete seed theses',
    )
  }

  const demoUsers = authUsers.filter(isDemoUser)
  const demoIds = demoUsers.map((user) => user.id)
  if (demoIds.length) {
    ensureResult(
      await supabase.from('profiles').delete().in('id', demoIds),
      'Could not delete demo profiles',
    )
  }
  for (const user of demoUsers) {
    ensureResult(
      await supabase.auth.admin.deleteUser(user.id),
      `Could not delete demo Auth user ${user.id.slice(0, 8)}`,
    )
  }

  console.log(`Removed ${seedIds.length} screenshot theses and ${demoUsers.length} demo analysts.`)
}

if (clean) {
  await cleanSeedData()
  process.exit(0)
}

const owner = resolveOwner()
const ownerProfile = profileById.get(owner.id)
const ownerName = ownerProfile?.name || owner.user_metadata?.full_name || owner.user_metadata?.name || 'Current user'

const demoPeople = [
  {
    key: 'marcus',
    name: 'Marcus Chen',
    handle: '@mchen',
    avatar: 'MC',
    email: 'screenshot.marcus@example.com',
  },
  {
    key: 'priya',
    name: 'Priya Raghavan',
    handle: '@praghavan',
    avatar: 'PR',
    email: 'screenshot.priya@example.com',
  },
  {
    key: 'james',
    name: 'James Holloway',
    handle: '@jholloway',
    avatar: 'JH',
    email: 'screenshot.james@example.com',
  },
  {
    key: 'sofia',
    name: 'Sofia Almeida',
    handle: '@salmeida',
    avatar: 'SA',
    email: 'screenshot.sofia@example.com',
  },
]

async function ensureDemoUser(person) {
  let user = authUsers.find(
    (candidate) =>
      candidate.app_metadata?.seed_marker === SEED_MARKER &&
      candidate.app_metadata?.seed_person === person.key,
  )

  if (!user) {
    const result = await supabase.auth.admin.createUser({
      email: person.email,
      password: `${randomUUID()}!Aa9`,
      email_confirm: true,
      user_metadata: { full_name: person.name },
      app_metadata: {
        seed_marker: SEED_MARKER,
        seed_person: person.key,
      },
    })
    user = ensureResult(result, `Could not create demo analyst ${person.name}`)?.user
    authUsers.push(user)
  }

  ensureResult(
    await supabase.from('profiles').upsert({
      id: user.id,
      name: person.name,
      handle: person.handle,
      avatar: person.avatar,
      updated_at: new Date().toISOString(),
    }),
    `Could not upsert profile for ${person.name}`,
  )

  return user
}

const demoUsers = {}
for (const person of demoPeople) {
  demoUsers[person.key] = await ensureDemoUser(person)
}

const formatPublishDate = (iso) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })

const trigger = ({
  condition,
  status,
  metric,
  statement = 'income',
  period = 'annual',
  kind = 'money',
  currency = 'USD',
  op,
  value,
  scale = 'B',
}) => ({
  c: condition,
  s: status,
  metric,
  statement,
  period,
  kind,
  currency,
  comparisons: [{ op, value, scale, connector: null }],
  connectors: [],
  op,
  value,
  scale,
})

function demoModel() {
  const commonView = {
    fixedRowsTop: 1,
    fixedColumnsStart: 1,
    showHeaders: true,
    showGridlines: true,
    showFormulas: false,
    zoom: 100,
  }

  return {
    filename: 'nvda_dcf_screenshot.xlsx',
    sheets: [
      {
        name: 'DCF',
        hidden: false,
        model: {
          headers: ['', '', '', '', ''],
          rows: [
            { label: 'DCF Summary', values: ['2024A', '2025A', '2026E', '2027E', '2028E'] },
            { label: 'Revenue ($m)', values: ['130497', '208960', '=Assumptions!B2', '=C3*(1+D4)', '=D3*(1+E4)'] },
            { label: 'Revenue Growth', values: ['', '60.1%', '45.0%', '32.0%', '24.0%'] },
            { label: 'EBIT Margin', values: ['62.1%', '66.4%', '68.0%', '69.0%', '70.0%'] },
            { label: 'EBIT ($m)', values: ['=B2*B4', '=C2*C4', '=D2*D4', '=E2*E4', '=F2*F4'] },
            { label: 'Tax Rate', values: ['13.0%', '13.0%', '14.0%', '14.0%', '15.0%'] },
            { label: 'NOPAT ($m)', values: ['=B5*(1-B6)', '=C5*(1-C6)', '=D5*(1-D6)', '=E5*(1-E6)', '=F5*(1-F6)'] },
            { label: 'Terminal Multiple', values: ['', '', '', '', '28.0x'] },
            { label: 'Implied Value / Share', values: ['', '', '', '', '$241.60'] },
          ],
          formats: {
            '0,0': { b: true, c: '#ffffff', bg: '#217346' },
            '0,1': { b: true, c: '#ffffff', bg: '#217346', a: 'center' },
            '0,2': { b: true, c: '#ffffff', bg: '#217346', a: 'center' },
            '0,3': { b: true, c: '#ffffff', bg: '#217346', a: 'center' },
            '0,4': { b: true, c: '#ffffff', bg: '#217346', a: 'center' },
            '0,5': { b: true, c: '#ffffff', bg: '#217346', a: 'center' },
            '1,1': { nf: '#,##0' },
            '1,2': { nf: '#,##0' },
            '1,3': { nf: '#,##0', bg: '#fff2cc' },
            '1,4': { nf: '#,##0', bg: '#fff2cc' },
            '1,5': { nf: '#,##0', bg: '#fff2cc' },
            '2,1': { nf: '0.0%' },
            '2,2': { nf: '0.0%' },
            '2,3': { nf: '0.0%', c: '#185c37' },
            '2,4': { nf: '0.0%', c: '#185c37' },
            '2,5': { nf: '0.0%', c: '#185c37' },
            '8,0': { b: true, bg: '#e2f0e7' },
            '8,5': { b: true, bg: '#e2f0e7', c: '#185c37' },
          },
          comments: {
            '1,3': 'Base-case revenue assumption',
            '7,5': 'Terminal multiple based on peer range',
          },
          merges: [],
          colWidths: { 0: 190, 1: 92, 2: 92, 3: 92, 4: 92, 5: 92 },
          rowHeights: { 0: 28, 8: 28 },
          view: commonView,
        },
      },
      {
        name: 'Assumptions',
        hidden: false,
        model: {
          headers: ['', ''],
          rows: [
            { label: 'Key Assumptions', values: ['Base Case', 'Bear Case'] },
            { label: 'FY26 Revenue ($m)', values: ['302992', '274010'] },
            { label: 'Data Center Growth', values: ['52.0%', '37.0%'] },
            { label: 'Gross Margin', values: ['74.5%', '71.0%'] },
            { label: 'WACC', values: ['9.0%', '10.5%'] },
          ],
          formats: {
            '0,0': { b: true, c: '#ffffff', bg: '#217346' },
            '0,1': { b: true, c: '#ffffff', bg: '#217346' },
            '0,2': { b: true, c: '#ffffff', bg: '#217346' },
            '1,1': { nf: '#,##0', bg: '#fff2cc' },
            '1,2': { nf: '#,##0', bg: '#fde9e7' },
            '2,1': { nf: '0.0%' },
            '2,2': { nf: '0.0%' },
            '3,1': { nf: '0.0%' },
            '3,2': { nf: '0.0%' },
            '4,1': { nf: '0.0%' },
            '4,2': { nf: '0.0%' },
          },
          comments: {},
          merges: [],
          colWidths: { 0: 190, 1: 110, 2: 110 },
          rowHeights: { 0: 28 },
          view: commonView,
        },
      },
    ],
  }
}

function amazonModel() {
  const commonView = {
    fixedRowsTop: 1,
    fixedColumnsStart: 1,
    showHeaders: true,
    showGridlines: true,
    showFormulas: false,
    zoom: 100,
  }

  return {
    filename: 'amzn_operating_model.xlsx',
    sheets: [
      {
        name: 'Operating Model',
        hidden: false,
        model: {
          headers: ['', '', '', '', ''],
          rows: [
            { label: 'Amazon Operating Model', values: ['2024A', '2025E', '2026E', '2027E', '2028E'] },
            { label: 'Revenue ($bn)', values: ['638.0', '=Assumptions!B2', '=Assumptions!C2', '=D2*(1+E3)', '=E2*(1+F3)'] },
            { label: 'Revenue Growth', values: ['', '=C2/B2-1', '=D2/C2-1', '10.0%', '9.0%'] },
            { label: 'AWS Revenue ($bn)', values: ['107.6', '=Assumptions!B3', '=Assumptions!C3', '=D4*(1+E5)', '=E4*(1+F5)'] },
            { label: 'AWS Growth', values: ['', '=C4/B4-1', '=D4/C4-1', '20.0%', '18.0%'] },
            { label: 'Operating Income ($bn)', values: ['68.6', '=C2*C7', '=D2*D7', '=E2*E7', '=F2*F7'] },
            { label: 'Operating Margin', values: ['10.8%', '=Assumptions!B4', '=Assumptions!C4', '13.5%', '14.2%'] },
            { label: 'Free Cash Flow ($bn)', values: ['38.2', '=Assumptions!B5', '=Assumptions!C5', '75.0', '86.0'] },
            { label: 'Diluted Shares (bn)', values: ['10.7', '10.8', '10.8', '10.9', '10.9'] },
            { label: 'Net Cash ($bn)', values: ['55.0', '62.0', '72.0', '84.0', '98.0'] },
            { label: 'EV / EBIT', values: ['', '', '', '', '26.0x'] },
            { label: 'Implied Value / Share', values: ['', '', '', '', '=(F6*26+F10)/F9'] },
          ],
          formats: {
            '0,0': { b: true, c: '#ffffff', bg: '#217346' },
            '0,1': { b: true, c: '#ffffff', bg: '#217346' },
            '0,2': { b: true, c: '#ffffff', bg: '#217346' },
            '0,3': { b: true, c: '#ffffff', bg: '#217346' },
            '0,4': { b: true, c: '#ffffff', bg: '#217346' },
            '0,5': { b: true, c: '#ffffff', bg: '#217346' },
            '2,2': { nf: '0.0%' },
            '2,3': { nf: '0.0%' },
            '2,4': { nf: '0.0%', bg: '#fff2cc' },
            '2,5': { nf: '0.0%', bg: '#fff2cc' },
            '4,2': { nf: '0.0%' },
            '4,3': { nf: '0.0%' },
            '4,4': { nf: '0.0%', bg: '#fff2cc' },
            '4,5': { nf: '0.0%', bg: '#fff2cc' },
            '6,1': { nf: '0.0%' },
            '6,2': { nf: '0.0%', bg: '#fff2cc' },
            '6,3': { nf: '0.0%', bg: '#fff2cc' },
            '6,4': { nf: '0.0%', bg: '#fff2cc' },
            '6,5': { nf: '0.0%', bg: '#fff2cc' },
            '11,5': { nf: '$0.00', b: true, bg: '#e2f0d9' },
          },
          comments: {
            '11,5': 'Illustrative value based on the 2028 operating-income estimate and selected EV/EBIT multiple.',
          },
          merges: [],
          colWidths: { 0: 220, 1: 100, 2: 100, 3: 100, 4: 100, 5: 100 },
          rowHeights: { 0: 28, 11: 26 },
          view: commonView,
        },
      },
      {
        name: 'Assumptions',
        hidden: false,
        model: {
          headers: ['', ''],
          rows: [
            { label: 'Base-Case Assumptions', values: ['2025E', '2026E'] },
            { label: 'Revenue ($bn)', values: ['700.0', '780.5'] },
            { label: 'AWS Revenue ($bn)', values: ['132.0', '162.0'] },
            { label: 'Operating Margin', values: ['11.7%', '12.7%'] },
            { label: 'Free Cash Flow ($bn)', values: ['52.0', '63.0'] },
          ],
          formats: {
            '0,0': { b: true, c: '#ffffff', bg: '#217346' },
            '0,1': { b: true, c: '#ffffff', bg: '#217346' },
            '0,2': { b: true, c: '#ffffff', bg: '#217346' },
            '1,1': { nf: '0.0', bg: '#fff2cc' },
            '1,2': { nf: '0.0', bg: '#fff2cc' },
            '2,1': { nf: '0.0', bg: '#fff2cc' },
            '2,2': { nf: '0.0', bg: '#fff2cc' },
            '3,1': { nf: '0.0%', bg: '#fff2cc' },
            '3,2': { nf: '0.0%', bg: '#fff2cc' },
            '4,1': { nf: '0.0', bg: '#fff2cc' },
            '4,2': { nf: '0.0', bg: '#fff2cc' },
          },
          comments: {},
          merges: [],
          colWidths: { 0: 220, 1: 110, 2: 110 },
          rowHeights: { 0: 28 },
          view: commonView,
        },
      },
    ],
  }
}

function scenarioModel({ ticker, company, side, sector, entry, current }) {
  const isBear = side === 'bear'
  const targets = isBear
    ? [entry * 0.62, entry * 0.82, entry * 1.25]
    : [entry * 0.75, entry * 1.2, entry * 1.5]
  const growth = isBear ? ['-8.0%', '2.0%', '10.0%'] : ['4.0%', '10.0%', '16.0%']
  const margins = isBear ? ['8.0%', '12.0%', '17.0%'] : ['12.0%', '17.0%', '22.0%']
  const commonView = {
    fixedRowsTop: 1,
    fixedColumnsStart: 1,
    showHeaders: true,
    showGridlines: true,
    showFormulas: false,
    zoom: 100,
  }

  return {
    filename: `${ticker.toLowerCase()}_scenario_model.xlsx`,
    sheets: [
      {
        name: 'Scenario Valuation',
        hidden: false,
        model: {
          headers: ['', '', ''],
          rows: [
            { label: `${ticker} Scenario Valuation`, values: ['Bear', 'Base', 'Bull'] },
            { label: 'Revenue Growth', values: growth },
            { label: 'Operating Margin', values: margins },
            { label: 'Price Target', values: targets.map((value) => value.toFixed(2)) },
            { label: 'Probability', values: ['25.0%', '50.0%', '25.0%'] },
            { label: 'Probability-Weighted Value', values: ['=SUMPRODUCT(B4:D4,B5:D5)', '', ''] },
            { label: 'Entry Price', values: [Number(entry).toFixed(2), '', ''] },
            { label: 'Expected Return', values: ['=B6/B7-1', '', ''] },
          ],
          formats: {
            '0,0': { b: true, c: '#ffffff', bg: '#217346' },
            '0,1': { b: true, c: '#ffffff', bg: '#217346' },
            '0,2': { b: true, c: '#ffffff', bg: '#217346' },
            '0,3': { b: true, c: '#ffffff', bg: '#217346' },
            '1,1': { nf: '0.0%' },
            '1,2': { nf: '0.0%', bg: '#fff2cc' },
            '1,3': { nf: '0.0%' },
            '2,1': { nf: '0.0%' },
            '2,2': { nf: '0.0%', bg: '#fff2cc' },
            '2,3': { nf: '0.0%' },
            '3,1': { nf: '$0.00' },
            '3,2': { nf: '$0.00', bg: '#fff2cc' },
            '3,3': { nf: '$0.00' },
            '4,1': { nf: '0.0%' },
            '4,2': { nf: '0.0%', bg: '#fff2cc' },
            '4,3': { nf: '0.0%' },
            '5,1': { nf: '$0.00', b: true, bg: '#e2f0d9' },
            '6,1': { nf: '$0.00' },
            '7,1': { nf: '0.0%', b: true, bg: '#e2f0d9' },
          },
          comments: {
            '5,1': 'Probability-weighted illustrative value across the three scenarios.',
            '7,1': `Expected security return from the publication entry price. The thesis direction is ${side.toUpperCase()}.`,
          },
          merges: [],
          colWidths: { 0: 230, 1: 110, 2: 110, 3: 110 },
          rowHeights: { 0: 28, 5: 26, 7: 26 },
          view: commonView,
        },
      },
      {
        name: 'Thesis Inputs',
        hidden: false,
        model: {
          headers: ['', ''],
          rows: [
            { label: `${company} Inputs`, values: ['Current View', 'Review Note'] },
            { label: 'Ticker', values: [ticker, 'Locked at publication'] },
            { label: 'Sector', values: [sector, 'Peer framework'] },
            { label: 'Position', values: [side === 'bear' ? 'SHORT' : 'LONG', 'Direction of thesis'] },
            { label: 'Entry Price', values: [Number(entry).toFixed(2), 'Sealed'] },
            { label: 'Current / Close Price', values: [Number(current).toFixed(2), 'Latest seeded value'] },
            { label: 'Review Status', values: ['MONITOR', 'Revisit after the next reported quarter'] },
          ],
          formats: {
            '0,0': { b: true, c: '#ffffff', bg: '#217346' },
            '0,1': { b: true, c: '#ffffff', bg: '#217346' },
            '0,2': { b: true, c: '#ffffff', bg: '#217346' },
            '3,1': { b: true, bg: side === 'bear' ? '#fde9e7' : '#e2f0d9' },
            '4,1': { nf: '$0.00' },
            '5,1': { nf: '$0.00' },
            '6,1': { b: true, bg: '#fff2cc' },
          },
          comments: {},
          merges: [],
          colWidths: { 0: 210, 1: 140, 2: 260 },
          rowHeights: { 0: 28 },
          view: commonView,
        },
      },
    ],
  }
}

const listItems = (items) => items.map((item) => `<li>${item}</li>`).join('')

function investmentThesisBody({
  thesis,
  variant,
  drivers,
  catalysts,
  valuation,
  risks,
  invalidation,
  monitoring,
}) {
  return `<h1>Investment thesis</h1>
    <p>${thesis}</p>
    <h2>Variant perception</h2>
    <p>${variant}</p>
    <h2>Key earnings drivers</h2>
    <ul>${listItems(drivers)}</ul>
    <h2>Catalysts</h2>
    <ol>${listItems(catalysts)}</ol>
    <h2>Valuation framework</h2>
    <p>${valuation}</p>
    <h2>Principal risks</h2>
    <ul>${listItems(risks)}</ul>
    <h2>What would invalidate the thesis</h2>
    <blockquote>${invalidation}</blockquote>
    <h2>KPIs to monitor</h2>
    <ul>${listItems(monitoring)}</ul>`
}

const detailedThesisCases = {
  'owner-amzn-aws-retail-efficiency': {
    thesis: `Amazon can compound operating income faster than revenue because three structurally attractive profit pools are scaling at the same time: AWS, advertising, and a more efficient North American retail network. The retail business no longer needs heroic gross-merchandise-volume growth to create value; regional fulfilment, greater delivery density, and better inventory placement can convert modest volume growth into durable margin expansion. AWS and advertising provide the mix shift that supports free-cash-flow growth even through an elevated data-centre investment cycle.`,
    variant: `The market broadly recognizes that Amazon owns high-quality assets, but it still tends to value AWS, advertising, and retail independently. That misses the operating flywheel between Prime engagement, first-party shopping data, merchant services, advertising inventory, and cloud infrastructure. Consensus also treats recent retail margin gains as partly cyclical and assumes generative-AI capital expenditure will suppress cash conversion for longer than the revenue opportunity justifies.`,
    drivers: [
      `<strong>AWS growth:</strong> migration, database modernization, generative-AI training, and inference workloads can sustain growth above the consolidated company rate.`,
      `<strong>Retail productivity:</strong> regional fulfilment lowers miles per package, reduces split shipments, and improves delivery speed without rebuilding the network.`,
      `<strong>Advertising mix:</strong> sponsored listings and streaming inventory monetize high-intent traffic at attractive incremental margins.`,
      `<strong>Capital allocation:</strong> logistics capital intensity should remain below the pandemic buildout while data-centre spending earns revenue over a multi-year useful life.`,
    ],
    catalysts: [
      `AWS growth remains above 20% as new AI capacity becomes available and backlog converts into revenue.`,
      `North American operating margin holds above its pre-regionalization range through a normal promotional environment.`,
      `Free-cash-flow growth resumes as infrastructure investment grows more slowly than operating cash flow.`,
    ],
    valuation: `The base case values Amazon on consolidated free cash flow while cross-checking AWS against global cloud peers and retail against mature marketplace businesses. A sum-of-the-parts approach is useful, but the investment case does not require assigning a venture-style multiple to every optional business. The attached model uses scenario probabilities for revenue growth, operating margin, and the terminal operating-income multiple.`,
    risks: [
      `AI infrastructure spending could produce lower utilization or returns than expected.`,
      `Retail price competition, wage inflation, or delivery-service commitments could reverse fulfilment productivity gains.`,
      `Antitrust remedies could constrain marketplace economics, advertising placement, or Prime bundling.`,
    ],
    invalidation: `The thesis is invalidated if AWS loses material cloud share while consolidated capital intensity rises, or if North American retail margins fall back despite stable demand and a mature regional network.`,
    monitoring: [`AWS revenue growth and backlog`, `North American and international operating margin`, `Advertising-services growth`, `Capital expenditure and trailing free cash flow`],
  },
  'owner-nvda-ai-infrastructure': {
    thesis: `NVIDIA is best understood as an accelerated-computing platform rather than a conventional semiconductor cycle. Its advantage combines leading processors, high-speed networking, systems engineering, CUDA software, and a developer ecosystem that lowers the total time and execution risk required to deploy AI workloads. As model training and inference become core infrastructure, NVIDIA can capture value across a larger share of the data-centre bill of materials.`,
    variant: `The bearish framing assumes hyperscaler AI capital expenditure will peak before customers earn adequate returns and that custom accelerators will rapidly commoditize merchant GPUs. The variant view is that compute demand is constrained by power, networking, and deployment capacity rather than end demand, while heterogeneous workloads preserve the value of a flexible, broadly supported platform. Custom silicon can grow without eliminating NVIDIA's role in frontier training, enterprise adoption, and networking.`,
    drivers: [
      `<strong>Platform content:</strong> full-rack systems and networking increase revenue per deployment beyond the accelerator alone.`,
      `<strong>Architecture cadence:</strong> frequent product transitions expand performance per watt and encourage customers to standardize around the roadmap.`,
      `<strong>Inference growth:</strong> larger installed models, reasoning workloads, and agentic applications increase recurring compute consumption.`,
      `<strong>Software ecosystem:</strong> CUDA libraries, developer tooling, and enterprise software reinforce switching costs.`,
    ],
    catalysts: [
      `New architecture shipments scale without a prolonged transition-related supply gap.`,
      `Hyperscalers maintain or raise multi-year AI infrastructure budgets.`,
      `Networking and systems revenue grow faster than standalone accelerator revenue.`,
    ],
    valuation: `The base case applies a premium multiple to normalized earnings because the company combines high growth, net cash, and platform economics. The model explicitly fades growth and margins over time rather than capitalizing peak conditions indefinitely. Downside is assessed using a sharper spending pause and multiple compression; upside assumes inference broadens demand beyond the largest cloud customers.`,
    risks: [
      `Customer concentration gives a small group of hyperscalers significant purchasing power.`,
      `Export restrictions can remove addressable markets and complicate product design.`,
      `Custom accelerators, competing GPUs, or open software layers could weaken ecosystem lock-in.`,
    ],
    invalidation: `The thesis is invalidated by two consecutive architecture cycles of material market-share loss, declining networking attach rates, or evidence that customer AI spending produces persistently inadequate utilization.`,
    monitoring: [`Data-centre revenue and sequential growth`, `Gross margin through product transitions`, `Networking attach and systems mix`, `Hyperscaler capital-expenditure guidance`],
  },
  'owner-asml-euv-moat': {
    thesis: `ASML is the critical equipment bottleneck for advanced semiconductor manufacturing. The investment case rests not only on new EUV and High-NA system shipments, but also on an expanding installed base that generates service, productivity-upgrade, and field-option revenue over decades. That recurring layer makes earnings power more durable than a simple wafer-fabrication-equipment cycle would imply.`,
    variant: `Investors often focus on quarterly shipment timing and customer fab delays because individual systems are expensive and acceptance dates can move revenue between periods. The variant view is that lithography intensity per leading-edge wafer continues to rise, service revenue compounds with the fleet, and customers cannot economically substitute away from ASML when advanced-node roadmaps resume. Short-term order volatility therefore overstates the change in long-run franchise value.`,
    drivers: [
      `<strong>EUV demand:</strong> greater patterning complexity and leading-edge capacity support system demand across logic and memory.`,
      `<strong>Installed-base management:</strong> service contracts, upgrades, and productivity improvements create recurring revenue with attractive visibility.`,
      `<strong>High-NA adoption:</strong> the next lithography generation increases content and reinforces ASML's roadmap control.`,
      `<strong>Pricing and mix:</strong> higher-value systems and field upgrades support revenue growth even when unit shipments are uneven.`,
    ],
    catalysts: [
      `Customer qualification milestones confirm the High-NA production roadmap.`,
      `Memory utilization and advanced-node capital spending recover from cyclical lows.`,
      `Installed-base revenue grows faster than conservative service assumptions.`,
    ],
    valuation: `ASML should be valued on mid-cycle free cash flow and the duration of its monopoly-like lithography position, not a single year's shipment count. The base case normalizes system acceptance timing and assumes service revenue grows with the installed base. The principal valuation debate is the appropriate premium for a uniquely durable bottleneck offset by export and customer-concentration risks.`,
    risks: [
      `Export controls can restrict shipments and service activity in important markets.`,
      `Customer project delays can create material annual revenue volatility.`,
      `High-NA adoption could be slower if alternative patterning approaches remain economical for longer.`,
    ],
    invalidation: `The thesis is invalidated if leading customers permanently reduce EUV layers per advanced wafer, High-NA fails its productivity roadmap, or installed-base revenue per tool declines for structural rather than timing reasons.`,
    monitoring: [`EUV and High-NA bookings`, `Installed-base management revenue`, `Gross margin and system mix`, `Customer leading-edge capital-expenditure plans`],
  },
  'owner-tsla-robotaxi': {
    thesis: `The short thesis is that Tesla's valuation discounts a rapid transition from automobile manufacturing to a high-margin autonomous network before the unit economics, regulatory framework, and independently verifiable operating evidence exist. The automotive business remains exposed to price competition, factory utilization, and product-cycle risk, while the market assigns substantial value to autonomy and robotics outcomes that require additional capital and execution.`,
    variant: `The consensus bull case treats autonomy as primarily a software-release problem and assumes a large installed fleet creates an immediate network advantage. The variant view is that safe driverless operation is a systems, regulation, insurance, and fleet-management problem. Until commercial deployments demonstrate low intervention rates and attractive utilization, automotive cash flows should carry more weight than distant platform economics.`,
    drivers: [
      `<strong>Automotive pricing:</strong> incentives and financing support can protect volume while pressuring reported margin.`,
      `<strong>Factory utilization:</strong> new capacity and product transitions create operating leverage in both directions.`,
      `<strong>Autonomy spending:</strong> compute, data-centre, and fleet investment increase the cash cost of proving the robotaxi thesis.`,
      `<strong>Mix:</strong> energy storage can grow rapidly but may not offset weaker automotive earnings at the current valuation.`,
    ],
    catalysts: [
      `Automotive gross margin remains below the level required to support consensus earnings.`,
      `Commercial autonomy milestones arrive later or at smaller scale than valuation assumptions imply.`,
      `Free cash flow remains constrained by product, factory, and AI infrastructure investment.`,
    ],
    valuation: `The downside case values the automotive and energy businesses on normalized industrial earnings and assigns probability-weighted value to autonomy rather than capitalizing a mature network upfront. The short does not require autonomy to fail; it requires the timing, margin, or addressable fleet to fall short of what is already embedded in the share price.`,
    risks: [
      `Verified driverless deployment could establish a credible high-margin revenue stream sooner than expected.`,
      `A lower-cost vehicle or manufacturing breakthrough could restore volume growth and margins.`,
      `Narrative momentum and retail positioning can sustain a valuation disconnect for extended periods.`,
    ],
    invalidation: `The short is invalidated by independently verified, scaled driverless operations with improving unit economics alongside sustained automotive margin expansion and positive free-cash-flow conversion.`,
    monitoring: [`Automotive gross margin excluding credits`, `Deliveries, inventory, and incentives`, `Capital expenditure and free cash flow`, `Paid driverless miles and intervention disclosures`],
  },
  'owner-lly-capacity': {
    thesis: `Eli Lilly's obesity and diabetes franchise had demand well above available supply, making manufacturing capacity—not end-market adoption—the binding constraint on revenue. The original long thesis was that new production lines, device capacity, and contract-manufacturing investments would convert visible demand into reported volume while label expansion broadened the addressable market.`,
    variant: `The market understood the clinical quality of the incretin portfolio but underestimated the earnings sensitivity to supply. Consensus models treated shortages as a simple lost-sales problem; the variant view was that capacity additions would improve volume, persistence, payer engagement, and physician confidence simultaneously. That combination could raise both near-term estimates and the perceived duration of growth.`,
    drivers: [
      `<strong>Manufacturing throughput:</strong> fill-finish, device, and active-ingredient capacity determine realizable prescription growth.`,
      `<strong>Indication expansion:</strong> cardiovascular, sleep-apnoea, and other outcomes can expand reimbursement and treatment duration.`,
      `<strong>Portfolio depth:</strong> oral and next-generation candidates reduce dependence on one injectable product.`,
      `<strong>Operating leverage:</strong> high incremental gross profit supports earnings growth ahead of revenue as supply normalizes.`,
    ],
    catalysts: [
      `New production lines receive qualification and contribute saleable volume.`,
      `Outcomes data supports additional labels and payer coverage.`,
      `Prescription growth converts into revenue without a material increase in rebates.`,
    ],
    valuation: `The position was underwritten using a multi-year patient and capacity build rather than peak near-term prescription growth. A probability-adjusted pipeline value was added to the commercial franchise, while the downside case assumed slower access and more aggressive competition. The thesis was closed after capacity-driven estimate revisions and the valuation premium captured much of the original upside.`,
    risks: [
      `Manufacturing complexity can delay supply despite announced capital spending.`,
      `Competitive efficacy, tolerability, or pricing can reduce share and payer leverage.`,
      `Safety findings or reimbursement restrictions can shorten treatment duration.`,
    ],
    invalidation: `The original thesis would have failed if qualified capacity did not translate into sustained prescription growth, or if competitive and payer pressure prevented incremental volume from producing earnings leverage.`,
    monitoring: [`Prescription volumes and dose availability`, `Manufacturing-capacity milestones`, `Net pricing and payer coverage`, `Pipeline readouts and label expansions`],
  },
  'owner-jpm-scale': {
    thesis: `JPMorgan's scale in deposits, payments, cards, markets, and technology spending allows it to take share while still earning attractive returns through a range of interest-rate and credit environments. The original thesis was that excess investment was not simply a cost burden: it widened the gap in customer experience, fraud controls, data infrastructure, and regulatory readiness that smaller competitors would struggle to match.`,
    variant: `Banks are often valued as mean-reverting balance sheets, leading investors to assume JPMorgan's premium returns and valuation must normalize quickly. The variant view was that scale advantages had become more durable after repeated regulatory and technology investment cycles. Normalization in net interest income could be offset by fee growth, share gains, and disciplined credit, allowing the bank to retain a structural premium.`,
    drivers: [
      `<strong>Deposit franchise:</strong> broad consumer and corporate relationships support resilient funding and lower liquidity risk.`,
      `<strong>Fee businesses:</strong> payments, markets, investment banking, and asset management diversify earnings away from rates.`,
      `<strong>Technology investment:</strong> a larger budget spreads across more customers and products, reinforcing service and risk advantages.`,
      `<strong>Capital deployment:</strong> organic growth and repurchases can compound per-share value when regulatory buffers permit.`,
    ],
    catalysts: [
      `Investment-banking and capital-markets activity normalizes from subdued levels.`,
      `Credit costs remain manageable despite slower nominal growth.`,
      `Capital returns increase after regulatory requirements become clearer.`,
    ],
    valuation: `The bank was valued on normalized tangible-book-value growth and through-cycle return on tangible common equity rather than peak net interest income. The position was closed after the premium to large-bank peers moved toward the upper end of its post-crisis range and reduced the margin of safety.`,
    risks: [
      `A severe credit cycle could overwhelm diversification and increase capital requirements.`,
      `Deposit competition or faster rate cuts could compress net interest income.`,
      `Regulatory penalties and higher required capital could lower distributable returns.`,
    ],
    invalidation: `The thesis would be invalidated by sustained share loss, through-cycle returns converging with average peers, or evidence that technology spending no longer produces operating or risk advantages.`,
    monitoring: [`Net interest income and deposit costs`, `Credit losses and reserve formation`, `Fee revenue by franchise`, `CET1 capital and tangible book value per share`],
  },
  'marcus-avgo': {
    thesis: `Broadcom offers two distinct ways to participate in AI infrastructure: custom accelerators for hyperscalers and the networking fabric required to connect large clusters. Those businesses sit alongside durable semiconductor franchises and a high-margin infrastructure-software portfolio. The combination can support strong free-cash-flow growth without requiring Broadcom to displace merchant GPUs.`,
    variant: `The market often treats custom silicon as a winner-takes-share substitute for GPUs and views large software acquisitions primarily as financial engineering. The variant view is that heterogeneous AI workloads expand the total compute market, while switching and integration costs make infrastructure software more durable than headline licence growth suggests. Broadcom can therefore compound through mix, cross-selling, and disciplined portfolio management.`,
    drivers: [
      `<strong>Custom accelerators:</strong> co-designed silicon captures workload-specific demand at the largest cloud customers.`,
      `<strong>Networking:</strong> switching, routing, and optical content rise with cluster size and bandwidth requirements.`,
      `<strong>Software integration:</strong> product rationalization and subscription discipline can improve cash conversion.`,
      `<strong>Capital returns:</strong> high free cash flow supports debt reduction and dividends after acquisitions.`,
    ],
    catalysts: [
      `Additional hyperscaler accelerator programs enter production.`,
      `AI networking revenue grows faster than accelerator deployments.`,
      `Software bookings and margins stabilize after portfolio integration.`,
    ],
    valuation: `The base case separates semiconductor and software cash flows, applying conservative growth fade and acquisition-related debt reduction. The premium is justified only if AI content broadens while software retention remains strong. Downside assumes customer concentration, slower accelerator ramps, and a lower software multiple.`,
    risks: [`A small number of customers account for a large share of AI revenue.`, `Insourcing could reduce Broadcom's economics on future custom programs.`, `Aggressive software optimization could damage retention and long-term product relevance.`],
    invalidation: `The thesis is invalidated if custom-accelerator design wins fail to reach production, networking content per cluster declines, or software retention deteriorates enough to offset margin gains.`,
    monitoring: [`AI semiconductor revenue`, `Networking growth and backlog`, `Software bookings and retention`, `Free cash flow and net leverage`],
  },
  'marcus-tsm': {
    thesis: `TSMC's manufacturing lead, yield learning, and trusted foundry model make it the default producer for the most demanding logic designs. The original long thesis emphasized that advanced packaging—not only leading-edge wafers—had become a critical bottleneck for AI systems. Expanding packaging capacity could unlock customer shipments while raising TSMC's content and strategic relevance.`,
    variant: `Investors frequently frame foundry earnings around smartphone units and node transitions. The variant view was that AI accelerators increase die size, packaging complexity, and demand for leading-edge capacity, creating a richer content opportunity even if consumer electronics grow slowly. Customer attempts to diversify manufacturing would remain constrained by yield, ecosystem, and time-to-market requirements.`,
    drivers: [`Leading-edge wafer demand from AI and high-performance computing.`, `CoWoS and other advanced-packaging capacity expansion.`, `Pricing discipline supported by performance and yield advantages.`, `Operating leverage as new-node utilization rises.`],
    catalysts: [`Packaging capacity additions remove customer shipment bottlenecks.`, `New-node yields reach volume-production targets.`, `Overseas-fab subsidies and customer commitments reduce dilution from geographic diversification.`],
    valuation: `The position was valued on normalized free cash flow through a heavy capital cycle, with a premium for technology leadership offset by geopolitical risk. It was closed after packaging scarcity and AI demand became widely reflected in estimates and the risk-reward narrowed.`,
    risks: [`Geopolitical disruption is the dominant tail risk.`, `Overseas manufacturing can carry structurally higher costs.`, `A sharp AI spending slowdown would reduce leading-edge utilization.`],
    invalidation: `The thesis would fail if leading-edge yield or packaging execution caused persistent share loss to competing foundries, rather than temporary customer diversification.`,
    monitoring: [`Advanced-node revenue mix`, `CoWoS capacity and utilization`, `Gross margin by overseas-fab ramp`, `Capital intensity and customer prepayments`],
  },
  'marcus-mu': {
    thesis: `High-bandwidth memory changes Micron's earnings quality by shifting mix toward technically differentiated, capacity-intensive products with longer qualification cycles. HBM consumes substantially more wafer capacity per bit than conventional DRAM, tightening the broader memory market while increasing Micron's exposure to AI infrastructure. The result can be a stronger mid-cycle margin and cash-flow profile than previous commodity upcycles.`,
    variant: `The market remains conditioned to fade memory earnings as soon as pricing improves. The variant view is that HBM demand, limited qualified supply, and disciplined capital spending can keep industry utilization tighter for longer. Micron does not need to dominate HBM; reaching credible share while protecting conventional DRAM supply discipline can materially reset normalized earnings.`,
    drivers: [`HBM qualification and production yields`, `DRAM supply growth below bit-demand growth`, `Product mix toward data centre and automotive`, `Capital spending discipline across the memory industry`],
    catalysts: [`Additional HBM customer qualifications`, `Long-term supply agreements improve revenue visibility`, `Conventional DRAM pricing strengthens as HBM absorbs capacity`],
    valuation: `The base case values Micron on normalized earnings and replacement cost rather than annualizing peak spot pricing. Upside assumes HBM lifts through-cycle gross margin; downside assumes a conventional inventory correction and delayed qualification. Balance-sheet resilience determines how much of the cycle converts into per-share value.`,
    risks: [`HBM yields may lag peers and delay revenue.`, `Competitors could add capacity faster than end demand.`, `Memory pricing remains inherently cyclical and sensitive to inventory corrections.`],
    invalidation: `The thesis is invalidated if Micron fails major HBM qualifications, industry supply growth again exceeds demand, or HBM mix does not improve consolidated margins through the cycle.`,
    monitoring: [`HBM revenue and customer qualifications`, `DRAM bit shipments and pricing`, `Gross margin`, `Capital expenditure as a percentage of revenue`],
  },
  'priya-mrna': {
    thesis: `The short thesis was that Moderna's post-pandemic cash balance and platform narrative obscured the economic gap between an approved COVID franchise and a broad but expensive development pipeline. Respiratory products could generate revenue, but not necessarily enough contribution profit to fund oncology, rare-disease, and latent-virus programs before the company consumed a substantial portion of its cash.`,
    variant: `The bull case valued the pipeline by applying platform probabilities across many programs and assumed manufacturing and regulatory capabilities created repeatable development advantages. The variant view was that each program still carried indication-specific clinical, commercial, and competitive risk, while the fixed cost base had been built for a much larger respiratory franchise.`,
    drivers: [`Seasonal COVID demand and pricing`, `RSV and combination-vaccine adoption`, `Research and development spending`, `Cash burn and manufacturing utilization`],
    catalysts: [`Respiratory guidance falls short of the cost base required for breakeven.`, `Late-stage readouts fail to support platform-wide probability assumptions.`, `Management extends the timeline to sustainable positive cash flow.`],
    valuation: `The short compared net cash with the present value of operating losses and probability-adjusted commercial assets. It did not assign zero value to the pipeline; it argued that the market value exceeded what conservative program-level probabilities could support. The position was closed at a loss when respiratory expectations and pipeline sentiment improved faster than the cost base reset.`,
    risks: [`A successful oncology readout can create large discontinuous upside.`, `Partnerships can fund development and validate platform assets.`, `Rapid cost reductions could preserve more cash than expected.`],
    invalidation: `The short would be invalidated by a credible path to self-funding operations supported by multiple differentiated commercial products rather than one seasonal franchise.`,
    monitoring: [`Product revenue by franchise`, `Quarterly operating cash burn`, `R&D and selling expense`, `Late-stage trial milestones and partnerships`],
  },
  'priya-pfe': {
    thesis: `Pfizer faces a concentrated loss-of-exclusivity cycle that cost reductions alone cannot solve. The bear case is that management can protect near-term earnings through restructuring, but the market still overestimates how quickly acquired and internal pipeline assets can replace mature blockbuster cash flows. Debt-financed business development also reduces flexibility if launches disappoint.`,
    variant: `The bull case treats the patent cliff as well understood and assumes oncology acquisitions plus a broad pipeline will restore growth before the revenue trough. The variant view is that replacement revenue must be evaluated after launch costs, royalties, and integration spending, while several mature products can decline simultaneously.`,
    drivers: [`Revenue erosion from major patent expiries`, `Commercial uptake of acquired oncology products`, `Cost-reduction delivery without damaging launches`, `Debt reduction and capital allocation`],
    catalysts: [`Consensus lowers revenue assumptions for loss-of-exclusivity products.`, `New launches track below the pace required to fill the gap.`, `Pipeline setbacks reduce the probability-adjusted replacement value.`],
    valuation: `The bear case uses trough free cash flow and a conservative value for the late-stage pipeline, giving credit for cost savings but not capitalizing them as growth. Upside risk comes from successful launches and faster deleveraging; downside expands if the company responds to the cliff with further expensive acquisitions.`,
    risks: [`Oncology launches could exceed conservative expectations.`, `A major pipeline success can materially change the replacement-revenue profile.`, `More aggressive cost action could protect free cash flow.`],
    invalidation: `The thesis is invalidated if new and acquired products create a visible, diversified revenue bridge before key expiries while leverage declines and research productivity improves.`,
    monitoring: [`Revenue exposed to loss of exclusivity`, `Oncology launch trajectories`, `Pipeline probability changes`, `Net debt and free cash flow`],
  },
  'priya-unh': {
    thesis: `UnitedHealth's valuation can recover as elevated medical utilization normalizes and Optum's diversified earnings demonstrate resilience. The company combines scaled insurance underwriting, care delivery, pharmacy services, and data capabilities. Temporary medical-cost pressure can obscure the long-run value of that integration, particularly when pricing can reset with a lag.`,
    variant: `The market is capitalizing recent medical-cost pressure and regulatory scrutiny as a permanent reduction in earnings quality. The variant view is that pricing, benefit design, care-management data, and Optum productivity provide multiple adjustment levers. The recovery does not require utilization to collapse; it requires premium growth and operating actions to catch up with a higher but stable cost trend.`,
    drivers: [`Medical cost ratio and premium repricing`, `Medicare Advantage funding and benefit design`, `Optum Health value-based-care economics`, `Pharmacy and data-services growth`],
    catalysts: [`Medical cost trends stabilize within updated pricing assumptions.`, `Optum margins recover as operational remediation takes hold.`, `Regulatory outcomes prove manageable relative to the valuation discount.`],
    valuation: `The base case applies a lower-than-historical multiple to normalized earnings and explicitly haircuts Optum margins. Upside comes from restoring confidence in earnings visibility; downside assumes utilization remains above pricing and regulatory remedies reduce integration benefits.`,
    risks: [`Persistent utilization can keep the medical cost ratio elevated.`, `Government reimbursement changes may compress Medicare Advantage economics.`, `Regulatory and execution issues could impair Optum's growth and reputation.`],
    invalidation: `The thesis is invalidated if pricing repeatedly fails to cover medical trends, Optum margins structurally decline, or regulatory remedies dismantle the economic benefits of the integrated model.`,
    monitoring: [`Medical cost ratio`, `Medicare Advantage membership and rates`, `Optum revenue and margin`, `Cash flow relative to adjusted earnings`],
  },
  'james-tsla': {
    thesis: `The original short separated Tesla's automotive cash flows from the value assigned to autonomy. The market was willing to look through weaker pricing, utilization, and near-term earnings because robotaxi optionality dominated the narrative. The thesis was that automotive margin reality would matter before a scaled autonomous network could be proven.`,
    variant: `The bull case assumed software economics would rapidly replace manufacturing economics. The variant view was that autonomy required significant deployment, regulatory, insurance, and fleet-operating investment, while the existing automotive franchise remained cyclical and capital intensive.`,
    drivers: [`Vehicle pricing and incentives`, `Factory utilization and product-cycle costs`, `Autonomy capital expenditure`, `Energy-storage contribution`],
    catalysts: [`Automotive margin misses consensus expectations.`, `Robotaxi timelines extend without independently disclosed operating metrics.`, `Free cash flow remains weak despite delivery growth.`],
    valuation: `The short used a sum-of-the-parts framework that valued automotive and energy on normalized cash flows and assigned probability-weighted value to autonomy. It was closed after the expected margin pressure became visible and the incremental downside no longer justified event risk.`,
    risks: [`A credible commercial driverless launch could re-rate the shares.`, `Manufacturing cost reductions could restore margins quickly.`, `Narrative and technical positioning can overwhelm near-term fundamentals.`],
    invalidation: `The short would fail if scaled driverless operations showed attractive unit economics while automotive margins and free cash flow improved simultaneously.`,
    monitoring: [`Automotive gross margin`, `Average selling price and incentives`, `Free cash flow`, `Commercial autonomous miles`],
  },
  'james-rivn': {
    thesis: `Rivian's strategic funding improves liquidity but does not by itself prove sustainable unit economics. The bear case is that the next vehicle platform must ramp on time, at scale, and with a materially lower bill of materials before the company consumes too much of its extended runway. Liquidity reduces immediate financing risk while leaving manufacturing execution as the central valuation question.`,
    variant: `The bull case treats external investment and platform partnerships as validation that bridges Rivian to a mass-market product. The variant view is that capital partners can value technology and strategic optionality differently from public shareholders, while fixed costs, supplier terms, warranty expense, and launch inefficiencies still determine equity value.`,
    drivers: [`Gross profit per vehicle`, `R2 platform timing and capital requirements`, `Delivery volume and average selling price`, `Quarterly cash burn and liquidity`],
    catalysts: [`R2 spending rises faster than cost reductions.`, `Delivery growth fails to absorb plant fixed costs.`, `Management revises the timeline to positive gross margin or free cash flow.`],
    valuation: `The downside framework starts with cash and committed funding, subtracts cumulative burn to a credible breakeven point, and applies conservative value to the installed plant and software assets. Upside requires a successful R2 ramp with positive contribution margins rather than simply higher units.`,
    risks: [`A strong R2 launch could materially improve utilization and supplier economics.`, `Additional strategic funding could extend the runway on favourable terms.`, `Software partnerships may create higher-margin licensing revenue.`],
    invalidation: `The short is invalidated if Rivian demonstrates sustained positive gross profit, launches R2 on budget, and shows a funded path to positive free cash flow without significant dilution.`,
    monitoring: [`Automotive gross profit`, `Cash and quarterly burn`, `R2 tooling and launch milestones`, `Supplier commitments and warranty costs`],
  },
  'james-gm': {
    thesis: `General Motors offered an attractive cash-return yield supported by resilient North American truck and SUV economics. The original long thesis did not require assigning substantial value to autonomy or an immediate electric-vehicle profit inflection. A discounted core business, disciplined incentives, and aggressive repurchases could drive per-share value even in a mature industry.`,
    variant: `The market viewed peak truck profits as unsustainable and treated EV investment as a prolonged drag. The variant view was that flexible production, captive finance, and capital returns could preserve equity value while management staged EV investment against demand rather than pursuing volume at any cost.`,
    drivers: [`North American pricing and mix`, `Warranty and incentive discipline`, `Share repurchases`, `EV variable-profit improvement`],
    catalysts: [`Repurchases reduce the share count at a discounted valuation.`, `Core truck margins remain resilient through a softer demand environment.`, `EV losses narrow as capacity and product mix are adjusted.`],
    valuation: `The position was underwritten on normalized automotive free cash flow and the value of the finance subsidiary, with limited credit for autonomy. It was closed after buybacks and stronger core earnings materially reduced the original valuation discount.`,
    risks: [`A recession could sharply reduce high-margin vehicle demand.`, `Warranty or recall costs can overwhelm operating improvements.`, `EV and software spending may continue without adequate returns.`],
    invalidation: `The thesis would fail if normalized automotive cash flow could not fund capital spending and shareholder returns, or if market share required structurally higher incentives.`,
    monitoring: [`North American EBIT margin`, `Pricing and incentives`, `Automotive free cash flow`, `Share count and EV losses`],
  },
  'sofia-lly': {
    thesis: `Eli Lilly's incretin franchise is a therapeutic platform rather than a single obesity product. Weight loss is the entry point into a broader set of cardiometabolic, sleep, liver, and cardiovascular indications that can expand eligible patients, reimbursement, and treatment duration. Manufacturing scale and pipeline depth can sustain leadership even as competition increases.`,
    variant: `The market debates peak obesity-drug share as if the category were fixed. The variant view is that better outcomes, oral formulations, combination therapies, and new indications can expand the total market faster than competition fragments it. Lilly's advantage comes from clinical evidence, commercial execution, and manufacturing know-how across multiple molecules.`,
    drivers: [`Manufacturing capacity and dose availability`, `New indications and outcomes evidence`, `Next-generation injectable and oral candidates`, `Payer coverage and patient persistence`],
    catalysts: [`Major outcomes trials support broader reimbursement.`, `Capacity additions translate into prescription growth.`, `Pipeline candidates show differentiated efficacy, tolerability, or convenience.`],
    valuation: `The base case models patients, net price, persistence, and capacity explicitly rather than applying a single market-share estimate. Probability-adjusted pipeline value is added conservatively. The premium requires a long growth duration, so small changes in persistence and competitive share have a meaningful valuation impact.`,
    risks: [`Safety or tolerability findings could limit long-term use.`, `Competitors may narrow efficacy and supply advantages.`, `Payers can use formulary access to pressure net pricing.`],
    invalidation: `The thesis is invalidated if Lilly loses clear clinical differentiation, manufacturing remains structurally constrained despite investment, or payer access prevents volume growth from producing durable cash flow.`,
    monitoring: [`Prescription growth and supply`, `Net pricing and coverage`, `Outcomes and label expansions`, `Pipeline efficacy and tolerability`],
  },
  'sofia-nvo': {
    thesis: `Novo Nordisk's valuation reset discounts an overly narrow outcome in which competition permanently erodes the obesity franchise. The long case is that the category remains supply constrained and underpenetrated, while Novo retains valuable manufacturing experience, physician relationships, outcomes evidence, and a pipeline spanning injectable, oral, and next-generation mechanisms.`,
    variant: `The market extrapolates short-term share pressure and trial comparisons into a structurally weaker franchise. The variant view is that obesity treatment will segment by efficacy, tolerability, route of administration, comorbidity, access, and patient preference. A broader market can support multiple large franchises, and improved supply can reveal demand that current prescription data cannot capture.`,
    drivers: [`Supply expansion and fill-finish capacity`, `Wegovy access and persistence`, `Oral and next-generation pipeline progress`, `International category development`],
    catalysts: [`Supply constraints ease and prescription growth reaccelerates.`, `Pipeline data demonstrates a differentiated efficacy or convenience profile.`, `Payer access broadens following outcomes evidence and competition.`],
    valuation: `The base case applies a lower growth duration and share assumption than the prior peak valuation while retaining value for category expansion and the pipeline. Downside assumes continued share loss and pricing pressure; upside requires supply recovery and differentiated pipeline readouts rather than a return to monopoly conditions.`,
    risks: [`Competitors can gain share with stronger efficacy or supply.`, `Pipeline disappointments may leave the franchise reliant on current products.`, `Pricing and reimbursement pressure could offset category growth.`],
    invalidation: `The thesis is invalidated if supply recovery fails to stabilize volume, the next-generation pipeline lacks differentiation, and franchise cash flow declines despite continued category expansion.`,
    monitoring: [`Prescription share and dose availability`, `Gross margin and net pricing`, `Oral and combination-therapy data`, `Capital spending and capacity milestones`],
  },
  'sofia-isrg': {
    thesis: `Intuitive Surgical's installed base, surgeon training, and recurring instruments create a reinforcing ecosystem. The original thesis was that procedure growth—not one-time system placements—would drive durable value. More systems increase trained surgeons and access; greater utilization increases recurring revenue and improves the economic case for hospitals to expand their fleets.`,
    variant: `The market periodically focuses on capital-budget cycles and emerging robotic competitors. The variant view was that workflow integration, training, service, and procedure-specific evidence make adoption path dependent. Competitors could expand the category without quickly displacing the installed base.`,
    drivers: [`Procedure growth per installed system`, `New system placements and upgrades`, `Recurring instrument and accessory revenue`, `International adoption and new procedure categories`],
    catalysts: [`New platform adoption accelerates replacement and expansion demand.`, `Procedure growth remains above hospital capital-spending growth.`, `International reimbursement and training expand utilization.`],
    valuation: `The position was valued on long-duration procedure and recurring-revenue growth, with conservative assumptions for system pricing and competition. It was closed after strong procedure execution and platform enthusiasm reduced the original margin of safety.`,
    risks: [`Hospital capital constraints can delay system placements.`, `Competing platforms may pressure pricing or procedure share.`, `Safety events or adverse clinical evidence could slow adoption.`],
    invalidation: `The thesis would fail if procedure growth decoupled from the installed base, recurring revenue per system declined, or competitors displaced Intuitive in high-value procedures.`,
    monitoring: [`Worldwide procedure growth`, `Installed base and utilization`, `Instrument revenue per procedure`, `New-system placements and gross margin`],
  },
}

function thesis({
  ownerKey,
  seedKey,
  title,
  ticker,
  resolvedSymbol = ticker,
  company,
  side,
  sector,
  createdAt,
  entry,
  current,
  ret,
  status = 'active',
  currency = 'USD',
  exchange = 'NasdaqGS',
  triggers = [],
  updates = [],
  body,
  model = null,
  closedAt = null,
}) {
  const end = closedAt ? new Date(closedAt) : new Date()
  const start = new Date(createdAt)
  const daysActive = Math.max(0, Math.round((end - start) / 86400000))
  const detailedBody = detailedThesisCases[seedKey]
    ? investmentThesisBody(detailedThesisCases[seedKey])
    : body
  const data = {
    seedMarker: SEED_MARKER,
    seedKey,
    title,
    ticker,
    resolvedSymbol,
    company,
    side,
    sector,
    publishDate: formatPublishDate(createdAt),
    entryDate: createdAt.slice(0, 10),
    daysActive,
    entry,
    current,
    ret,
    status,
    updates: updates.length,
    updateLog: updates,
    triggers,
    currency,
    exchange,
    body: detailedBody,
    model: model || scenarioModel({ ticker, company, side, sector, entry, current }),
    createdAt,
  }

  if (status === 'closed') {
    data.closedAt = closedAt
    data.closePrice = current
    data.closeReturn = ret
  }

  return { ownerKey, seedKey, status, createdAt, data }
}

const currentUserTheses = [
  thesis({
    ownerKey: 'owner',
    seedKey: 'owner-amzn-aws-retail-efficiency',
    title: 'Amazon: AWS and Retail Efficiency Support Durable Earnings Growth',
    ticker: 'AMZN',
    company: 'Amazon.com, Inc.',
    side: 'bull',
    sector: 'Consumer',
    createdAt: '2026-07-18T16:44:55.767Z',
    entry: 249.99,
    current: 244.85,
    ret: -2.1,
    triggers: [
      trigger({
        condition: 'Total Revenue < $650B - annual',
        status: 'clear',
        metric: 'Total Revenue',
        op: '<',
        value: 650,
      }),
      trigger({
        condition: 'Operating Income < $70B - annual',
        status: 'clear',
        metric: 'Operating Income',
        op: '<',
        value: 70,
      }),
      trigger({
        condition: 'Free Cash Flow < $35B - annual',
        status: 'clear',
        metric: 'Free Cash Flow',
        statement: 'cashflow',
        op: '<',
        value: 35,
      }),
    ],
    updates: [],
    body: `<h1>Investment thesis</h1>
      <p>Amazon is evolving from a revenue-growth story into a structurally higher-margin compounder. The market recognizes AWS and advertising as strong businesses, but still underestimates how those profit pools combine with a more efficient retail network to expand consolidated free cash flow.</p>
      <h2>Variant perception</h2>
      <p>Consensus treats recent retail margin gains as largely cyclical and assumes AI infrastructure spending will dilute AWS economics. The base case is that regionalized fulfilment, higher delivery density, and a richer mix of services make a meaningful portion of the margin improvement durable, while generative-AI demand increases the long-run value of AWS.</p>
      <h2>Key earnings drivers</h2>
      <ul>
        <li><strong>AWS:</strong> AI workloads, custom silicon, and database modernization sustain above-company growth with attractive incremental margins.</li>
        <li><strong>North American retail:</strong> Regional fulfilment lowers miles per package and improves inventory placement, supporting faster delivery at a lower unit cost.</li>
        <li><strong>Advertising:</strong> Sponsored products and streaming inventory grow faster than gross merchandise value and carry high incremental margins.</li>
        <li><strong>Capital intensity:</strong> Data-center investment remains elevated, but stronger operating profit and disciplined logistics spending support rising free cash flow.</li>
      </ul>
      <h2>Catalysts</h2>
      <ol>
        <li>AWS growth remains above 20% as new AI capacity comes online.</li>
        <li>North American operating margin holds above its pre-regionalization range.</li>
        <li>Free-cash-flow conversion improves after the current infrastructure investment cycle.</li>
      </ol>
      <h2>Risks and invalidation</h2>
      <p>The thesis would weaken if AWS loses material cloud share, AI capital expenditure fails to produce revenue growth, or retail service levels require a sustained return to higher fulfilment costs. Regulatory remedies that constrain marketplace economics or bundling are additional downside risks.</p>
      <blockquote>The core underwriting question is whether Amazon can compound operating income faster than revenue without sacrificing its customer-value proposition.</blockquote>`,
    model: amazonModel(),
  }),
  thesis({
    ownerKey: 'owner',
    seedKey: 'owner-nvda-ai-infrastructure',
    title: 'NVIDIA: AI Infrastructure Demand Is Still Underestimated',
    ticker: 'NVDA',
    company: 'NVIDIA Corporation',
    side: 'bull',
    sector: 'Semiconductors',
    createdAt: '2026-01-16T14:32:00.000Z',
    entry: 186.23,
    current: 212.06,
    ret: 13.9,
    triggers: [
      trigger({
        condition: 'Total Revenue < $100B - annual',
        status: 'clear',
        metric: 'Total Revenue',
        op: '<',
        value: 100,
      }),
      trigger({
        condition: 'Gross Profit < $70B - annual',
        status: 'clear',
        metric: 'Gross Profit',
        op: '<',
        value: 70,
      }),
    ],
    updates: [
      {
        id: 1,
        text: 'Blackwell demand remains supply-constrained, and lead times still support the multi-quarter visibility in the original thesis.',
        at: '2026-03-21T09:15:00.000Z',
      },
      {
        id: 2,
        text: 'Raised the base-case data-center growth assumption after hyperscaler capital-expenditure guidance moved higher.',
        at: '2026-05-29T11:40:00.000Z',
      },
    ],
    body: `<h1>Investment summary</h1>
      <p>The market continues to frame NVIDIA as a cyclical semiconductor winner. The more durable interpretation is that accelerated computing has become a new infrastructure layer, with CUDA, networking, and systems integration reinforcing one another.</p>
      <h2>Why expectations can still move higher</h2>
      <ul>
        <li>Hyperscaler capital expenditure remains constrained by compute availability rather than demand.</li>
        <li>Networking and full-rack systems increase content per deployment.</li>
        <li>Software and ecosystem lock-in protect pricing power through architecture transitions.</li>
      </ul>
      <blockquote>The key debate is no longer whether AI spending persists, but how much of the value pool remains concentrated in the platform layer.</blockquote>
      <h2>Risk</h2>
      <p>A faster normalization in training demand or credible custom-silicon substitution would compress both growth and the terminal multiple.</p>`,
    model: demoModel(),
  }),
  thesis({
    ownerKey: 'owner',
    seedKey: 'owner-asml-euv-moat',
    title: 'ASML: EUV Service Revenue Extends the Moat',
    ticker: 'ASML',
    resolvedSymbol: 'ASML.AS',
    company: 'ASML Holding N.V.',
    side: 'bull',
    sector: 'Semiconductors',
    createdAt: '2026-03-11T08:20:00.000Z',
    entry: 1198.8,
    current: 1567.6,
    ret: 30.8,
    currency: 'EUR',
    exchange: 'Amsterdam',
    triggers: [
      trigger({
        condition: 'Total Revenue < EUR 28B - annual',
        status: 'warning',
        metric: 'Total Revenue',
        currency: 'EUR',
        op: '<',
        value: 28,
      }),
    ],
    updates: [
      {
        id: 1,
        text: 'Installed-base management sales are tracking ahead of the conservative service assumptions used at publication.',
        at: '2026-06-06T07:45:00.000Z',
      },
    ],
    body: `<h1>Thesis</h1>
      <p>ASML's earnings power is increasingly supported by the installed base, not only by new system shipments. That makes the business less dependent on the precise timing of leading-edge fab openings.</p>
      <h2>Catalysts</h2>
      <ol><li>High-NA qualification milestones.</li><li>Service intensity rising with fleet complexity.</li><li>Memory utilization recovering from cyclical lows.</li></ol>
      <h2>What would change my mind</h2>
      <p>Persistent customer push-outs combined with declining service revenue per installed system would weaken the compounding case.</p>`,
  }),
  thesis({
    ownerKey: 'owner',
    seedKey: 'owner-tsla-robotaxi',
    title: 'Tesla: Robotaxi Valuation Outruns Fundamentals',
    ticker: 'TSLA',
    company: 'Tesla, Inc.',
    side: 'bear',
    sector: 'Consumer',
    createdAt: '2026-04-28T15:05:00.000Z',
    entry: 376.02,
    current: 374.01,
    ret: 0.5,
    triggers: [
      trigger({
        condition: 'Free Cash Flow < $5B - annual',
        status: 'breached',
        metric: 'Free Cash Flow',
        statement: 'cashflow',
        op: '<',
        value: 5,
      }),
    ],
    updates: [],
    body: `<h1>Variant view</h1>
      <p>The valuation discounts a rapid transition from automotive manufacturing to a high-margin autonomous network before the operating evidence is visible.</p>
      <h2>Pressure points</h2>
      <ul><li>Automotive gross-margin recovery remains dependent on mix and credits.</li><li>Price competition limits the benefit from lower battery costs.</li><li>Robotaxi economics require both regulatory approval and high utilization.</li></ul>
      <p>The short thesis is invalidated by sustained margin expansion alongside independently verified commercial autonomy.</p>`,
  }),
  thesis({
    ownerKey: 'owner',
    seedKey: 'owner-lly-capacity',
    title: 'Eli Lilly: GLP-1 Capacity Unlocks Another Leg',
    ticker: 'LLY',
    company: 'Eli Lilly and Company',
    side: 'bull',
    sector: 'Healthcare',
    createdAt: '2025-09-05T13:10:00.000Z',
    entry: 727.21,
    current: 1018.87,
    ret: 40.1,
    status: 'closed',
    closedAt: '2026-05-20T16:00:00.000Z',
    triggers: [
      trigger({
        condition: 'Total Revenue < $45B - annual',
        status: 'clear',
        metric: 'Total Revenue',
        op: '<',
        value: 45,
      }),
    ],
    updates: [
      {
        id: 1,
        text: 'Supply additions converted previously constrained demand into reported revenue faster than expected.',
        at: '2026-02-07T10:20:00.000Z',
      },
      {
        id: 2,
        text: 'Closed after the capacity thesis was substantially reflected in consensus estimates and valuation.',
        at: '2026-05-20T16:00:00.000Z',
      },
    ],
    body: `<h1>Original thesis</h1><p>Demand was visible, but manufacturing capacity obscured the earnings trajectory. The opportunity was the conversion of a known order book into reported volume as new lines qualified.</p><h2>Outcome</h2><p>The thesis played out as capacity expanded and estimates moved higher. The position was closed after the risk/reward normalized.</p>`,
  }),
  thesis({
    ownerKey: 'owner',
    seedKey: 'owner-jpm-scale',
    title: 'JPMorgan: Scale Advantages Widen Through the Cycle',
    ticker: 'JPM',
    company: 'JPMorgan Chase & Co.',
    side: 'bull',
    sector: 'Financials',
    createdAt: '2025-11-18T14:00:00.000Z',
    entry: 299.41,
    current: 308.28,
    ret: 3.0,
    status: 'closed',
    closedAt: '2026-04-24T16:00:00.000Z',
    triggers: [
      trigger({
        condition: 'Net Income < $45B - annual',
        status: 'warning',
        metric: 'Net Income',
        op: '<',
        value: 45,
      }),
    ],
    updates: [],
    body: `<h1>Thesis</h1><p>Technology spend, deposit depth, and balance-sheet flexibility allow JPMorgan to take share while smaller peers defend capital and liquidity.</p><p>The position was closed after the valuation premium reached the upper end of its post-crisis range.</p>`,
  }),
]

const communityTheses = [
  thesis({
    ownerKey: 'marcus',
    seedKey: 'marcus-avgo',
    title: 'Broadcom: Custom Accelerators Expand the AI Wallet',
    ticker: 'AVGO',
    company: 'Broadcom Inc.',
    side: 'bull',
    sector: 'Semiconductors',
    createdAt: '2025-12-04T11:00:00.000Z',
    entry: 381.03,
    current: 396.81,
    ret: 4.1,
    triggers: [],
    updates: [],
    body: '<h1>Thesis</h1><p>Custom accelerators and networking create two independent ways to win as hyperscalers diversify their AI infrastructure.</p>',
  }),
  thesis({
    ownerKey: 'marcus',
    seedKey: 'marcus-tsm',
    title: 'TSMC: Advanced Packaging Is the Hidden Bottleneck',
    ticker: 'TSM',
    company: 'Taiwan Semiconductor Manufacturing Company Limited',
    side: 'bull',
    sector: 'Semiconductors',
    createdAt: '2025-08-14T11:00:00.000Z',
    entry: 241,
    current: 339.57,
    ret: 40.9,
    status: 'closed',
    closedAt: '2026-03-18T16:00:00.000Z',
    triggers: [],
    updates: [],
    body: '<h1>Thesis</h1><p>CoWoS capacity and leading-edge yields support pricing power beyond the headline wafer market-share story.</p>',
  }),
  thesis({
    ownerKey: 'marcus',
    seedKey: 'marcus-mu',
    title: 'Micron: HBM Mix Resets Mid-Cycle Earnings',
    ticker: 'MU',
    company: 'Micron Technology, Inc.',
    side: 'bull',
    sector: 'Semiconductors',
    createdAt: '2026-02-19T11:00:00.000Z',
    entry: 417.35,
    current: 959.48,
    ret: 129.9,
    triggers: [],
    updates: [],
    body: '<h1>Thesis</h1><p>High-bandwidth memory changes the mix, contract structure, and capital intensity of the memory upcycle.</p>',
  }),
  thesis({
    ownerKey: 'priya',
    seedKey: 'priya-mrna',
    title: 'Moderna: Pipeline Value Cannot Offset the Cash Burn',
    ticker: 'MRNA',
    company: 'Moderna, Inc.',
    side: 'bear',
    sector: 'Healthcare',
    createdAt: '2025-10-09T11:00:00.000Z',
    entry: 27.53,
    current: 50.96,
    ret: -85.1,
    status: 'closed',
    closedAt: '2026-04-10T16:00:00.000Z',
    triggers: [],
    updates: [],
    body: '<h1>Thesis</h1><p>Commercial respiratory products are unlikely to fund the oncology pipeline before the balance sheet absorbs another investment cycle.</p>',
  }),
  thesis({
    ownerKey: 'priya',
    seedKey: 'priya-pfe',
    title: 'Pfizer: The Patent Cliff Is Still Underestimated',
    ticker: 'PFE',
    company: 'Pfizer Inc.',
    side: 'bear',
    sector: 'Healthcare',
    createdAt: '2026-01-08T11:00:00.000Z',
    entry: 25.29,
    current: 24.82,
    ret: 1.9,
    triggers: [],
    updates: [],
    body: '<h1>Thesis</h1><p>Cost reductions help reported earnings, but they do not replace the revenue base exposed to loss of exclusivity.</p>',
  }),
  thesis({
    ownerKey: 'priya',
    seedKey: 'priya-unh',
    title: 'UnitedHealth: Normalized Utilization Supports a Recovery',
    ticker: 'UNH',
    company: 'UnitedHealth Group Incorporated',
    side: 'bull',
    sector: 'Healthcare',
    createdAt: '2026-03-03T11:00:00.000Z',
    entry: 289.21,
    current: 431.31,
    ret: 49.1,
    triggers: [],
    updates: [],
    body: '<h1>Thesis</h1><p>The market is capitalizing peak medical-cost pressure while underweighting Optum earnings resilience.</p>',
  }),
  thesis({
    ownerKey: 'james',
    seedKey: 'james-tsla',
    title: 'Tesla: Margin Reality Beats the Autonomy Narrative',
    ticker: 'TSLA',
    company: 'Tesla, Inc.',
    side: 'bear',
    sector: 'Consumer',
    createdAt: '2025-11-21T11:00:00.000Z',
    entry: 391.09,
    current: 391.95,
    ret: -0.2,
    status: 'closed',
    closedAt: '2026-04-15T16:00:00.000Z',
    triggers: [],
    updates: [],
    body: '<h1>Thesis</h1><p>Automotive pricing and factory utilization matter to near-term value more than distant robotaxi optionality.</p>',
  }),
  thesis({
    ownerKey: 'james',
    seedKey: 'james-rivn',
    title: 'Rivian: Liquidity Improves Before Unit Economics',
    ticker: 'RIVN',
    company: 'Rivian Automotive, Inc.',
    side: 'bear',
    sector: 'Consumer',
    createdAt: '2026-02-05T11:00:00.000Z',
    entry: 13.73,
    current: 17.18,
    ret: -25.1,
    triggers: [],
    updates: [],
    body: '<h1>Thesis</h1><p>Strategic funding extends the runway but does not remove the execution risk embedded in the next vehicle platform.</p>',
  }),
  thesis({
    ownerKey: 'james',
    seedKey: 'james-gm',
    title: 'GM: Capital Returns Provide the Margin of Safety',
    ticker: 'GM',
    company: 'General Motors Company',
    side: 'bull',
    sector: 'Consumer',
    createdAt: '2025-07-24T11:00:00.000Z',
    entry: 52.34,
    current: 86.26,
    ret: 64.8,
    status: 'closed',
    closedAt: '2026-01-29T16:00:00.000Z',
    triggers: [],
    updates: [],
    body: '<h1>Thesis</h1><p>Buybacks and resilient truck economics create an attractive return even without assigning much value to autonomy.</p>',
  }),
  thesis({
    ownerKey: 'sofia',
    seedKey: 'sofia-lly',
    title: 'Eli Lilly: Obesity Is a Platform, Not a Single Product',
    ticker: 'LLY',
    company: 'Eli Lilly and Company',
    side: 'bull',
    sector: 'Healthcare',
    createdAt: '2025-09-17T11:00:00.000Z',
    entry: 760.13,
    current: 1163.01,
    ret: 53.0,
    triggers: [],
    updates: [],
    body: '<h1>Thesis</h1><p>Cardiovascular, sleep-apnea, and oral formulations expand the addressable market beyond the original diabetes opportunity.</p>',
  }),
  thesis({
    ownerKey: 'sofia',
    seedKey: 'sofia-nvo',
    title: 'Novo Nordisk: Expectations Reset Too Far',
    ticker: 'NVO',
    company: 'Novo Nordisk A/S',
    side: 'bull',
    sector: 'Healthcare',
    createdAt: '2026-01-30T11:00:00.000Z',
    entry: 59.43,
    current: 48.19,
    ret: -18.9,
    triggers: [],
    updates: [],
    body: '<h1>Thesis</h1><p>Competitive fears discount the breadth of the incretin franchise and the value of manufacturing know-how.</p>',
  }),
  thesis({
    ownerKey: 'sofia',
    seedKey: 'sofia-isrg',
    title: 'Intuitive Surgical: Procedure Growth Sustains the Flywheel',
    ticker: 'ISRG',
    company: 'Intuitive Surgical, Inc.',
    side: 'bull',
    sector: 'Healthcare',
    createdAt: '2025-06-12T11:00:00.000Z',
    entry: 513,
    current: 572.47,
    ret: 11.6,
    status: 'closed',
    closedAt: '2025-12-19T16:00:00.000Z',
    triggers: [],
    updates: [],
    body: '<h1>Thesis</h1><p>Installed-base growth, procedure density, and recurring instruments reinforce the robotic-surgery ecosystem.</p>',
  }),
]

const ownerIds = {
  owner: owner.id,
  ...Object.fromEntries(Object.entries(demoUsers).map(([key, user]) => [key, user.id])),
}
const desired = [...currentUserTheses, ...communityTheses]

const existingRows = ensureResult(
  await supabase.from('theses').select('id, user_id, data'),
  'Could not read existing theses',
) || []
const existingSeeds = new Map(
  existingRows
    .filter((row) => row.data?.seedMarker === SEED_MARKER)
    .map((row) => [row.data.seedKey, row]),
)
const amazonSeedKey = 'owner-amzn-aws-retail-efficiency'
const amazonPlaceholder = existingRows.find((row) => {
  const bodyText = String(row.data?.body || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim()
    .toLowerCase()
  return (
    row.user_id === owner.id &&
    !row.data?.seedMarker &&
    row.data?.ticker === 'AMZN' &&
    String(row.data?.title || '').trim().toLowerCase() === 'amazon' &&
    bodyText === 'test.'
  )
})
if (!existingSeeds.has(amazonSeedKey) && amazonPlaceholder) {
  existingSeeds.set(amazonSeedKey, amazonPlaceholder)
}

let inserted = 0
let updated = 0
for (const item of desired) {
  const userId = ownerIds[item.ownerKey]
  const existing = existingSeeds.get(item.seedKey)
  const payload = {
    user_id: userId,
    data: item.data,
    status: item.status,
    created_at: item.createdAt,
  }

  if (existing) {
    ensureResult(
      await supabase.from('theses').update(payload).eq('id', existing.id),
      `Could not update seed thesis ${item.seedKey}`,
    )
    updated += 1
  } else {
    ensureResult(
      await supabase.from('theses').insert(payload),
      `Could not insert seed thesis ${item.seedKey}`,
    )
    inserted += 1
  }
}

console.log(`Screenshot data ready for ${ownerName}.`)
console.log(`Seeded ${demoPeople.length} demo analysts and ${desired.length} theses (${inserted} inserted, ${updated} updated).`)
if (amazonPlaceholder) {
  console.log('Replaced the owner account’s exact AMZN “Amazon / Test.” placeholder in place.')
}
console.log('Other existing non-seed users and theses were left unchanged.')
console.log('To remove only screenshot data, run: npm run seed:screenshots -- --clean')
