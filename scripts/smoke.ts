/**
 * Drive the UI in a real browser against an in-memory relay.
 *
 * Not a substitute for `verify.ts`, which is the thing that has to pass against
 * a live Buzz relay. This answers the different question: **does the app work
 * when a person clicks it** — routes resolve, views render, mutations publish
 * something the reader can fold back, and nothing throws.
 *
 * The stub relay is deliberately faithful about the two behaviours that break
 * clients (FRICTION.md): `/query` takes a bare array of filters, and addressable
 * kinds replace by `(kind, pubkey, d)`. It is *not* faithful about auth,
 * membership or signatures — none of which the UI's correctness depends on.
 *
 *   npx tsx scripts/smoke.ts [--headed]
 */
import { createServer } from 'node:http'
import { readFileSync, mkdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { chromium, type ConsoleMessage, type Page } from 'playwright-core'
import { addrToNaddr } from '../lib/nostr/nip19'

const ROOT = new URL('..', import.meta.url).pathname
const DIST = join(ROOT, 'dist')
const SHOTS = join(ROOT, '.smoke')
const PORT = 5191
const HEADED = process.argv.includes('--headed')

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
}

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures++
}

// ── The stub relay ──────────────────────────────────────────────────────────

interface Event {
  id: string
  pubkey: string
  kind: number
  created_at: number
  tags: string[][]
  content: string
}

const stored: Event[] = []
const tagValue = (event: Event, name: string) => event.tags.find((t) => t[0] === name)?.[1]

/** Addressable kinds replace in place; everything else appends. */
function ingest(event: Event) {
  const addressable = event.kind >= 30000 && event.kind < 40000
  if (addressable) {
    const d = tagValue(event, 'd')
    const at = stored.findIndex(
      (held) => held.kind === event.kind && held.pubkey === event.pubkey && tagValue(held, 'd') === d,
    )
    if (at >= 0) {
      stored[at] = event
      return
    }
  }
  stored.push(event)
}

function matches(event: Event, filter: Record<string, unknown>): boolean {
  const kinds = filter.kinds as number[] | undefined
  if (kinds && !kinds.includes(event.kind)) return false
  const authors = filter.authors as string[] | undefined
  if (authors && !authors.includes(event.pubkey)) return false
  for (const [key, want] of Object.entries(filter)) {
    if (!key.startsWith('#')) continue
    const name = key.slice(1)
    const values = event.tags.filter((t) => t[0] === name).map((t) => t[1])
    // `h` is modelled the way Buzz actually behaves, not the way NIP-01 reads.
    // Measured against the live relay: `{'#h': [A, B]}` matches only A, with no
    // error — a short read that folds into a project whose issues have silently
    // vanished. The stub reproduces it so a client that goes back to passing an
    // array fails here rather than in front of somebody.
    const candidates = name === 'h' ? (want as string[]).slice(0, 1) : (want as string[])
    if (!candidates.some((value) => values.includes(value))) return false
  }
  return true
}

// ── Driving ─────────────────────────────────────────────────────────────────

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true })
}

