/**
 * RIC-9: a description shows the object it points at, on both surfaces.
 *
 * The defect was an asymmetry, so this checks the two surfaces the same way and
 * compares them. A project description used to render the raw bech32 and draw
 * nothing for the object it named, while an issue's had done both since PRO-7 —
 * and every suite was green, because neither was broken. Only putting the same
 * body on both and looking shows it.
 *
 *   npm --prefix web run build && npx tsx scripts/ric9-live-check.ts
 */
import { createServer } from 'node:http'
import { readFileSync, mkdirSync } from 'node:fs'
import { extname, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type ConsoleMessage } from 'playwright-core'
import { addrToNaddr } from '@estiva-app/protocol'
import { buildManifest } from '../src/manifest'

const here = dirname(fileURLToPath(import.meta.url))
const DIST = join(here, '..', 'dist', 'ship')
const SHOTS = join(here, '..', '.ric9')
const PORT = 5195

interface Event { id: string; kind: number; tags: string[][]; content: string; created_at: number; pubkey: string }

const fixture = JSON.parse(readFileSync(join(here, '..', 'conformance', 'fold-fixture.json'), 'utf8'))

/** Recorded events only — the nine adversarial ones use a folder id the app refuses. */
const FOLDER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const recorded = (fixture.events as Event[]).filter((e) =>
  e.tags.every((t) => t[0] !== 'h' || FOLDER_UUID.test(t[1])),
)

/**
 * Ship's own projection manifest, seeded into the stub.
 *
 * Without a `kind:31990` nothing can resolve a foreign object at all, so both
 * surfaces would draw nothing and the check would pass while proving only that
 * neither crashed. Built by Ship's own `buildManifest` rather than hand-rolled,
 * so what the consumer reads is what Ship actually publishes.
 */
const manifest = {
  ...buildManifest(recorded[0].pubkey, Date.now()),
  id: 'manifest'.padEnd(64, '0'),
  sig: '0'.repeat(128),
} as unknown as Event

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
}

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
    const candidates = name === 'h' ? (want as string[]).slice(0, 1) : (want as string[])
    if (!candidates.some((value) => values.includes(value))) return false
  }
  return true
}

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
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } })
  const errors: string[] = []
  page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))

  const stored: Event[] = [...recorded, manifest]
  await page.route('http://localhost:3000/**', async (route) => {
    const request = route.request()
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/') {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { date: new Date().toUTCString() }, body: '{}' })
    }
    const body = request.postDataJSON() as unknown
    if (request.url().endsWith('/events') && body) {
      stored.push(body as Event)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accepted: true, event_id: (body as Event).id, message: '' }) })
    }
    if (Array.isArray(body)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(answer(stored, body as Record<string, unknown>[])) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  // A pointer at a real recorded issue, so it has something to resolve to.
  const pointee = fixture.expected.issues[0]
  const naddr = `nostr:${addrToNaddr(pointee.addr, ['http://localhost:3000'])}`
  const BODY = `Tracked in ${naddr} for now.`

  const describe = async (surface: 'issue' | 'project') => {
    await page.getByRole('button', { name: 'Edit description' }).click()
    const field = page.getByLabel('Description')
    await field.waitFor()
    await field.fill(BODY)
    await page.locator(`[data-surface="${surface}"]`).first().click({ position: { x: 5, y: 5 } })
    await page.waitForTimeout(1200)
  }

  const measure = async (surface: 'issue' | 'project', addr: string) => {
    await page.goto(`http://localhost:${PORT}/#/${surface}/${encodeURIComponent(addr)}`)
    await page.waitForSelector(`[data-surface="${surface}"]`, { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(900)
    await describe(surface)
    await page.goto(`http://localhost:${PORT}/#/${surface}/${encodeURIComponent(addr)}`)
    await page.waitForSelector(`[data-surface="${surface}"]`, { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(1500)
    const shown = (await page.getByLabel('Description').first().textContent()) ?? ''
    const surfaceText = (await page.locator(`[data-surface="${surface}"]`).first().textContent()) ?? ''
    await page.screenshot({ path: join(SHOTS, `${surface}.png`) })
    // RIC-10: a pointer inside a sentence is drawn *in place* as a chip, so the
    // sentence survives and the reader sees the object's title where the author
    // wrote the pointer. Asserted rather than inferred from the prose, because
    // the older assertions below are satisfied by the attachment variant too.
    // Scoped to the surface, not to the field: `EditableText` renders the
    // display node inside its "Edit description" button, so an
    // `aria-label="Description"` scope finds the textarea and nothing else.
    const inlineChip = await page.locator(`[data-surface="${surface}"] [data-reference]`).count()
    return {
      bech32InProse: shown.includes('naddr1'),
      prose: shown.trim().slice(0, 48),
      namesThePointee: surfaceText.includes(pointee.title),
      inlineChip: inlineChip > 0,
    }
  }

  const project = fixture.expected.projects[0]
  const issue = fixture.expected.issues.find((i: { addr: string }) => i.addr !== pointee.addr) ?? pointee

  const p = await measure('project', project.addr)
  const i = await measure('issue', issue.addr)

  console.log(`   project: prose=${JSON.stringify(p.prose)} pointerShown=${p.bech32InProse} objectNamed=${p.namesThePointee}`)
  console.log(`   issue  : prose=${JSON.stringify(i.prose)} pointerShown=${i.bech32InProse} objectNamed=${i.namesThePointee}`)

  check('the project keeps the pointer out of its prose', !p.bech32InProse)
  check('the issue does too, as it always did', !i.bech32InProse)
  check('the project draws the object it points at', p.namesThePointee)
  check('the issue draws it as well', i.namesThePointee)
  check('a mid-sentence pointer is drawn in place — RIC-10', p.inlineChip && i.inlineChip)
  check('the two surfaces now agree', p.bech32InProse === i.bech32InProse && p.namesThePointee === i.namesThePointee)
  check('no uncaught errors in the console', errors.length === 0, errors.slice(0, 2).join(' | '))

  await browser.close()
  server.close()
  console.log(failures === 0 ? '\nBoth surfaces show the object, not the pointer.' : `\n${failures} failed.`)
  process.exit(failures === 0 ? 0 : 1)
}
main().catch((e) => { console.error(e); process.exit(1) })
