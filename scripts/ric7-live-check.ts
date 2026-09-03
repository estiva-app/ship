/**
 * RIC-7, verified where §13.6 can actually fail.
 *
 * The suites prove the resolver and the component. This proves the sequence
 * nothing else can: **anchor a comment to a block, then delete that block, and
 * check the comment says so.** That is the whole of §13.6 — a detached anchor
 * rendering as an ordinary unanchored comment is the defect, and it is only
 * observable by doing both halves in order.
 *
 *   npm --prefix web run build && npx tsx scripts/ric7-live-check.ts
 */
import { createServer } from 'node:http'
import { readFileSync, mkdirSync } from 'node:fs'
import { extname, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type ConsoleMessage } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const DIST = join(here, '..', 'dist', 'ship')
const SHOTS = join(here, '..', '.ric7')
const PORT = 5197

interface Event { id: string; kind: number; tags: string[][]; content: string; created_at: number; pubkey: string }

const fixture = JSON.parse(readFileSync(join(here, '..', 'conformance', 'fold-fixture.json'), 'utf8'))

/**
 * The recorded production events, without the fixture's adversarial ones.
 *
 * `fold-fixture.json` carries nine synthetic events whose folder is
 * `fixture-folder` — they exist to exercise ordering rules a healthy workspace
 * cannot demonstrate, and they are fed to `foldFolder` **offline**. Feeding
 * them to the *app* is a different thing: its read path validates a folder id
 * before querying, so it refuses them and renders "could not read from the
 * relay", correctly. Filtering by that is exact — nine events, nine
 * adversarial, and no overlap.
 */
const FOLDER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const recorded = (fixture.events as Event[]).filter((e) =>
  e.tags.every((t) => t[0] !== 'h' || FOLDER_UUID.test(t[1])),
)

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
}
const tag = (e: Event, k: string) => e.tags.find((t) => t[0] === k)?.[1]

/**
 * The stub's filter, ported from `smoke.ts`.
 *
 * **Returning every event for every filter is not a simplification, it is a
 * different relay.** The first version of this script did exactly that, and it
 * worked until the conformance fixture grew to 1082 events — at which point
 * `queryAll` correctly refused to page, because a full page of events sharing
 * one `created_at` has no cursor that can advance. The app was right and the
 * stub was wrong, and it read as the app failing to load.
 */
function matches(event: Event, filter: Record<string, unknown>): boolean {
  const kinds = filter.kinds as number[] | undefined
  if (kinds && !kinds.includes(event.kind)) return false
  const authors = filter.authors as string[] | undefined
  if (authors && !authors.includes(event.pubkey)) return false
  const until = filter.until as number | undefined
  if (until !== undefined && event.created_at > until) return false
  for (const [key, want] of Object.entries(filter)) {
    if (!key.startsWith('#')) continue
    const name = key.slice(1)
    const values = event.tags.filter((t) => t[0] === name).map((t) => t[1])
    // `h` as Buzz actually behaves — see smoke.ts for the measurement.
    const candidates = name === 'h' ? (want as string[]).slice(0, 1) : (want as string[])
    if (!candidates.some((value) => values.includes(value))) return false
  }
  return true
}

/** Newest first, then capped by the filter's own limit — as the relay does. */
function answer(stored: Event[], filters: Record<string, unknown>[]): Event[] {
  const hits = stored.filter((event) => filters.some((filter) => matches(event, filter)))
  hits.sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))
  const limit = Math.max(...filters.map((f) => (f.limit as number) ?? hits.length))
  return hits.slice(0, limit)
}