async function main() {
  mkdirSync(SHOTS, { recursive: true })

  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]
    const file = path.endsWith('/') ? `${path}index.html` : path
    try {
      const body = readFileSync(join(DIST, file))
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404).end('not found')
    }
  })
  await new Promise<void>((resolve) => server.listen(PORT, resolve))

  const browser = await chromium.launch({ headless: !HEADED })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

  const errors: string[] = []
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))

  // Everything the app sends to the relay is answered here instead.
  await page.route('http://localhost:3000/**', async (route) => {
    const request = route.request()
    const body = request.postDataJSON()
    if (request.url().endsWith('/events')) {
      ingest(body as Event)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accepted: true, event_id: (body as Event).id, message: '' }),
      })
    }
    const filters = body as Record<string, unknown>[]
    const hits = stored.filter((event) => filters.some((filter) => matches(event, filter)))
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(hits),
    })
  })

  await page.goto(`http://localhost:${PORT}/linear-lite/`)

  // ── Lands straight on the issue list; there is no workspace to choose ─────
  await page.waitForSelector('[data-surface="issues"]')
  check('the app opens on Issues with no setup step', page.url().includes('/issues'))
  await shot(page, '01-issues-empty')

  // ── Projects ──────────────────────────────────────────────────────────────
  await page.getByRole('link', { name: /^Projects/ }).click()
  await page.waitForSelector('[data-surface="projects"]')
  await page.getByRole('button', { name: 'Add project' }).click()
  // Scoped to the dialog. A bare `input[name="title"]` also matches forms on
  // the surface behind it, and a click returns before the async re-render, so
  // an unscoped selector can fill a control that is about to be replaced.
  await page.waitForSelector('dialog.modal form.new-project')
  check('the project form opens in a modal', await page.locator('dialog.modal').isVisible())
  await page.locator('dialog.modal input[name="title"]').fill('Payment integration')
  await page
    .locator('dialog.modal textarea[name="description"]')
    .fill('Stripe Checkout for workspace billing.')
  await page.getByRole('button', { name: 'Create project' }).click()
  await page.waitForSelector('.card h3')
  check('the modal closes once the project is created', (await page.locator('dialog.modal').count()) === 0)

  const project = stored.find((e) => e.kind === 30850)
  check('a kind:9007 was published for the project Folder', stored.some((e) => e.kind === 9007))
  check(
    'exactly one Folder was created, for the project',
    stored.filter((e) => e.kind === 9007).length === 1,
  )
  check(
    'the project record lives in that Folder',
    // kind:9007 names the channel it creates with `h`, not `d`.
    !!project && tagValue(project!, 'h') === tagValue(stored.find((e) => e.kind === 9007)!, 'h'),
    `h=${tagValue(project!, 'h')?.slice(0, 8)}`,
  )
  await shot(page, '02-projects')

  // ── Project detail, and an issue inside it ────────────────────────────────
  await page.locator('.card').first().click()
  await page.waitForSelector('[data-surface="project"][data-view="table"]')
  check('the project opens on one page, issues in table view', page.url().includes('/project/'))
  check(
    '  …with the description and comments on the same page',
    (await page.locator('[data-surface="project"] .thread').count()) === 1,
  )

  await page.getByRole('button', { name: 'Add issue' }).click()
  await page.waitForSelector('dialog.modal form.new-issue')
  await page.locator('dialog.modal input[name="title"]').fill('Billing entry + add payment method')
  await page.getByRole('button', { name: 'Create issue' }).click()
  await page.waitForSelector('table tbody tr')

  const issue = stored.find((e) => e.kind === 30851)
  check(
    'the issue landed in the same Folder as the project',
    !!issue && tagValue(issue!, 'h') === tagValue(project!, 'h'),
  )
  check('the issue names its parent project', !!issue && !!tagValue(issue!, 'a'))
  await shot(page, '03-project-overview')

  // ── Table and board ───────────────────────────────────────────────────────
  check('the table renders a row per issue', (await page.locator('table tbody tr').count()) === 1)
  await shot(page, '04-project-table')

  await page.getByRole('link', { name: 'Board' }).click()
  await page.waitForSelector('[data-view="board"] .board .column')
  check('the toggle swaps the list in place, same page', (await page.locator('[data-surface="project"] .thread').count()) === 1)
  check('the board renders a column per status', (await page.locator('.board .column').count()) === 4)
  check('the issue starts in the first column', (await page.locator('.column').first().locator('.kanban-card').count()) === 1)
  await shot(page, '05-project-board')

  // ── Issue detail, and a status change ─────────────────────────────────────
  await page.locator('.kanban-card .issue-title').first().click()
  await page.waitForSelector('[data-surface="issue"]')
  check('the issue detail opens', page.url().includes('/issue/'))

  await page.locator('.detail-side select').first().selectOption('in_progress')
  await page.waitForFunction(() => document.querySelectorAll('.feed-item').length > 0)
  const change = stored.find((e) => e.kind === 1851)
  check('a kind:1851 change was published, not an edit', !!change)
  check(
    'the change carries the issue\'s Folder',
    !!change && tagValue(change!, 'h') === tagValue(issue!, 'h'),
  )
  check(
    'the change is authored by the actor',
    !!change && !!issue && change!.pubkey === issue!.pubkey,
  )

  // ── Comment, assignee ─────────────────────────────────────────────────────
  await page.locator('.comment-form input').fill('Blocked on the Stripe key.')
  await page.getByRole('button', { name: 'Comment' }).click()
  await page.waitForSelector('.comment-body')
  check('a NIP-22 kind:1111 comment was published', stored.some((e) => e.kind === 1111))

  const assignee = page.locator('.detail-side select').nth(1)
  await assignee.selectOption({ index: 1 })
  await page.waitForFunction(() => document.querySelectorAll('.feed-item').length > 1)
  check(
    'assigning publishes a second change',
    stored.filter((e) => e.kind === 1851 && tagValue(e, 'field') === 'assignee').length === 1,
  )
  await shot(page, '06-issue-detail')

  // ── The inbound leg: a reference pasted from Peek ─────────────────────────
  // Encoded with the app's own encoder, so this cannot pass against a shape
  // Linear-lite would never itself produce.
  const addr = `30851:${issue!.pubkey}:${tagValue(issue!, 'd')}`
  const naddr = addrToNaddr(addr, ['http://localhost:3000'])
  await page.goto(`http://localhost:${PORT}/linear-lite/#/o/${naddr}`)
  await page.waitForSelector('[data-surface="issue"]', { timeout: 10000 })
  check('an inbound naddr resolves to the issue surface', page.url().includes('/issue/'))
  check(
    '  …and it resolved the Folder itself, with no #h filter',
    (await page.locator('.title-input, .editable').first().textContent())?.includes('Billing entry') ??
      false,
  )
  await shot(page, '07-inbound-deep-link')

  // ── Back to the issue list ────────────────────────────────────────────────
  await page.getByRole('link', { name: /^Issues/ }).first().click()
  await page.waitForSelector('[data-surface="issues"] .row .issue-title')
  check('the issue appears in the workspace-wide list', (await page.locator('.row').count()) >= 1)
  check(
    'it is grouped under its new status',
    (await page.locator('.group-head').first().textContent())?.includes('In Progress') ?? false,
  )
  await shot(page, '08-issues-list')

  // ── Archive, and getting it back ──────────────────────────────────────────
  await page.goto(`http://localhost:${PORT}/linear-lite/#/project/${encodeURIComponent(
    `30850:${project!.pubkey}:${tagValue(project!, 'd')}`,
  )}`)
  await page.waitForSelector('[data-surface="project"]')
  await page.getByRole('button', { name: 'Archive project' }).click()
  await page.waitForSelector('.crumbs .pill')
  check(
    'archiving publishes a change, not a deletion',
    stored.some((e) => e.kind === 1851 && tagValue(e, 'field') === 'archived'),
  )
  check('  …and is reversible from the same control',
    await page.getByRole('button', { name: 'Unarchive project' }).isVisible())

  // Scoped to the sidebar: the project detail's breadcrumb also says "Projects".
  await page.locator('#sidebar').getByRole('link', { name: /^Projects/ }).click()
  await page.waitForSelector('[data-surface="projects"]')
  check('an archived project leaves the sidebar', (await page.locator('.nav-item').count()) === 2)
  check('  …and the active list', (await page.locator('.card').count()) === 0)
  check('  …but is reachable behind a tab', await page.getByRole('link', { name: /^Archived/ }).isVisible())
  await page.getByRole('link', { name: /^Archived/ }).click()
  await page.waitForSelector('.card')
  check('  …which shows it', (await page.locator('.card').count()) === 1)
  await shot(page, '10-archived')

  // ── The profile menu ──────────────────────────────────────────────────────
  await page.locator('.dropdown-trigger').click()
  await page.waitForSelector('.dropdown-panel')
  // Case-insensitive: `innerText` reflects rendered text, and the labels are
  // uppercased in CSS.
  const menu = (await page.locator('.dropdown-panel').innerText()).toLowerCase()
  check('the profile menu names the relay as the workspace', menu.includes('localhost:3000'))
  check('  …and the identity', menu.includes('signed in as'))
  await shot(page, '09-profile-menu')
  await page.keyboard.press('Escape')
  check('  …and closes on Escape', (await page.locator('.dropdown-panel').count()) === 0)

  check('no uncaught errors in the console', errors.length === 0, errors.slice(0, 3).join(' | '))

  await browser.close()
  server.close()

  console.log(
    failures === 0 ? `\nSmoke passed. Screenshots in .smoke/` : `\n${failures} check(s) FAILED.`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
