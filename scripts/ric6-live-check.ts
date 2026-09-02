/**
 * RIC-6, verified where a person would see it.
 *
 * The suites prove the parser and the mapping. This proves the thing the ticket
 * promises: **a real production description, in a real browser, drawn as
 * structure instead of as characters.** The events are the 103 recorded in
 * `conformance/fold-fixture.json` — production's own, not a fixture written to
 * flatter the renderer — served to the built app through the same stub relay
 * `smoke.ts` uses.
 *
 *   npm --prefix web run build && npx tsx scripts/ric6-live-check.ts
 */
import { createServer } from 'node:http'
import { readFileSync, mkdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { chromium, type ConsoleMessage } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const DIST = join(here, '..', 'dist', 'ship')
const SHOTS = join(here, '..', '.ric6')
const PORT = 5199

const fixture = JSON.parse(readFileSync(join(here, '..', 'conformance', 'fold-fixture.json'), 'utf8'))
const events = fixture.events as { kind: number; tags: string[][]; content: string }[]

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
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

  await page.route('http://localhost:3000/**', async (route) => {
    const request = route.request()
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/') {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { date: new Date().toUTCString() }, body: '{}' })
    }
    const body = request.postDataJSON() as unknown
    if (Array.isArray(body)) {
      // Every recorded event, unfiltered. The app's own fold decides.
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(events) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  // The project whose description is 6,446 characters of real markdown.
  const target = fixture.expected.projects.find((p: { description?: string }) =>
    (p.description ?? '').length > 3000)
  check('the fixture holds a long production description', !!target, `${target?.description?.length ?? 0} chars`)
  console.log(`   project: ${target.title}`)
  console.log(`   format resolved by the fold: ${target.descriptionFormat}`)

  await page.goto(`http://localhost:${PORT}/#/project/${encodeURIComponent(target.addr)}`)
  await page.waitForSelector('[data-surface="project"]', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1200)

  const desc = page.getByLabel('Description').first()
  await desc.waitFor({ timeout: 15000 })

  // What a reader sees.
  const counts = await desc.evaluate((el) => ({
    headings: el.querySelectorAll('.text-h3, .text-h4').length,
    lists: el.querySelectorAll('ul, ol').length,
    items: el.querySelectorAll('li').length,
    quotes: el.querySelectorAll('blockquote').length,
    code: el.querySelectorAll('code').length,
    pre: el.querySelectorAll('pre').length,
    // The failure this replaces: markers rendered as characters.
    rawMarkers: (el.textContent ?? '').match(/\*\*|^#{1,2}\s/gm)?.length ?? 0,
    text: (el.textContent ?? '').slice(0, 70),
  }))
  console.log(`   drawn: headings=${counts.headings} lists=${counts.lists} items=${counts.items} quotes=${counts.quotes} code=${counts.code} pre=${counts.pre}`)

  check('the description is drawn as structure, not characters', counts.headings > 0 && counts.lists > 0)
  check('no ** or # survives as literal text', counts.rawMarkers === 0, `${counts.rawMarkers} left`)
  check('it is the real description', counts.text.length > 40, JSON.stringify(counts.text))
  check('no uncaught errors in the console', errors.length === 0, errors.slice(0, 2).join(' | '))

  await page.screenshot({ path: join(SHOTS, 'project-description.png'), fullPage: false })
  await desc.screenshot({ path: join(SHOTS, 'description-only.png') })
  console.log(`\nScreenshots in .ric6/`)

  await browser.close()
  server.close()
  console.log(failures === 0 ? '\nRIC-6 renders in the live app.' : `\n${failures} failed.`)
  process.exit(failures === 0 ? 0 : 1)
}
main().catch((e) => { console.error(e); process.exit(1) })
