/**
 * **Ship rendering a real Peek Topic, in a real browser.** PRO-7's done-when.
 *
 *   PROBE_SECRET_KEY=<64 hex> npx tsx scripts/pro7-render.ts [--headed]
 *
 * ## Why this exists when the tests are green
 *
 * `npm --prefix web run test` renders the widget from fixtures and passes, and
 * `scripts/pro7-probe.ts` resolves a real Topic from production and passes.
 * Neither one shows a person anything. A component that is never mounted, a
 * reference the description never contains, a route that throws on load — all
 * of those are compatible with both of those checks staying green, and PRO-7's
 * done-when is a *render*, not a resolve.
 *
 * ## Real objects, stub transport
 *
 * The events are pulled from production and replayed by the same in-memory stub
 * `smoke.ts` uses, so this is Peek's actual manifest, an actual Topic and its
 * actual messages, driven through the built app in Chromium.
 *
 * Stubbing the transport rather than pointing the browser at the relay buys two
 * things worth having. Ship's browser identity is a throwaway local key, which
 * is not a relay member and would be refused every read — so this could not run
 * at all against production without a sign-in flow. And the Ship issue below,
 * whose description carries the Topic's `naddr`, does not have to be written to
 * production to be looked at.
 */
import { createServer } from 'node:http'
import { readFileSync, mkdirSync } from 'node:fs'
import { join, extname } from 'node:path'
import { chromium, type ConsoleMessage } from 'playwright-core'
import { Relay, encodeNaddr, publicKeyFromSecret, signEvent, toNostrSeconds } from '@estiva-app/protocol'
import type { SignedEvent } from '@estiva-app/protocol'
import { secretKeySigner } from '../lib/nostr/signer'
import { KIND } from '../src/kinds'

const HEADED = process.argv.includes('--headed')
const PORT = 4173
const DIST = new URL('../dist/ship/', import.meta.url).pathname
const SHOTS = new URL('../.pro7/', import.meta.url).pathname
const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json',
}

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

function secretKey(): string {
  const fromEnv = process.env.PROBE_SECRET_KEY?.trim()
  if (fromEnv && /^[0-9a-f]{64}$/.test(fromEnv)) return fromEnv
  const file = new URL('../.manifest-key', import.meta.url).pathname
  try {
    const onDisk = readFileSync(file, 'utf8').trim()
    if (/^[0-9a-f]{64}$/.test(onDisk)) return onDisk
  } catch { /* fall through */ }
  console.error('\n✋ Set PROBE_SECRET_KEY (64 hex) to a relay member’s key.\n')
  process.exit(1)
}

const tag = (e: SignedEvent, name: string) => e.tags.find((t) => t[0] === name)?.[1]

/** Everything this run needs, pulled from production once. */
async function fromProduction() {
  const relay = new Relay('https://estiva.estiva.app', secretKeySigner(secretKey()))
  const [manifest] = await relay.query([{ kinds: [31990], '#d': ['estiva-peek'], limit: 1 }])
  if (!manifest) throw new Error('Peek has published no manifest — PRO-6 is not done')

  const topics = await relay.query([{ kinds: [39000], limit: 30 }])
  for (const topic of topics) {
    const d = tag(topic, 'd') ?? ''
    const messages = await relay.query([{ kinds: [9], '#h': [d], limit: 8 }])
    if (messages.length < 2) continue
    const authors = [...new Set(messages.map((m) => m.pubkey))]
    const profiles = await relay.query([{ kinds: [0], authors, limit: 10 }])
    return { manifest, topic, messages, profiles, d }
  }
  throw new Error('no production topic with messages')
}

