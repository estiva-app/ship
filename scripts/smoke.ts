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
 * ## It drives web/, not the vanilla app (REW-7)
 *
 * Until the cutover this built `apps/ship` with build.mjs and drove that DOM.
 * Production now serves the React app, so a smoke test of the old one measured
 * something nobody could reach — and REW-9 deletes `apps/` and `build.mjs`
 * outright, which would have taken this file with it.
 *
 * Rewritten against `web/`, which shares none of the old selectors: the vanilla
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
 *  - **A root comment is a `kind:1111` (REW-10).** A *reply* is still a
 *    `kind:9`, deliberately — see `buildNip22Comment`: a `1111` must name its
 *    root, a reply's root is the object rather than the comment it answers, and
 *    the caller cannot supply that anchor yet, so a malformed `1111` would be
 *    worse than a merely old `kind:9`. Both kinds are asserted here so the
 *    split stays visible instead of being something the fold quietly absorbs.
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
const PORT = 5191
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
  // web/vite.config.ts, which says so for this reason.
  /** Requests this stub does not model, reported rather than guessed at. */
  const unmodelled: string[] = []
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
      const hits = stored.filter((event) => filters.some((filter) => matches(event, filter)))
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

  /** `Select` is not a native `<select>`: a labelled trigger, then a listbox. */
  const pick = async (label: string, option: string | number) => {
    await page.getByRole('button', { name: label, exact: true }).click()
    await page.getByRole('listbox').waitFor()
    await (typeof option === 'string'
      ? page.getByRole('option', { name: option })
      : page.getByRole('option').nth(option)
    ).click()
    await page.getByRole('listbox').waitFor({ state: 'detached' })
  }

  const sidebar = () => page.getByRole('navigation', { name: 'Workspace' })

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
  const projectDialog = page.getByRole('dialog')
  await projectDialog.waitFor()
  check('the project form opens in a modal', await projectDialog.isVisible())
  await projectDialog.getByPlaceholder('New project title').fill('Payment integration')
  await projectDialog
    .getByPlaceholder('Description (optional)')
    .fill('Stripe Checkout for workspace billing.')
  await page.getByRole('button', { name: 'Create project' }).click()
  await page.getByRole('link', { name: /Payment integration/ }).first().waitFor()
  check('the modal closes once the project is created', (await page.getByRole('dialog').count()) === 0)

  const project = stored.find((e) => e.kind === 30850)
  const folder = stored.find((e) => e.kind === 9007)
  check('a kind:9007 was published for the project Folder', !!folder)
  check(
    'exactly one Folder was created, for the project',
    stored.filter((e) => e.kind === 9007).length === 1,
  )
  check(
    'the project record points at that Folder, and is not filed under it',
    // REW-11 made the record global: `buzz-channel` names the Folder, and there
    // is deliberately no `h`. Asserting the absence too, because a record that
    // carried both would fold correctly and still be the old shape.
    !!project && !!folder && tagValue(project, 'buzz-channel') === tagValue(folder, 'h'),
    `buzz-channel=${tagValue(project!, 'buzz-channel')?.slice(0, 8)}`,
  )
  check('  …with no `h` of its own', !!project && tagValue(project, 'h') === undefined)
  await shot(page, '02-projects')

  // ── Project detail, and an issue inside it ────────────────────────────────
  await page.getByRole('link', { name: /Payment integration/ }).first().click()
  await page.waitForSelector('[data-surface="project"][data-view="table"]')
  check('the project opens on one page, issues in table view', page.url().includes('/project/'))
  check(
    '  …with the description and conversations on the same page',
    (await sectionFor('Conversations').count()) === 1,
  )

  await page.getByRole('button', { name: 'Add issue' }).click()
  const issueDialog = page.getByRole('dialog')
  await issueDialog.waitFor()
  await issueDialog.getByPlaceholder(/^New issue in /).fill('Billing entry + add payment method')
  await page.getByRole('button', { name: 'Create issue' }).click()
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
    'the toggle swaps the list in place, same page',
    (await sectionFor('Conversations').count()) === 1 && page.url().includes('/project/'),
  )
  const board = page.locator('[data-surface="project"][data-view="board"]')
  check('the board renders a column per status', (await board.locator('section section').count()) === 4)
  check(
    'the issue starts in the first column',
    (await board.locator('section section').first().getByRole('link').count()) === 1,
  )
  await shot(page, '05-project-board')

  // ── Issue detail, and a status change ─────────────────────────────────────
  await board.locator('section section').first().getByRole('link').first().click()
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
  */
  const description = page.getByRole('button', { name: 'Edit description' })
  await description.focus()
  await description.click()
  const editor = page.getByRole('textbox', { name: 'Description' })
  await editor.waitFor()
  check('the description opens an editor, not a textarea', (await page.locator('textarea').count()) === 0)

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

  // Blur commits, the way `EditableText` always did.
  await page.getByRole('heading', { name: 'Activity' }).click()
  await page.locator('[data-block-id] h1, h1[data-block-id]').first().waitFor()
  const readingBox = await page.locator('[aria-label="Edit description"]').locator('..').boundingBox()
  check(
    'the field is the same size reading and writing — the report itself',
    !!editingBox && !!readingBox && Math.abs(editingBox.height - readingBox.height) < 24,
    `editing ${Math.round(editingBox?.height ?? 0)}px, reading ${Math.round(readingBox?.height ?? 0)}px`,
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

  const activity = sectionFor('Activity')
  await pick('Status', 'In Progress')
  await activity.locator('li').first().waitFor()
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
  await conversations.getByPlaceholder('Start a conversation…').fill('Blocked on the Stripe key.')
  await conversations.getByRole('button', { name: 'Post', exact: true }).click()
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

  await conversations.getByPlaceholder('Reply…').first().fill('Key is in 1Password now.')
  await conversations.getByRole('button', { name: 'Reply', exact: true }).first().click()
  await page.waitForFunction(
    () => document.querySelectorAll('section article').length >= 2,
  )
  // Still a kind:9, deliberately — see the header. This asserts the split rather
  // than the aspiration, so the day a reply becomes a 1111 this fails loudly.
  const reply = stored.filter((e) => e.kind === 9).at(-1)
  check('a reply is still a kind:9, by design', !!reply)
  check(
    '  …threaded under the root comment',
    !!reply && !!comment && reply.tags.some((t) => t[0] === 'e' && t[1] === comment.id),
  )
  check('  …and renders nested', (await conversations.locator('article').count()) === 2)

  /*
    Waits for one more activity row than there were, not for "more than one".

    The absolute count is already true before the click as soon as anything
    else has written to this issue, so the wait returns immediately and the
    assertion below reads `stored` before the change reaches it. Nothing about
    the app is wrong; the check simply measures a moment too early, and it
    stays green only while this issue has exactly one prior change.
  */
  const activityRows = await page.locator('section li').count()
  await pick('Assignee', 1)
  await page.waitForFunction((n) => document.querySelectorAll('section li').length > n, activityRows)
  check(
    'assigning publishes a second change',
    stored.filter((e) => e.kind === 1851 && tagValue(e, 'field') === 'assignee').length === 1,
  )
  await shot(page, '06-issue-detail')

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
  await page.getByRole('button', { name: 'Archive project' }).click()
  await page.getByRole('button', { name: 'Unarchive project' }).waitFor()
  check(
    'archiving publishes a change, not a deletion',
    stored.some((e) => e.kind === 1851 && tagValue(e, 'field') === 'archived'),
  )
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
