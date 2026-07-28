/**
 * Unit tests for the parts that fail silently.
 *
 * Three things in this app go wrong without an error: an event written with the
 * wrong `h` (rejected at ingest, or worse, accepted into a container nobody
 * reads), a route that does not survive a round trip through the URL bar, and
 * an issue whose status is outside the vocabulary and vanishes from every list.
 * None of them are visible in a screenshot, so they are pinned here.
 *
 * No DOM: everything below is pure. Rendering is checked by `smoke.ts`.
 *
 *   npx tsx scripts/app.test.ts
 */
import { buildChange, buildIssue, buildProject } from '../src/events'
import { foldFolder, projectFolders, type Change, type Project } from '../src/fold'
import { href, parse } from '../apps/linear-lite/router'
import { byStatus } from '../apps/linear-lite/views/issue-list'
import type { Issue } from '../src/fold'

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures++
}

const PK = 'a'.repeat(64)
const CONTENT = '22222222-2222-4222-8222-222222222222'
const TOPIC = '33333333-3333-4333-8333-333333333333'
const tag = (event: { tags: string[][] }, name: string) =>
  event.tags.find((t) => t[0] === name)?.[1]

// ── Folder placement ────────────────────────────────────────────────────────

console.log('\n# which Folder each event lands in\n')

const project = buildProject(PK, Date.now(), {
  projectId: 'p1',
  title: 'Payment integration',
  folder: CONTENT,
})
check('a project record lives in the project\'s own Folder', tag(project, 'h') === CONTENT)
check('  …and carries no separate index pointer', tag(project, 'folder') === undefined)

const issue = buildIssue(PK, Date.now(), {
  issueId: 'i1',
  title: 'Billing entry',
  folder: CONTENT,
  projectAddr: `30850:${PK}:p1`,
})
check('an issue lives in the project Folder', tag(issue, 'h') === CONTENT)
check('  …and still names its parent project', tag(issue, 'a') === `30850:${PK}:p1`)

const statusChange = buildChange(PK, Date.now(), {
  target: `30851:${PK}:i1`,
  field: 'status',
  value: 'done',
  folder: CONTENT,
})
check('a change to an issue carries the issue\'s Folder', tag(statusChange, 'h') === CONTENT)

const projectChange = buildChange(PK, Date.now(), {
  target: `30850:${PK}:p1`,
  field: 'status',
  value: 'completed',
  folder: CONTENT,
})
check('a change to a project carries that same Folder', tag(projectChange, 'h') === CONTENT)

// The whole point: one container. Access to the Peek topic is access to the
// project, its issues and its history, with nothing left in a second place.
check(
  'every event about the project shares one h',
  new Set([project, issue, statusChange, projectChange].map((e) => tag(e, 'h'))).size === 1,
)

// ── Folding across containers ───────────────────────────────────────────────

console.log('\n# folding one project Folder\n')

const sign = <T extends object>(event: T, id: string) => ({ ...event, id, sig: '' }) as never
const folded = foldFolder([
  sign(project, 'e1'),
  sign(issue, 'e2'),
  sign(statusChange, 'e3'),
  sign(projectChange, 'e4'),
])

check('the project folds back', folded.projects.length === 1)
check('the issue folds back', folded.issues.length === 1)
check('the issue took its change', folded.issues[0]?.status === 'done')
check('the project took its change', folded.projects[0]?.status === 'completed')
check('the project reports its Folder', folded.projects[0]?.contentFolder === CONTENT)

// ── Re-linking a project to a Peek topic ────────────────────────────────────

console.log('\n# re-linking a project to an existing Peek topic\n')

const relink: Change = {
  id: 'e5',
  author: PK,
  createdAt: Math.floor(Date.now() / 1000),
  target: `30850:${PK}:p1`,
  field: 'folder',
  value: TOPIC,
  note: '',
}
const relinked: Project = { ...folded.projects[0], contentFolder: TOPIC }

check(
  'the project now points at the topic',
  projectFolders(relinked, [relink]).at(-1) === TOPIC,
)
// The wrinkle that would otherwise lose data: events already written cannot
// move, so the reader has to keep asking the old container too.
check(
  'the original Folder is still read',
  projectFolders(relinked, [relink]).includes(CONTENT),
  projectFolders(relinked, [relink]).map((f) => f.slice(0, 4)).join(' → '),
)
check(
  'and the union is ordered oldest first',
  projectFolders(relinked, [relink])[0] === CONTENT,
)

// ── Routing ─────────────────────────────────────────────────────────────────

console.log('\n# routes survive a round trip through the URL\n')

const routes = [
  { name: 'issues' },
  { name: 'projects' },
  { name: 'project', addr: `30850:${PK}:p1`, view: 'table' },
  { name: 'project', addr: `30850:${PK}:p1`, view: 'board' },
  { name: 'issue', addr: `30851:${PK}:i1` },
] as const

for (const route of routes) {
  const back = parse(href(route))
  check(
    `${route.name}${'view' in route ? `:${route.view}` : ''} round-trips`,
    JSON.stringify(back) === JSON.stringify(route),
    href(route),
  )
}

check('an unknown hash falls back to the issue list', parse('#/nonsense').name === 'issues')
check('an empty hash is the issue list', parse('').name === 'issues')
check('an inbound naddr is recognised', parse('#/o/naddr1abc').name === 'inbound')
check(
  'an unknown project view falls back to the default',
  (parse('#/project/x?view=nonsense') as { view: string }).view === 'table',
)
check(
  'the default view is not written into the URL',
  !href({ name: 'project', addr: 'x', view: 'table' }).includes('view='),
)

// ── Grouping ────────────────────────────────────────────────────────────────

console.log('\n# an issue is never invisible\n')

const stub = (status: string): Issue => ({
  addr: `30851:${PK}:${status}`,
  id: status,
  author: PK,
  createdAt: 0,
  title: status,
  description: '',
  folder: CONTENT,
  status,
  fields: {},
})

const groups = byStatus([stub('todo'), stub('done'), stub('escalated')])
check('known statuses group in vocabulary order', groups[0]?.status === 'todo')
check('empty groups are dropped', !groups.some((group) => group.issues.length === 0))
check(
  'a status written by another app still gets a group',
  groups.some((group) => group.status === 'escalated'),
  groups.map((g) => g.status).join(', '),
)
check(
  'every issue appears exactly once',
  groups.reduce((total, group) => total + group.issues.length, 0) === 3,
)

console.log(failures === 0 ? '\nApp logic OK.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