async function main() {
  mkdirSync(SHOTS, { recursive: true })
  const real = await fromProduction()
  console.log(`topic   "${tag(real.topic, 'name')}"  (${real.messages.length} messages)\n`)

  // A Ship issue whose description references the Topic. Signed locally and
  // never published — the point is what the app draws, not what the relay holds.
  const sk = secretKey()
  const pubkey = publicKeyFromSecret(sk)
  const folder = 'aaaaaaaa-0000-4000-8000-000000000001'
  const naddr = encodeNaddr({ kind: 39000, pubkey: real.topic.pubkey, identifier: real.d, relays: [] })
  const issueId = 'bbbbbbbb-0000-4000-8000-000000000002'
  const issue = signEvent(
    {
      pubkey, created_at: toNostrSeconds(Date.now()), kind: KIND.ISSUE,
      tags: [['d', issueId], ['title', 'Wire the conversation into the issue'], ['h', folder], ['ref', 'PRO-7']],
      content: `The discussion for this lives in Peek:\n\nnostr:${naddr}\n`,
    },
    sk,
  )
  const folderEvent = signEvent(
    { pubkey, created_at: toNostrSeconds(Date.now()), kind: 39000, tags: [['d', folder], ['name', 'PRO-7']], content: '' },
    sk,
  )

  const stored: SignedEvent[] = [
    real.manifest, real.topic, ...real.messages, ...real.profiles, issue, folderEvent,
  ]

  const matches = (event: SignedEvent, filter: Record<string, unknown>) => {
    const kinds = filter.kinds as number[] | undefined
    if (kinds && !kinds.includes(event.kind)) return false
    const authors = filter.authors as string[] | undefined
    if (authors && !authors.includes(event.pubkey)) return false
    for (const [key, want] of Object.entries(filter)) {
      if (!key.startsWith('#')) continue
      const name = key.slice(1)
      const values = event.tags.filter((t) => t[0] === name).map((t) => t[1])
      // A channel's own 39000 answers an `#h` query for that channel even
      // though it carries no `h` tag — the behaviour peek#86 was about.
      if (name === 'h' && event.kind === 39000 && (want as string[]).includes(tag(event, 'd') ?? '')) continue
      if (!(want as string[]).some((v) => values.includes(v))) return false
    }
    return true
  }

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
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  const errors: string[] = []
  page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.route('http://localhost:3000/**', async (route) => {
    const request = route.request()
    const body = request.postDataJSON() as unknown
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/') {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { date: new Date().toUTCString() }, body: '{}' })
    }
    if (Array.isArray(body)) {
      const filters = body as Record<string, unknown>[]
      const hits = stored.filter((e) => filters.some((f) => matches(e, f)))
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hits) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  await page.goto(`http://localhost:${PORT}/#/issue/${encodeURIComponent(`${KIND.ISSUE}:${pubkey}:${issueId}`)}`)
  const widget = page.locator('[data-foreign-object]').first()
  await widget.waitFor({ timeout: 15000 })
  await page.screenshot({ path: join(SHOTS, 'issue-with-peek-topic.png'), fullPage: true })

  const topicName = tag(real.topic, 'name') ?? ''
  check('Ship draws the Peek Topic', await page.getByText(topicName, { exact: false }).first().isVisible(), topicName)
  check('  …labelled as Peek’s, from the manifest', await page.getByText('Peek', { exact: true }).first().isVisible())

  const messages = page.locator('[data-widget="message"]')
  const drawn = await messages.count()
  check('  …with its messages, drawn as messages not cards', drawn > 0, `${drawn} of ${real.messages.length}`)

  // The chain: Peek declares ["message","card"] and Ship implements `message`.
  // If chain-walking regressed, these render as cards and the count above is 0.
  const firstBody = (real.messages[0].content ?? '').trim().slice(0, 24)
  check('  …carrying a real message body from production', await page.getByText(firstBody, { exact: false }).first().isVisible(), JSON.stringify(firstBody))

  check('nothing threw in the browser', errors.length === 0, errors.slice(0, 2).join(' · '))

  // Which element still carries the raw reference, if any?
  const raw = await page.evaluate(() => {
    const out: string[] = []
    document.querySelectorAll('*').forEach((el) => {
      const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent ?? '').join('')
      if (own.includes('naddr1')) out.push(`${el.tagName}.${(el as HTMLElement).className}`.slice(0, 120))
    })
    return out
  })
  check('no raw naddr is left on screen', raw.length === 0, raw.join(' | ') || 'none')

  console.log(`\nscreenshot → ${join(SHOTS, 'issue-with-peek-topic.png')}`)
  await browser.close()
  server.close()
  console.log(failures === 0 ? '\nShip renders a Peek object.' : `\n${failures} check(s) FAILED.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => { console.error(error); process.exit(1) })
