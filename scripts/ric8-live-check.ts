/**
 * RIC-8, verified where a person would do it.
 *
 * The suites prove the conversion. This proves the thing the ticket promises:
 * **editing a description in the browser publishes a block document**, tagged,
 * with ids, and the app reads its own writing back as structure.
 *
 * It drives the built app against the stub relay `smoke.ts` uses, seeded with
 * the 103 recorded production events, and captures what the app actually POSTs
 * rather than asking the code what it would have sent.
 *
 *   npm --prefix web run build && npx tsx scripts/ric8-live-check.ts
 */
import { createServer } from 'node:http'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { extname, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type ConsoleMessage } from 'playwright-core'
import { parseBlockDocument, validateBlockDocument } from '@estiva-app/protocol'

const here = dirname(fileURLToPath(import.meta.url))
const DIST = join(here, '..', 'dist', 'ship')
const SHOTS = join(here, '..', '.ric8')
const PORT = 5198

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
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors: string[] = []
  page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))

  /** Everything the app publishes, in order. */
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

  const surface = process.argv.includes('--issue') ? 'issue' : 'project'
  const target = surface === 'issue'
    ? fixture.expected.issues[0]
    : fixture.expected.projects.find((p: { description?: string }) => (p.description ?? '').length > 3000)
  console.log(`surface: ${surface} — ${target.title}`)
  await page.goto(`http://localhost:${PORT}/#/${surface === 'issue' ? 'issue' : 'project'}/${encodeURIComponent(target.addr)}`)
  await page.waitForSelector(`[data-surface="${surface}"]`, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(800)

  // ── Edit the description the way a person does ──────────────────────────
  const NEXT = '# Rewritten\n\nA **bold** claim and `code`.\n\n- one\n- two'
  await page.getByRole('button', { name: 'Edit description' }).click()
  const field = page.getByLabel('Description')
  await field.waitFor()
  await field.fill(NEXT)
  await page.keyboard.press('Escape').catch(() => {})
  // Escape cancels; commit by blurring instead, which is what a click away does.
  await page.getByRole('button', { name: 'Edit description' }).click()
  await field.fill(NEXT)
  await page.locator(`[data-surface="${surface}"]`).first().click({ position: { x: 5, y: 5 } })
  await page.waitForTimeout(1200)

  const change = published.find((e) => e.kind === 1851 && tag(e, 'field') === 'description')
  check('editing the description published a change', !!change, `${published.length} event(s) published`)
  if (!change) { await browser.close(); server.close(); process.exit(1) }

  check(
    'it declares the block document format',
    tag(change, 'content-format') === 'estiva-blocks-1',
    JSON.stringify(tag(change, 'content-format')),
  )

  const value = tag(change, 'value') ?? ''
  // Written out so another app can be shown the real thing rather than a
  // reconstruction of it — RIC-8's done-when asks for Peek, not for a fixture.
  writeFileSync(join(SHOTS, 'published-description.json'), value + '\n')
  let ok = false
  try {
    const doc = parseBlockDocument(value)
    ok = validateBlockDocument(doc).length === 0
    console.log(`   blocks: ${doc.content.map((b) => b.type).join(' ')}`)
    console.log(`   ids   : ${doc.content.map((b) => b.id).join(' ')}`)
    check('the value is a valid block document', ok)
    check('every block carries an id', doc.content.every((b) => b.id.length >= 8))
  } catch (e) {
    check('the value is a valid block document', false, String(e).slice(0, 90))
  }

  // ── The app reads its own writing back ──────────────────────────────────
  await page.reload()
  await page.waitForSelector(`[data-surface="${surface}"]`, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1000)
  const desc = page.getByLabel('Description').first()
  const drawn = await desc.evaluate((el) => ({
    headings: el.querySelectorAll('.text-h3, .text-h4').length,
    items: el.querySelectorAll('li').length,
    code: el.querySelectorAll('code').length,
    json: (el.textContent ?? '').includes('"type":"doc"'),
    text: (el.textContent ?? '').slice(0, 60),
  }))
  console.log(`   drawn back: headings=${drawn.headings} items=${drawn.items} code=${drawn.code}`)
  check('it renders its own block document as structure', drawn.headings > 0 && drawn.items === 2 && drawn.code > 0)
  check('no JSON is shown to a reader', !drawn.json, JSON.stringify(drawn.text))
  check('no uncaught errors in the console', errors.length === 0, errors.slice(0, 2).join(' | '))

  await page.screenshot({ path: join(SHOTS, 'written-as-blocks.png') })
  await browser.close()
  server.close()
  console.log(failures === 0 ? '\nShip writes a block document.' : `\n${failures} failed.`)
  process.exit(failures === 0 ? 0 : 1)
}
main().catch((e) => { console.error(e); process.exit(1) })
