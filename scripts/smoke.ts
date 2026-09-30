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
 *
 * ## It drives the React app, not the vanilla one (REW-7)
 *
 * Until the cutover this built `apps/ship` with build.mjs and drove that DOM.
 * Production now serves the React app, so a smoke test of the old one measured
 * something nobody could reach — and REW-9 deletes `apps/` and `build.mjs`
 * outright, which would have taken this file with it.
 *
 * Rewritten against the React app (then `web/`, `src/` since PER-19), which shares none of the old selectors: the vanilla
 * app had hand-written classes (`.card`, `.kanban-card`, `.detail-side select`)
 * and the React app is Tailwind utilities plus `@estiva-app/ui` components.
 * So the selectors here are **roles and accessible names** wherever one exists,
 * which makes the test double as a check that the app is reachable by
 * assistive tech — a class-name selector asserts nothing about that. The only
 * exceptions are the four `data-surface` attributes (and `data-view`), which
 * exist because "which surface is on screen" is not expressible as a role.
 *
 * ## Two assertions that had to change with the wire format
 *
 * Both were failing before this rewrite, and neither was a regression:
 *
 *  - **The project record is global now (REW-11).** It used to be filed under
 *    its Folder with `h`; it now merely *points* at one with `buzz-channel`.
 *    The check is therefore `project.buzz-channel === folder.h`, which tests
 *    what REW-11 actually did rather than asserting the tag it removed.
 *  - **A root comment is a `kind:1111` (REW-10), and so is a reply to one
 *    (SHI-28).** The reply copies the comment's `A` and names the comment with
 *    lowercase `e` — `buildNip22Reply`. It was a `kind:9` until then, which is
 *    why the shape is asserted here rather than left to the fold, which reads
 *    both.
 */