async function main() {
  mkdirSync(SHOTS, { recursive: true })
  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]
    const file = path === '/' ? '/index.html' : path
    try {
      const body = readFileSync(join(DIST, file))
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(readFileSync(join(DIST, 'index.html')))
    }
  })
  await new Promise<void>((resolve) => server.listen(PORT, resolve))

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  const errors: string[] = []
  page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))

  const published: Event[] = []
  const stored: Event[] = [...recorded]

  await page.route('http://localhost:3000/**', async (route) => {
    const request = route.request()
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/') {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { date: new Date().toUTCString() }, body: '{}' })
    }
    const body = request.postDataJSON() as unknown
    if (request.url().endsWith('/events') && body) {
      const event = body as Event
      published.push(event)
      stored.push(event)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accepted: true, event_id: event.id, message: '' }) })
    }
    if (Array.isArray(body)) {
      const hits = answer(stored, body as Record<string, unknown>[])
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hits) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  const issue = fixture.expected.issues[0]
  const open = async () => {
    await page.goto(`http://localhost:${PORT}/#/issue/${encodeURIComponent(issue.addr)}`)
    await page.waitForSelector('[data-surface="issue"]', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(900)
  }

  /** Replace the description, the way a person does. */
  const describe = async (text: string) => {
    await page.getByRole('button', { name: 'Edit description' }).click()
    const field = page.getByLabel('Description')
    await field.waitFor()
    await field.fill(text)
    await page.locator('[data-surface="issue"]').first().click({ position: { x: 5, y: 5 } })
    await page.waitForTimeout(1000)
  }

  // ── A description with parts to point at ────────────────────────────────
  await open()
  await describe('# Plan\n\nthe paragraph in question\n\nsomething else')
  await open()

  const blockIds = await page.locator('[data-surface="issue"] [data-block-id]').evaluateAll(
    (els) => els.map((e) => e.getAttribute('data-block-id')).filter(Boolean) as string[],
  )
  check('the description now has addressable blocks', blockIds.length >= 3, `${blockIds.length} block(s)`)

  // ── Anchor a comment to the second one ──────────────────────────────────
  const targetBlock = blockIds[1]
  await page.locator(`[data-block-id="${targetBlock}"]`).first().hover()
  await page.locator(`[data-comment-on="${targetBlock}"]`).click()
  check('choosing a block says what the comment will attach to',
    await page.getByText('Commenting on one part of the description.').isVisible())

  await page.getByLabel('Start a conversation…').fill('this paragraph is out of date')
  await page.getByRole('button', { name: 'Post', exact: true }).click()
  await page.waitForTimeout(1200)

  const comment = published.find((e) => e.kind === 1111 && e.content.includes('out of date'))
  check('the comment was published as a NIP-22 comment', !!comment)
  check('it carries the block tag — SPEC §13.6', comment ? tag(comment, 'block') === targetBlock : false,
    JSON.stringify(comment ? tag(comment, 'block') : undefined))

  // ── It renders anchored, quoting what it points at ──────────────────────
  await open()
  const resolved = page.locator('[data-anchor="resolved"]')
  check('it renders as anchored, quoting the block', await resolved.count() > 0)
  if (await resolved.count() > 0) {
    check('the quote is the block it points at',
      (await resolved.first().textContent() ?? '').includes('the paragraph in question'))
  }
  await page.screenshot({ path: join(SHOTS, 'anchored.png') })

  // ── Now delete that block. This is the part that matters. ───────────────
  await describe('# Plan\n\nsomething else')
  await open()

  const detached = page.locator('[data-anchor="detached"]')
  const stillResolved = page.locator('[data-anchor="resolved"]')
  check('deleting the block detaches the anchor', await detached.count() > 0)
  check('and it no longer claims to resolve', await stillResolved.count() === 0)
  if (await detached.count() > 0) {
    const said = (await detached.first().textContent()) ?? ''
    check('and it says so rather than saying nothing', said.includes('deleted'), JSON.stringify(said.slice(0, 60)))
  }
  const commentStillThere = await page.getByText('this paragraph is out of date').count()
  check('the comment itself is still there — a detached anchor is not a deletion', commentStillThere > 0)

  check('no uncaught errors in the console', errors.length === 0, errors.slice(0, 2).join(' | '))
  await page.screenshot({ path: join(SHOTS, 'detached.png') })

  await browser.close()
  server.close()
  console.log(failures === 0 ? '\nAn anchor survives, and breaks visibly.' : `\n${failures} failed.`)
  process.exit(failures === 0 ? 0 : 1)
}
main().catch((e) => { console.error(e); process.exit(1) })