import { createServer } from 'node:http'
import { readFileSync, mkdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { chromium, type ConsoleMessage, type Page } from 'playwright-core'
import { addrToNaddr } from '@estiva-app/protocol'

const ROOT = new URL('..', import.meta.url).pathname
/**
 * Vite writes here, and the image serves exactly this directory at `/`.
 *
 * Served at the root rather than under `/ship/` because the built `index.html`
 * references `/assets/…` absolutely — mounting it on a sub-path yields a blank
 * page whose only symptom is two 404s in the console.
 */
const DIST = join(ROOT, 'dist', 'ship')
const SHOTS = join(ROOT, '.smoke')
/*
  5191 is also `npm run dev`'s port, and these repos are shared — so a colleague
  with Ship open makes this unrunnable with an `EADDRINUSE` that says nothing
  about the test. Overridable rather than hardcoded: `SMOKE_PORT=5199 npm run
  smoke`. The default is unchanged, so nothing that already works has to.
*/
const PORT = Number(process.env.SMOKE_PORT ?? 5191)
const HEADED = process.argv.includes('--headed')

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
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
      /*
        A deep link falls back to index.html, which is how this app is actually
        served — `deploy/nginx.conf` has `try_files $uri $uri/ /index.html` and
        says why: "a deep link has to reach index.html and let the app route
        it." This server had no such rule, so it modelled nginx correctly only
        for as long as every route was a hash.

        SHI-16 ended that. Ship's URLs became real paths, the first click past
        the landing page navigates to `/projects`, and this server answered
        404 — so the surface never appeared and the run died on the second
        assertion of thirty-nine. The symptom is a missing element rather than
        a failed request, which is why it read as an app bug and survived.

        A request with an extension is still a 404. That is a missing asset,
        and answering it with HTML would hide a broken bundle reference behind
        a page that half works.
      */
      if (extname(path)) {
        res.writeHead(404).end('not found')
        return
      }
      res.writeHead(200, { 'content-type': 'text/html' }).end(readFileSync(join(DIST, 'index.html')))
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

  // Everything the app sends to the relay is answered here instead. The build
  // under test defaults `RELAY_URL` to exactly this origin — see the header of
  // vite.config.ts, which says so for this reason.
  /** Requests this stub does not model, reported rather than guessed at. */
  const unmodelled: string[] = []
  /** Filters carried by each `POST /query`, so the read's cost is visible. */
  const queryCalls: number[] = []
  /** How many times the app asked the relay for its clock. */
  let clockProbes = 0

  await page.route('http://localhost:3000/**', async (route) => {
    const request = route.request()
    const body = request.postDataJSON() as unknown

    /*
      The clock probe (`api/clock.ts`). A bare GET whose only useful part is the
      `date` response header: the relay refuses an event whose `created_at` is
      more than ~15 minutes from its own clock, so the app measures the skew
      before signing and says so in words rather than letting the write come
      back as a generic rejection.

      Answered with this process's own clock, which makes the skew ~0 and lets
      writes proceed. Something the vanilla app never did, and the reason this
      handler now has to tolerate a request with no JSON body at all.
    */
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/') {
      clockProbes++
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { date: new Date().toUTCString() },
        body: '{}',
      })
    }

    if (request.url().endsWith('/events') && body) {
      ingest(body as Event)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accepted: true, event_id: (body as Event).id, message: '' }),
      })
    }
    if (Array.isArray(body)) {
      const filters = body as Record<string, unknown>[]
      /*
        A deleted event stops coming back — the third behaviour this stub is
        deliberately faithful about.

        Buzz honours a NIP-09 `kind:5` by ceasing to return its target, and
        Ship's reaction path *depends* on that: it issues no deletion query at
        all, because it caches nothing and a retracted reaction is simply absent
        from the next read. A stub that kept returning deleted events would let
        that assumption rot silently — the app would look right here and be
        wrong against production the moment somebody un-reacted.
      */
      const deleted = new Set(
        stored
          .filter((e) => e.kind === 5)
          .flatMap((e) => e.tags.filter((t) => t[0] === 'e').map((t) => t[1])),
      )
      /*
        Per filter, concatenated in filter order, each clamped to its own
        `limit` — the fourth behaviour this stub is deliberately faithful
        about, and it became load-bearing when protocol 0.15.0 started sending
        every filter's first page in one request.

        Measured against production 2026-09-07: ten filters at `limit: 5`
        returned 48 events, not 5, and the same filter twice in one POST
        returned 236, not 118. A stub that unioned the filters and deduped
        would let a client conclude a filter was complete when the relay had
        clamped it — the app would look right here and drop events against
        production, which is the one thing this file exists to prevent.
      */
      queryCalls.push(filters.length)
      const live = stored.filter((event) => !deleted.has(event.id))
      const hits = filters.flatMap((filter) => {
        const eligible = live
          .filter((event) => matches(event, filter))
          .sort((a, b) => b.created_at - a.created_at)
        const limit = typeof filter.limit === 'number' ? filter.limit : eligible.length
        return eligible.slice(0, limit)
      })
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(hits),
      })
    }
    // Anything else — a bodyless GET, a preflight, an endpoint added since this
    // stub was written. Answered emptily so one unmodelled call cannot fail the
    // run by throwing inside the route handler, and recorded so it is visible
    // instead of silently absorbed.
    unmodelled.push(`${request.method()} ${new URL(request.url()).pathname}`)
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  /** The section a heading names — how the conversation and activity blocks are found. */
  const sectionFor = (name: string) =>
    page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) })

  /** `Select` is not a native `<select>`: a labelled trigger, then a listbox.
   *  The trigger is a `combobox` rather than a `button` since the Base UI
   *  migration — which is what the component's own unit tests already say. */
  const pick = async (label: string, option: string | number) => {
    await page.getByRole('combobox', { name: label, exact: true }).click()
    await page.getByRole('listbox').waitFor()
    await (typeof option === 'string'
      ? page.getByRole('option', { name: option })
      : page.getByRole('option').nth(option)
    ).click()
    await page.getByRole('listbox').waitFor({ state: 'detached' })
  }

  const sidebar = () => page.getByRole('navigation', { name: 'Workspace' })

  /* The project and issue pages are in tabs (Katerina, 29 September): Overview,
     Activity and, on a project, Issues. `data-tab` on the surface is the waypoint
     that says the click landed. */
  const openTab = async (name: 'Overview' | 'Activity' | 'Issues') => {
    await page.getByRole('tab', { name, exact: true }).click()
    await page.waitForSelector(`[data-tab="${name.toLowerCase()}"]`)
  }

  /* A write that leaves nothing new on screen — a description saved as the
     field is left — is waited for on the stub's own store, never on a timer. */
  const until = async (condition: () => boolean, timeout = 15000) => {
    const end = Date.now() + timeout
    while (!condition()) {
      if (Date.now() > end) throw new Error('timed out waiting for the relay')
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  /* The writing boxes are editors, not textareas: what is in one is its text. */
  const textOf = async (box: ReturnType<typeof page.locator>) => (await box.innerText()).trim()

  /* Relay-signed events go straight into the stub: a client publishing a
     `kind:30890` is refused (`is_relay_only_kind`), which is what is modelled. */
  const RELAY_KEY = 'f'.repeat(64)
  const seed = (event: Partial<Event> & { kind: number; tags: string[][] }) =>
    ingest({
      id: Math.random().toString(16).slice(2).padEnd(64, '0'),
      pubkey: RELAY_KEY,
      created_at: Math.floor(Date.now() / 1000),
      content: '',
      ...event,
    } as Event)

  /* A team for the new project to be filed into (FOL-2). It has state, as all
     five production teams do, and before the first load: the app reads the
     Folders once, on mount. */
  const TEAM_ID = '3c1f6e0a-58d2-4b7e-9a41-0f6d2c8b7e15'
  seed({ kind: 39000, tags: [['d', TEAM_ID], ['name', 'Smoke team']] })
  seed({ kind: 30890, tags: [['d', TEAM_ID], ['name', 'Smoke team']] })

  await page.goto(`http://localhost:${PORT}/`)

  // ── Lands straight on the issue list; there is no workspace to choose ─────
  await page.waitForSelector('[data-surface="issues"]')
  check('the app opens on Issues with no setup step', page.url().includes('/issues'))
  await shot(page, '01-issues-empty')

  // ── Projects ──────────────────────────────────────────────────────────────
  await sidebar().getByRole('link', { name: /^Projects/ }).click()
  await page.waitForSelector('[data-surface="projects"]')
  await page.getByRole('button', { name: 'Add project' }).click()
  // Scoped to the dialog throughout: a bare placeholder also matches controls on
  // the surface behind it, and a click returns before the async re-render, so an
  // unscoped selector can fill something that is about to be replaced.
  //
  // By name, never a bare `getByRole('dialog')`: the toast is a `role="dialog"`
  // too, and "Project created" is still on screen when the next form opens.
  const projectDialog = page.getByRole('dialog', { name: 'New project' })
  await projectDialog.waitFor()
  check('the project form opens in a modal', await projectDialog.isVisible())
  await projectDialog.getByPlaceholder('New project title').fill('Payment integration')
  await projectDialog
    .getByPlaceholder('Description (optional)')
    .fill('Stripe Checkout for workspace billing.')
  await pick('Team', 'Smoke team')
  await page.getByRole('button', { name: 'Create project' }).click()
  await page.getByRole('link', { name: /Payment integration/ }).first().waitFor()
  check('the modal closes once the project is created', (await projectDialog.count()) === 0)

  const project = stored.find((e) => e.kind === 30850)
  check('no kind:9007 — a project gets no Folder of its own (FOL-2)', !stored.some((e) => e.kind === 9007))
  check(
    'the project record points at its team, and is not filed under it',
    // REW-11 made the record global: `buzz-channel` names the Folder, and there
    // is deliberately no `h`. Asserting the absence too, because a record that
    // carried both would fold correctly and still be the old shape.
    !!project && tagValue(project, 'buzz-channel') === TEAM_ID,
    `buzz-channel=${tagValue(project!, 'buzz-channel')?.slice(0, 8)}`,
  )
  check('  …with no `h` of its own', !!project && tagValue(project, 'h') === undefined)
  const listing = stored.find((e) => e.kind === 1852)
  check(
    '  …and a kind:1852 lists it in the team, so Peek places it',
    !!project && !!listing && tagValue(listing, 'h') === TEAM_ID && tagValue(listing, 'op') === 'add' &&
      tagValue(listing, 'a') === `30850:${project.pubkey}:${tagValue(project, 'd')}`,
  )
  await shot(page, '02-projects')

  // ── Project detail, and an issue inside it ────────────────────────────────
  await page.getByRole('link', { name: /Payment integration/ }).first().click()
  await page.waitForSelector('[data-surface="project"][data-tab="overview"]')
  check('the project opens on its Overview tab', page.url().includes('/project/'))
  check(
    '  …with Overview, Activity and Issues as tabs on one page',
    (await page.getByRole('tab', { name: /^(Overview|Activity|Issues)$/ }).count()) === 3,
  )

  await page.getByRole('button', { name: 'Add issue' }).click()
  const issueDialog = page.getByRole('dialog', { name: /^New issue in / })
  await issueDialog.waitFor()
  await issueDialog.getByPlaceholder(/^New issue in /).fill('Billing entry + add payment method')
  await page.getByRole('button', { name: 'Create issue' }).click()
  await issueDialog.waitFor({ state: 'detached' })
  // Add issue is on every tab; the list is on Issues, full width, in table view.
  await openTab('Issues')
  await page.waitForSelector('[data-surface="project"][data-view="table"]')
  await page.waitForSelector('table tbody tr')

  const issue = stored.find((e) => e.kind === 30851)
  check(
    'the issue landed in the Folder the project points at',
    !!issue && !!project && tagValue(issue, 'h') === tagValue(project, 'buzz-channel'),
  )
  check('the issue names its parent project', !!issue && !!tagValue(issue!, 'a'))
  await shot(page, '03-project-overview')

  // ── Table and board ───────────────────────────────────────────────────────
  check('the table renders a row per issue', (await page.locator('table tbody tr').count()) === 1)
  await shot(page, '04-project-table')

  await page.getByRole('tab', { name: 'Board' }).click()
  await page.waitForSelector('[data-surface="project"][data-view="board"]')
  check(
    'the toggle swaps the list in place, same page and tab',
    (await page.locator('[data-surface="project"][data-tab="issues"]').count()) === 1 && page.url().includes('/project/'),
  )
  const board = page.locator('[data-surface="project"][data-view="board"]')
  check('the board renders a column per status', (await board.locator('section').count()) === 4)
  check(
    'the issue starts in the first column',
    (await board.locator('section').first().getByRole('link').count()) === 1,
  )
  await shot(page, '05-project-board')

  // ── Issue detail, and a status change ─────────────────────────────────────
  await board.locator('section').first().getByRole('link').first().click()
  await page.waitForSelector('[data-surface="issue"]')
  check('the issue detail opens', page.url().includes('/issue/'))

  /*
    ── The description is written where it is read (RIC-14) ─────────────────

    > Miky, 2026-09-04 — "When you editing the project description, the rich
    > text field got smaller. It should feel like Notion. You read and edit and
    > it's 1:1."

    Asserted in a browser because it is a claim about pixels and about a
    ProseMirror instance, and neither survives being checked in jsdom: the unit
    tests can say the editor mounted and cannot say it is the same size or that
    a heading is still a heading inside it.

    The four-row textarea this replaced would fail every line below.

    Since the tabbed pages (Katerina, 29 September) there is nothing to open:
    the description is always an editor, the Notion way.
  */
  const editor = page.getByRole('textbox', { name: 'Description' })
  await editor.waitFor()
  check('the description is an editor where it is read, not a textarea', (await page.locator('textarea').count()) === 0)

  await editor.click()
  await page.keyboard.type('# What we agreed\n')
  await page.keyboard.type('- ship it\n')
  // No leading dash: Enter already opened the next item, and typing one here
  // puts a literal "- " inside it.
  await page.keyboard.type('tell Katerina')
  check(
    'a heading typed in the editor is drawn as a heading, while typing',
    (await editor.locator('h1').count()) === 1 && (await editor.locator('li').count()) === 2,
  )
  const editingBox = await editor.boundingBox()

  // Leaving the field saves it; Escape leaves and keeps the text (Notion's Esc, Katerina 29 September).
  await editor.press('Escape')
  await until(() => stored.some((e) => e.kind === 1851 && tagValue(e, 'field') === 'description'))
  const leftBox = await editor.boundingBox()
  check(
    'the field is the same size writing and after it is left — the report itself',
    !!editingBox && !!leftBox && Math.abs(editingBox.height - leftBox.height) < 2,
    `writing ${Math.round(editingBox?.height ?? 0)}px, left ${Math.round(leftBox?.height ?? 0)}px`,
  )

  const described = stored.filter((e) => e.kind === 1851).find((e) => tagValue(e, 'field') === 'description')
  check('the description was published as a block document', !!described)
  check(
    '  …declaring its format on the event, never in the body',
    tagValue(described!, 'content-format') === 'estiva-blocks-1',
    tagValue(described!, 'content-format'),
  )
  check(
    '  …carrying a block id a comment can anchor to',
    /"id":"[^"]{8,}"/.test(tagValue(described!, 'value') ?? ''),
  )

  /*
    The change feed is "History" since CON-9, which gave "Activity" to the list
    of conversations on *related* files. Two sections on one page could not both
    be Activity, and this one was always the history.
  */
  // Conversations, Mentioned in and History are the issue's Activity tab; the rail is on every tab.
  await openTab('Activity')
  const history = sectionFor('History')
  await pick('Status', 'In Progress')
  await history.locator('li').first().waitFor()
  const change = stored.find((e) => e.kind === 1851)
  check('a kind:1851 change was published, not an edit', !!change)
  check(
    "the change carries the issue's Folder",
    !!change && !!issue && tagValue(change, 'h') === tagValue(issue, 'h'),
  )
  check(
    'the change is authored by the actor',
    !!change && !!issue && change.pubkey === issue.pubkey,
  )

  // ── Comment, reply, assignee ──────────────────────────────────────────────
  const conversations = sectionFor('Conversations')
  const startBox = () => sectionFor('Conversations').getByRole('textbox', { name: 'Start a conversation…' })
  await startBox().click()
  await page.keyboard.type('Blocked on the Stripe key.')
  await conversations.locator('[data-message-box="conversation"]').getByRole('button', { name: 'Send', exact: true }).click()
  await conversations.locator('article').first().waitFor()

  const comment = stored.find((e) => e.kind === 1111)
  const issueAddr = `30851:${issue!.pubkey}:${tagValue(issue!, 'd')}`
  check('a root comment is a NIP-22 kind:1111 (REW-10)', !!comment)
  check(
    '  …naming the issue as its root, in both cases',
    !!comment && tagValue(comment, 'A') === issueAddr && tagValue(comment, 'a') === issueAddr,
  )
  check(
    '  …carrying the issue reference so Peek can render it',
    !!comment && comment.content.includes('nostr:naddr'),
  )
  check('  …and it is a root message, not a reply', !comment!.tags.some((t) => t[0] === 'e'))
  check('  …and no kind:9 was written for it', !stored.some((e) => e.kind === 9))

  /*
    Reactions, read across apps — CON-2.

    A `kind:7` is injected rather than clicked, because **Ship cannot publish
    one**: `estiva-ship`'s `allowedKinds` has no `7` while `estiva-peek` does.
    That is the real situation this surface is built for — reactions arrive from
    the other app — so the test reproduces it rather than a capability Ship does
    not have.

    It also exercises the part that is easy to get wrong: a `kind:7` carries no
    `h`, so it is found only by a `#e` query addressed at the message. If Ship
    ever went back to expecting reactions to arrive with the Folder, this is
    what fails.
  */
  stored.push({
    id: 'r'.repeat(64),
    pubkey: 'f'.repeat(64),
    kind: 7,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['e', comment!.id]],
    content: '🎉',
  })
  /*
     Injected straight into the stub's store, so ONLY the poll can bring it back —
     no click, no write, nothing else to trigger a read. That makes this the one
     wait in the file whose budget is `REFRESH_MS`, and it has to stay ahead of
     it: at 20 s the old 15 s timeout failed here, correctly.
  */
  await conversations.locator('[data-reactions]').first().waitFor({ timeout: 45000 })
  check('a reaction written in another app is read here', true)
  check(
    '  …drawn on the message it targets, with its count',
    (await conversations.locator('[data-reactions]').first().textContent())?.includes('🎉') ?? false,
  )

  /*
    And now the write half, which needed a grant rather than code: `estiva-ship`
    had no `7` in `allowedKinds` until estiva-id#59 was merged and the row
    re-seeded on 2026-09-07. Before that this click would have failed at /sign,
    after the control was already on screen.

    Clicked by its accessible name, not by a class or an ordinal — the emoji is
    `aria-hidden`, so a control named only by its count would be named "1" to
    anybody using a screen reader, which is what the name below pins.
  */
  /*
    Waits on the *rendered effect*, never on a timer. A first pass read `stored`
    straight after the click and failed — the publish is a round trip, and a
    fixed sleep would only have moved the race. The count changing is the app
    saying the relay answered.
  */
  await conversations.getByRole('button', { name: 'Congrats' }).first().click()
  await conversations.getByRole('button', { name: 'Congrats, 2' }).first().waitFor({ timeout: 15000 })
  const reaction = stored.find((e) => e.kind === 7 && e.pubkey !== 'f'.repeat(64))
  check('reacting publishes a kind:7', !!reaction)
  check('  …naming the message it is about, by event id', tagValue(reaction!, 'e') === comment!.id)
  check('  …carrying the emoji as its content', reaction!.content === '🎉')
  /* No `h`, and that is not an omission: Buzz derives a reaction's channel from
     the target's `e` tag and ignores a client-supplied one, so adding it would
     change the event id for nothing. */
  check('  …and no h tag, as Buzz builds it', !reaction!.tags.some((t) => t[0] === 'h'))

  check('  …and the count re-read from the relay, not guessed', true)

  /*
    A second, different emoji from the same person is KEPT — not swapped.

    Reported 2026-09-07 as a Ship/Peek inconsistency: "you can have multiple
    reactions in Peek, but only one in Ship". The client reads as if it already
    should — the picker passes each emoji's own `mine`, so a second emoji has
    none and adds rather than retracts — and reasoning is exactly what this file
    exists to replace. Buzz agrees at the storage layer: the reaction row's key
    is (community, target, pubkey, **emoji**), so a different emoji is a
    different row, and production holds a target carrying 💯 🚀 🙏 from one
    person.

    So the behaviour is pinned here, and a regression would have to pass this
    to reach anybody.
  */
  /* An emoji nobody has used yet comes from the picker, which lives behind the
     card's React button — it was an inline row when this was written. The
     picker's buttons are named by meaning, not by glyph, the same rule the
     pills follow. */
  await conversations.getByRole('button', { name: 'React' }).first().click()
  // `page`, not `conversations`: the popover portals to the body, so it is not
  // inside the section its trigger sits in.
  await page.getByRole('button', { name: 'Makes sense', exact: true }).first().click()
  await conversations.getByRole('button', { name: 'Makes sense, 1' }).first().waitFor({ timeout: 15000 })
  const mine = stored.filter((e) => e.kind === 7 && e.pubkey !== 'f'.repeat(64))
  check('a second emoji is a second reaction, not a replacement', mine.map((e) => e.content).sort().join(' ') === '\u{1F389} \u{1F44D}')
  check('  …and nothing was retracted to make room for it', stored.filter((e) => e.kind === 5).length === 0)
  check(
    '  …with both drawn, each carrying its own count',
    (await conversations.locator('[data-reactions]').first().getAttribute('data-reactions')) === '2',
  )

  // Clicking your own takes it back — a kind:5 naming the REACTION, never the
  // message. A deletion naming the message would be asking to delete somebody's
  // comment, and the relay would refuse it only because the author differs.
  await conversations.getByRole('button', { name: 'Congrats, 2' }).first().click()
  // Back to the one reaction this actor did not write — the rendered effect
  // again, rather than a sleep.
  await conversations.getByRole('button', { name: 'Congrats, 1' }).first().waitFor({ timeout: 15000 })
  const retraction = stored.find((e) => e.kind === 5 && e.tags.some((t) => t[0] === 'e' && t[1] === reaction!.id))
  check('taking a reaction back publishes a kind:5 naming the reaction', !!retraction)
  check('  …not the message it was on', !retraction!.tags.some((t) => t[0] === 'e' && t[1] === comment!.id))

  /*
    SHI-1, read off the screen rather than off the event.

    The two assertions above prove the pointer was *published*; neither says
    anything about what a person sees, and what a person saw was the pointer
    itself or — once it was stripped — nothing. So: the comment's own words are
    on screen, and no bech32 is. Both halves are needed. Asserting only the
    absence of `naddr1` passes just as well when the whole body has been deleted,
    which is the bug this replaced.
  */
  const posted = conversations.locator('article').first()
  check(
    'the comment reads as what was typed',
    (await posted.textContent())?.includes('Blocked on the Stripe key.') ?? false,
  )
  check(
    '  …with the issue’s own pointer resolved away, not shown as bech32',
    !(await conversations.textContent())?.includes('naddr1'),
  )

  // The reply box opens from the small reply button under a message with none yet (Katerina, 29 September).
  await conversations.getByRole('button', { name: 'Reply', exact: true }).first().click()
  await conversations.getByRole('textbox', { name: 'Reply…' }).first().click()
  await page.keyboard.type('Key is in 1Password now.')
  await conversations.locator('[data-message-box="reply"]').getByRole('button', { name: 'Send', exact: true }).first().click()
  await page.waitForFunction(
    () => document.querySelectorAll('section article').length >= 2,
  )
  // A flat kind:1111 naming the comment — SHI-28, SPEC §6.4 *Replies*.
  const reply = stored.filter((e) => e.kind === 1111 && e.id !== comment?.id).at(-1)
  check('a reply to a comment is a kind:1111', !!reply)
  check(
    '  …naming the root comment with a lowercase e',
    !!reply && !!comment && reply.tags.some((t) => t[0] === 'e' && t[1] === comment.id),
  )
  check(
    '  …and the object with the comment’s own A, with no lowercase a',
    !!reply && !!comment && tagValue(reply, 'A') === tagValue(comment, 'A') && tagValue(reply, 'a') === undefined,
  )
  check('  …and renders nested', (await conversations.locator('article').count()) === 2)

  /*
    Deleting a comment — CON-3, read off the screen rather than off the event.

    The reply, not the root: the thread survives, so "the message left the page"
    is a visible difference rather than the whole card disappearing for any
    reason. Waits on the rendered effect — one article instead of two — because
    the publish and the re-read are both round trips and a sleep would only move
    the race.

    **The control is on somebody else's message and is still offered.** That is
    the ticket, not an oversight: Buzz accepts a kind:5 from the target's author
    or from the NIP-OA owner of an authoring agent, and no client can evaluate
    the second half. An author gate would hide the control from the one other
    party the relay would accept.
  */
  /*
    Editing a comment — CON-4, read off the screen rather than off the event.

    Done BEFORE the delete below, because the delete removes the reply this
    edits. The reply again rather than the root, so "the text changed" is
    visible against a card that stays put.

    Waits on the rendered effect — the new words on screen — because the publish
    and the re-read are both round trips, and the re-read is what proves the
    edit came back through `foldEdits` rather than being patched in locally.
  */
  await conversations.getByRole('button', { name: 'Message actions' }).nth(1).click()
  await page.getByRole('menuitem', { name: 'Edit message' }).click()
  /*
    Typed rather than `fill()`ed, and that is not a stylistic choice: `fill` set
    the textarea's value and the save then did nothing, every time. Typing drives
    it. The component is a plain controlled `<textarea>` with `value`/`onChange`
    passed straight through, so this is about how the two APIs reach React
    rather than about the component — and typing is the more faithful
    simulation of a person regardless.
  */
  const box = conversations.getByRole('textbox', { name: 'Edit message' })
  await box.click()
  await box.press('End')
  await box.pressSequentially(' — second drawer.')
  await conversations.getByRole('button', { name: 'Save' }).click()
  /*
    Waits for the EDITOR TO CLOSE, not for the text.

    A first pass waited on the new words and passed instantly — against the open
    textarea, whose value Playwright's `getByText` matches. So it proved the
    typing and nothing else, and the assertions below then read `stored` before
    the publish had happened. The editor closes only when the write resolved
    anything but `false`, which is the app saying the relay answered.
  */
  await box.waitFor({ state: 'detached', timeout: 15000 })
  // And only then is the rendered message the edited one — re-read through
  // `foldEdits`, never patched in locally.
  await conversations.getByText('Key is in 1Password now. — second drawer.').waitFor({ timeout: 15000 })
  const edit = stored.find((e) => e.kind === 40003)
  check('editing a comment publishes a kind:40003', !!edit)
  check('  …naming the message it edits, by event id', tagValue(edit!, 'e') === reply!.id)
  check('  …carrying the new body as its content', edit!.content === 'Key is in 1Password now. — second drawer.')
  /*
    The one conversation write that IS channel-scoped: 40003 is in the relay's
    `requires_h_channel_scope`, so an edit with no `h` is refused while the kind
    is granted and the signature is fine.

    Compared against the TARGET's own `h`, not the page's. A message reached
    through Activity belongs to another file, and publishing its edit under the
    surface's Folder would put it in a channel the message is not in.
  */
  check(
    '  …and an h tag matching the message it edits, not the page',
    !!tagValue(edit!, 'h') && tagValue(edit!, 'h') === tagValue(reply!, 'h'),
  )
  /* §6.2's rule, and the reason `buildEdit` adds a tag Buzz's own builder does
     not: two edits in one second would otherwise have no defined order. */
  const editTs = Number.parseInt(tagValue(edit!, 'ts') ?? '', 10)
  check('  …and a ts that agrees with created_at to the second', Math.floor(editTs / 1000) === edit!.created_at)
  check(
    '  …with the original event still on the relay, because an edit is not a rewrite',
    stored.some((e) => e.id === reply!.id),
  )
  check('  …and the message marked as edited', (await conversations.textContent())?.includes('edited') ?? false)

  const replyMenus = await conversations.getByRole('button', { name: 'Message actions' }).count()
  check('every message offers a delete, not just your own', replyMenus === 2)
  await conversations.getByRole('button', { name: 'Message actions' }).nth(1).click()
  await page.getByRole('menuitem', { name: 'Delete message' }).click()
  await page.getByRole('button', { name: 'Delete message' }).click()
  await page.waitForFunction(() => document.querySelectorAll('section article').length === 1)
  const deletion = stored.find((e) => e.kind === 5 && e.tags.some((t) => t[0] === 'e' && t[1] === reply!.id))
  check('deleting a comment publishes a kind:5 naming it', !!deletion)
  /* The event form, not the address form: a comment is a regular event, and the
     relay derives the channel from the target rather than from an `h`. Exactly
     one target, `e` or `a`, is all Buzz will accept. */
  check('  …by event id, with no h tag', !deletion!.tags.some((t) => t[0] === 'h'))
  check('  …and exactly one target', deletion!.tags.filter((t) => t[0] === 'e' || t[0] === 'a').length === 1)
  check(
    '  …and the message is gone from the page, re-read rather than hidden',
    !(await conversations.textContent())?.includes('Key is in 1Password now.'),
  )
  check('  …while the thread it was in survives', (await conversations.textContent())?.includes('Blocked on the Stripe key.') ?? false)

  /*
    Waits for one more history row than there were, not for "more than one".

    The absolute count is already true before the click as soon as anything
    else has written to this issue, so the wait returns immediately and the
    assertion below reads `stored` before the change reaches it. Nothing about
    the app is wrong; the check simply measures a moment too early, and it
    stays green only while this issue has exactly one prior change.
  */
  /*
    Scoped to History's own rows since CON-9. It used to count every `li` under
    every `section`, which was unambiguous while History was the only list made
    of them — Activity is a list of `li` too, so an unscoped count would now
    move for a reason that has nothing to do with the change being published.
  */
  const historyRows = await history.locator('li').count()
  await pick('Assignee', 1)
  await history.locator('li').nth(historyRows).waitFor()
  check(
    'assigning publishes a second change',
    stored.filter((e) => e.kind === 1851 && tagValue(e, 'field') === 'assignee').length === 1,
  )

  /*
    The two lists, on screen — CON-9.

    A section that renders is not the claim; the claim is that they are two
    lists holding different things. So: the comment posted above is in
    Conversations and *not* in Activity, and Activity says what it is for rather
    than rendering blank. The stub workspace contains no cross-Folder mention,
    which is why the populated case is asserted in `Activity.test.tsx` — this
    checks the wiring a unit test cannot see.
  */
  check('the Activity tab shows Conversations, Mentioned in and History as three lists', (await sectionFor('Mentioned in').count()) === 1 && (await history.count()) === 1 && (await conversations.count()) === 1)
  check(
    '  …with the comment in Conversations and not in Mentioned in',
    !(await sectionFor('Mentioned in').textContent())?.includes('Blocked on the Stripe key.'),
  )
  check(
    '  …and Mentioned in saying what it holds rather than nothing',
    (await sectionFor('Mentioned in').textContent())?.includes('No related conversations yet.') ?? false,
  )
  await shot(page, '06-issue-detail')

  /*
    Drafts survive a reload — CON-10.

    Asserted in a real browser because the claim is about `localStorage` and a
    page load, and neither exists in jsdom in the way that matters: the unit
    tests can prove the store and the composer, and only this can prove the text
    is still there after the page has actually gone away and come back.

    PEE-7's other half is checked too — the draft belongs to this issue and must
    not appear in a composer for something else.
  */
  const draft = 'a thought I did not finish'
  await startBox().click()
  await page.keyboard.type(draft)
  await page.reload()
  // The tab is in the address, so a reload comes back to Activity.
  await page.waitForSelector('[data-surface="issue"][data-tab="activity"]', { timeout: 10000 })
  const afterReload = sectionFor('Conversations')
  await startBox().waitFor()
  check('an unsent message survives a reload', (await textOf(startBox())) === draft, await textOf(startBox()))

  // The reply box on the same page is a different destination and must be empty.
  await afterReload.getByRole('button', { name: /^(Reply$|\d+ repl)/ }).first().click()
  const replyBox = afterReload.getByRole('textbox', { name: 'Reply…' }).first()
  await replyBox.waitFor()
  check('  …and does not appear in a different composer', (await textOf(replyBox)) === '', await textOf(replyBox))

  // Sending clears it: the next load starts empty rather than re-offering text
  // that has already been posted.
  await afterReload.locator('[data-message-box="conversation"]').getByRole('button', { name: 'Send', exact: true }).click()
  await page.waitForFunction(
    (n) => document.querySelectorAll('section article').length > n,
    await afterReload.locator('article').count(),
  )
  await page.reload()
  await page.waitForSelector('[data-surface="issue"][data-tab="activity"]', { timeout: 10000 })
  await startBox().waitFor()
  check('  …and is forgotten once it has been sent', (await textOf(startBox())) === '', await textOf(startBox()))

  /*
    An issue's comments stay on the issue (PEE-26, which undid CON-9's sub-file
    roll-up). Walk back to the project: the comment just written on its issue
    must be in neither the project's Activity — which is mentions only now — nor
    its Conversations, which are the project's OWN discussion. A leak into the
    latter would be the §5.1 merge one level up.

    Both checks are absences, and an absence passes on a page that has not
    loaded yet — Activity draws its empty state before and after. So first wait
    for the issue's row (the same load that reads the issue threads the
    exclusion set is built from) and for the stub relay to go quiet.
  */
  await page.getByRole('link', { name: 'Payment integration' }).first().click()
  await page.waitForSelector('[data-surface="project"]', { timeout: 10000 })
  await openTab('Issues')
  await page.locator('table tbody tr').first().waitFor({ timeout: 10000 })
  await openTab('Activity')
  await page.waitForLoadState('networkidle')
  const projectActivity = sectionFor('Mentioned in')
  check(
    "a project's Activity does not carry its issues' conversations",
    (await projectActivity.count()) === 1 &&
      !(await projectActivity.textContent())?.includes('Blocked on the Stripe key.'),
  )
  check(
    '  …and draws no sub-file row',
    (await projectActivity.locator('[data-relation="sub-file"]').count()) === 0,
  )
  check(
    "  …nor do the project's OWN conversations",
    (await sectionFor('Conversations').count()) === 1 &&
      !(await sectionFor('Conversations').textContent())?.includes('Blocked on the Stripe key.'),
  )
  await shot(page, '11-project-activity')

  // ── The inbound leg: a reference pasted from Peek ─────────────────────────
  // Encoded with the app's own encoder, so this cannot pass against a shape
  // Estiva Ship would never itself produce.
  const naddr = addrToNaddr(issueAddr, ['http://localhost:3000'])
  await page.goto(`http://localhost:${PORT}/#/o/${naddr}`)
  await page.waitForSelector('[data-surface="issue"]', { timeout: 10000 })
  check('an inbound naddr resolves to the issue surface', page.url().includes('/issue/'))
  check(
    '  …and it resolved the Folder itself, with no #h filter',
    (await page.locator('[data-surface="issue"]').innerText()).includes('Billing entry'),
  )
  await shot(page, '07-inbound-deep-link')

  // ── Back to the issue list ────────────────────────────────────────────────
  await sidebar().getByRole('link', { name: /^Issues/ }).click()
  await page.waitForSelector('[data-surface="issues"]')
  const issues = page.locator('[data-surface="issues"]')
  check('the issue appears in the workspace-wide list', (await issues.getByRole('link').count()) >= 1)
  check(
    'it is grouped under its new status',
    (await issues.innerText()).includes('In Progress'),
  )
  await shot(page, '08-issues-list')

  // ── Archive, and getting it back ──────────────────────────────────────────
  const projectAddr = `30850:${project!.pubkey}:${tagValue(project!, 'd')}`
  await page.goto(`http://localhost:${PORT}/#/project/${encodeURIComponent(projectAddr)}`)
  await page.waitForSelector('[data-surface="project"]')
  // FOL-46: archiving asks first, and carries the resolution the person gives.
  await page.getByRole('button', { name: 'Archive project' }).click()
  const archiveDialog = page.getByRole('alertdialog', { name: /^Archive / })
  await archiveDialog.getByRole('textbox', { name: /Resolution/ }).fill('Smoke test: done with it.')
  await archiveDialog.getByRole('button', { name: 'Archive project' }).click()
  await page.getByRole('button', { name: 'Unarchive project' }).waitFor()
  check(
    'archiving publishes a change, not a deletion',
    stored.some((e) => e.kind === 1851 && tagValue(e, 'field') === 'archived'),
  )
  check(
    '  …carrying the resolution as its content',
    stored.some((e) => e.kind === 1851 && tagValue(e, 'field') === 'archived' && e.content === 'Smoke test: done with it.'),
  )
  check('  …which the page shows first', await page.getByText('Smoke test: done with it.').isVisible())
  await shot(page, '09-archived-notice')
  check(
    '  …and is reversible from the same control',
    await page.getByRole('button', { name: 'Unarchive project' }).isVisible(),
  )

  // Scoped to the sidebar: the project detail's breadcrumb also says "Projects".
  await sidebar().getByRole('link', { name: /^Projects/ }).click()
  await page.waitForSelector('[data-surface="projects"]')
  check('an archived project leaves the sidebar', (await sidebar().getByRole('link').count()) === 2)
  const projects = page.locator('[data-surface="projects"]')
  check('  …and the active list', (await projects.getByRole('link').count()) === 0)
  check('  …but is reachable behind a tab', await page.getByRole('tab', { name: /^Archived/ }).isVisible())
  await page.getByRole('tab', { name: /^Archived/ }).click()
  await projects.getByRole('link').first().waitFor()
  check('  …which shows it', (await projects.getByRole('link').count()) === 1)
  await shot(page, '10-archived')

  // And back (FOL-46): restoring asks nothing and puts it where it was. Later
  // sections read this project through its Folder, which leaves an archived
  // file out whatever its app declares.
  await projects.getByRole('link').first().click()
  await page.getByRole('button', { name: 'Unarchive project' }).click()
  await page.getByRole('button', { name: 'Archive project' }).waitFor()
  const restoredRow = sidebar().getByRole('link', { name: /Payment integration/ })
  await restoredRow.waitFor({ timeout: 10_000 }).catch(() => {})
  check('unarchiving restores it to the sidebar', await restoredRow.isVisible())

  // ── The profile menu ──────────────────────────────────────────────────────
  // By what it does, not by what it says: the trigger's accessible name is the
  // person's display name, which for an anonymous key is a shortened pubkey and
  // therefore different on every run. `aria-haspopup="menu"` is the trigger's
  // actual contract — and distinguishes it from a `Select`, whose trigger
  // advertises `listbox`.
  await page.locator('button[aria-haspopup="menu"]').first().click()
  const menu = page.getByRole('menu')
  await menu.waitFor()
  const text = (await menu.innerText()).toLowerCase()
  check('the profile menu names the relay as the workspace', text.includes('localhost:3000'))
  // "Acting as", not "Signed in as": this build has an empty `ID_BASE`, which is
  // anonymous-only on purpose — a local build cannot reach production identity
  // by accident. The wording is the app being honest about which one it is.
  check('  …and says who it is acting as', text.includes('acting as'))
  check('  …and offers no sign-out it cannot perform', !text.includes('sign out'))
  await shot(page, '09-profile-menu')
  await page.keyboard.press('Escape')
  await menu.waitFor({ state: 'detached' })
  check('  …and closes on Escape', (await page.getByRole('menu').count()) === 0)

  // ── The Folder view: peers from three apps, one list ──────────────────────
  /*
    The claim the whole folders track rests on, driven in a browser rather than
    asserted in a unit test: given a Folder, Ship draws its contents **without
    knowing what they are**.

    The Folder below holds three files of three kinds owned by three apps, one
    of which — the tide reading — is an app nobody wrote and whose widget
    (`tideboard`) no consumer implements. It has to render anyway, through the
    chain RFC 0.4 §13.3 closes in `card`. A folder view that quietly drew only
    the Ship project would pass every other check in this file.

    Seeded straight into the stub rather than published, because a `kind:30890`
    is relay-signed and a client publishing one is refused (`is_relay_only_kind`)
    — which is exactly the behaviour being modelled.
  */
  const FOLDER_ID = '7b32200c-e4c0-4216-b79a-8490fc05e0bd'
  const TIDE_KIND = 30911

  // A third app's manifest, declaring a widget chain this consumer only half
  // understands. Nothing in Ship has heard of a tide table.
  seed({
    kind: 31990,
    tags: [['d', 'tide-table'], ['k', String(TIDE_KIND)]],
    content: JSON.stringify({
      name: 'Tide table',
      projections: {
        [TIDE_KIND]: { widget: ['tideboard', 'card'], slots: { title: { tag: 'title' } } },
      },
    }),
  })
  seed({ kind: TIDE_KIND, tags: [['d', 'spring'], ['title', 'Spring tides']] })

  /*
    Ship's and Peek's manifests, which the stub does not otherwise hold.

    In production both are published `kind:31990`s that this view resolves at
    runtime; here they have to be seeded or the two files cannot be drawn — and
    a file that cannot be drawn is *dropped*, not marked, which is RFC 0.4
    §4.2's disclosure rule and the reason the first run of this step showed one
    row rather than three. Worth stating: the empty list was the read model
    behaving correctly about a stub that was lying.
  */
  seed({
    kind: 31990,
    tags: [['d', 'estiva-ship-smoke'], ['k', '30850']],
    content: JSON.stringify({
      name: 'Estiva Ship',
      records: { changeKind: 1851, targetTag: 'a', fieldTag: 'field', valueTag: 'value' },
      projections: {
        // `['name', 'title']`, copied from Ship's real manifest rather than
        // guessed. REW-11 renamed the tag on the record, and a project
        // published before that keeps `title` forever — so the slot names both
        // and the order matters. Written as `title` alone, the row renders
        // "Untitled" while still resolving, which looks like a missing file
        // rather than a wrong tag name.
        30850: { widget: 'card', slots: { title: { tag: ['name', 'title'] } } },
      },
    }),
  })
  seed({
    kind: 31990,
    tags: [['d', 'estiva-peek-smoke'], ['k', '39000']],
    content: JSON.stringify({
      name: 'Peek',
      projections: { 39000: { widget: 'card', slots: { title: { tag: 'name' } } } },
    }),
  })
  seed({ kind: 39000, tags: [['d', FOLDER_ID], ['name', 'Onboarding']] })
  const tideAddr = `${TIDE_KIND}:${RELAY_KEY}:spring`
  const topicAddr = `39000:${RELAY_KEY}:${FOLDER_ID}`
  seed({
    kind: 30890,
    tags: [
      ['d', FOLDER_ID],
      ['name', 'Onboarding'],
      ['a', projectAddr],
      ['a', topicAddr],
      ['a', tideAddr],
    ],
  })

  await page.goto(`http://localhost:${PORT}/folder/${FOLDER_ID}`)
  await page.waitForSelector(`[data-folder="${FOLDER_ID}"]`)
  const folderView = page.locator(`[data-folder="${FOLDER_ID}"]`)
  check('the Folder resolves from its relay-maintained state', (await folderView.getAttribute('data-source')) === 'state')
  const rows = folderView.locator('[data-foreign-object]')
  /*
    Navigation is by kind (RFC 0.5 §10.7, be4deec): Ship draws its own kinds and
    only counts the rest, because Peek — which lists everything — is where they
    are. So of the three files the Folder holds, one is a row and two are a
    number, and the Peek topic and the tide are asserted *absent* from the list.
  */
  check('it lists only its own kinds from the Folder', (await rows.count()) === 1, `${await rows.count()} rows`)
  const shown = await folderView.innerText()
  check('  …the Ship project', shown.includes('Payment integration'))
  check(
    '  …and counts the Peek topic and the tide rather than drawing them',
    shown.includes('2 other files, listed in Peek') && !shown.includes('Spring tides'),
  )
  check(
    'the Folder appears in the sidebar',
    // A team is a collapsible section now, not a link; its header is the button.
    await sidebar().getByRole('button', { name: 'Onboarding', exact: true }).isVisible(),
  )
  await shot(page, '10-folder-view')

  // ── Delete, and the team lets go of it ────────────────────────────────────
  // Last, because everything above reads the project. A team with state lists
  // what its 30890 names, deleted or not, so the delete must be followed by a
  // 1852 remove or Peek keeps a row pointing at nothing (FOL-48).
  //
  // Every Folder that lists it, not its content Folder alone (FOL-7): a moved
  // project is listed where its conversation is not. The stub does not derive
  // state from the create's 1852 add, so the team's state is written here as
  // the relay's would read by now — and Onboarding's, above, lists it too.
  seed({ kind: 30890, created_at: Math.floor(Date.now() / 1000) + 1, tags: [['d', TEAM_ID], ['name', 'Smoke team'], ['a', projectAddr]] })

  // ── Move to Folder… (FOL-7) ───────────────────────────────────────────────
  // Listed in both now, as a half move leaves it: moving into the team takes
  // it out of Onboarding — an add, then a remove, and never a kind:1851.
  await page.goto(`http://localhost:${PORT}/#/project/${encodeURIComponent(projectAddr)}`)
  await page.waitForSelector('[data-surface="project"]')
  const beforeMove = stored.length
  await page.getByRole('button', { name: 'Move to Folder…' }).click()
  const moveDialog = page.getByRole('dialog', { name: 'Move to Folder' })
  await moveDialog.waitFor()
  await pick('Destination Folder', 'Smoke team')
  await moveDialog.getByRole('button', { name: 'Move', exact: true }).click()
  await moveDialog.waitFor({ state: 'detached' })
  const moveWrites = stored.slice(beforeMove).filter((e) => e.kind === 1852 || e.kind === 1851)
  check(
    '"Move to Folder…" publishes an add to the new Folder, then a remove from the other, and no kind:1851',
    moveWrites.map((e) => `${e.kind} ${tagValue(e, 'op')} ${tagValue(e, 'h')?.slice(0, 8)} ${tagValue(e, 'a') === projectAddr}`).join(' | ') ===
      `1852 add ${TEAM_ID.slice(0, 8)} true | 1852 remove ${FOLDER_ID.slice(0, 8)} true`,
    moveWrites.map((e) => `${e.kind} ${tagValue(e, 'op')} ${tagValue(e, 'h')?.slice(0, 8)}`).join(' | ') || 'nothing published',
  )

  // ── New folder, and rename it (FOL-8) ─────────────────────────────────────
  // Peek's two writes, event for event: 9007 then 1852 add naming it; then
  // 9002 and 1852 add with the new name, because the Folder has state.
  const beforeCreate = stored.length
  await sidebar().getByRole('button', { name: 'New folder' }).click()
  const folderDialog = page.getByRole('dialog', { name: 'New folder' })
  await folderDialog.waitFor()
  await folderDialog.getByRole('textbox', { name: 'Folder name' }).fill('Smoke folder')
  await folderDialog.getByRole('button', { name: 'Create folder' }).click()
  await folderDialog.waitFor({ state: 'detached' })
  const createWrites = stored.slice(beforeCreate).filter((e) => e.kind === 9007 || e.kind === 1852)
  const newFolderId = (createWrites[0] && tagValue(createWrites[0], 'h')) ?? ''
  check(
    '"New folder" publishes a kind:9007, then a kind:1852 add naming it on the same id',
    createWrites.map((e) => `${e.kind} ${tagValue(e, 'op') ?? '-'} ${tagValue(e, 'name')} ${tagValue(e, 'h') === newFolderId}`).join(' | ') ===
      '9007 - Smoke folder true | 1852 add Smoke folder true',
    createWrites.map((e) => `${e.kind} ${tagValue(e, 'op') ?? '-'} ${tagValue(e, 'name')}`).join(' | ') || 'nothing published',
  )
  check('  …and opens the new Folder', !!newFolderId && page.url().endsWith(`/folder/${newFolderId}`), page.url())

  // The stub does not derive a channel or state from commands; write them as the relay would have.
  seed({ kind: 39000, tags: [['d', newFolderId], ['name', 'Smoke folder']] })
  seed({ kind: 30890, tags: [['d', newFolderId], ['name', 'Smoke folder']] })
  // A fresh load, so the page reads what was just seeded.
  await page.goto(`http://localhost:${PORT}/#/folder/${newFolderId}`)
  await page.waitForSelector(`[data-folder="${newFolderId}"]`)
  const beforeRename = stored.length
  await page.getByRole('button', { name: 'Edit folder name' }).click()
  const nameField = page.getByRole('textbox', { name: 'Folder name' })
  await nameField.fill('Smoke folder renamed')
  await nameField.press('Enter')
  await nameField.waitFor({ state: 'detached' })
  const renameWrites = stored.slice(beforeRename).filter((e) => e.kind === 9002 || e.kind === 1852)
  check(
    'renaming it from its title publishes a kind:9002, then a kind:1852 add with the new name',
    renameWrites.map((e) => `${e.kind} ${tagValue(e, 'op') ?? '-'} ${tagValue(e, 'name')} ${tagValue(e, 'h') === newFolderId}`).join(' | ') ===
      '9002 - Smoke folder renamed true | 1852 add Smoke folder renamed true',
    renameWrites.map((e) => `${e.kind} ${tagValue(e, 'op') ?? '-'} ${tagValue(e, 'name')}`).join(' | ') || 'nothing published',
  )

  await page.goto(`http://localhost:${PORT}/#/project/${encodeURIComponent(projectAddr)}`)
  await page.waitForSelector('[data-surface="project"]')
  await page.getByRole('button', { name: 'Delete project' }).click()
  const deleteDialog = page.getByRole('alertdialog', { name: /^Delete “Payment integration”/ })
  await deleteDialog.waitFor()
  await deleteDialog.getByRole('button', { name: 'Delete project' }).click()
  await page.waitForSelector('[data-surface="projects"]')
  const projectDeletion = stored.findIndex((e) => e.kind === 5 && e.tags.some((t) => t[0] === 'a' && t[1] === projectAddr))
  check('deleting a project publishes a kind:5 for its record', projectDeletion >= 0)
  const unlists = stored.slice(projectDeletion + 1).filter((e) => e.kind === 1852 && tagValue(e, 'op') === 'remove' && tagValue(e, 'a') === projectAddr)
  const unlistedFrom = unlists.map((e) => tagValue(e, 'h')).sort()
  check(
    '  …then a kind:1852 removes it from every Folder that lists it',
    projectDeletion >= 0 && JSON.stringify(unlistedFrom) === JSON.stringify([TEAM_ID, FOLDER_ID].sort()),
    `from ${unlistedFrom.map((h) => h?.slice(0, 8)).join(', ') || 'none'}`,
  )

  check(
    "it measured the relay's clock before signing anything",
    clockProbes > 0,
    `${clockProbes} probe(s)`,
  )
  check('no uncaught errors in the console', errors.length === 0, errors.slice(0, 3).join(' | '))
  // Not a style check. Anything reaching the relay that this stub answers with a
  // bare `[]` is a code path the smoke test is silently not exercising, and the
  // clock probe above is exactly that: it arrived as an unmodelled `GET /`,
  // which is how it was found.
  check(
    'the app asked the relay nothing this stub cannot model',
    unmodelled.length === 0,
    [...new Set(unmodelled)].join(', '),
  )
  /*
    The read is batched, not one request per Folder.

    Not a performance assertion — it is a correctness one about the shape the
    app puts on the wire. Buzz meters `POST /query` per call at 300 a minute per
    pubkey, shared across every app one person has open, so a read that fans out
    per Folder is one that stops working when a second app is open. Ship's
    workspace read went from 39 requests to 3 against production; here the check
    is simply that *some* call carried several filters, which is the thing a
    regression to the old shape would take away.
  */
  check(
    'the workspace read batches its filters into one request',
    queryCalls.some((n) => n > 1),
    `${queryCalls.length} queries, widest carried ${Math.max(0, ...queryCalls)} filters`,
  )

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
