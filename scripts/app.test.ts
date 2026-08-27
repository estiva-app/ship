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
import { buildChange, buildConversationMessage, buildIssue, buildProject } from '../src/events'
import { buildManifest } from '../src/manifest'
import { foldFolder, projectFolders, type Change, type Project } from '../src/fold'
import { directoryFrom, initials, parseProfile } from '../src/profiles'
import { href, parse } from '../apps/ship/router'
import { byStatus } from '../apps/ship/views/issue-list'
import type { Issue } from '../src/fold'
import type { SignedEvent } from '@estiva-app/protocol'

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
  description: 'Take card payments',
  folder: CONTENT,
})
check('a project record names its Folder without being filed in it', tag(project, 'buzz-channel') === CONTENT)
check('  …so it carries no h at all, which is what makes it discoverable', tag(project, 'h') === undefined)
check('  …and carries no separate index pointer', tag(project, 'folder') === undefined)
check('  …upstream vocabulary: name, not title', tag(project, 'name') === 'Payment integration' && tag(project, 'title') === undefined)
check('  …description is a tag, and content is empty', tag(project, 'description') === 'Take card payments' && project.content === '')

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

// Still one container — but the record now *names* it instead of sitting in it.
// Access to the Peek topic is access to the issues, the history and the
// conversation; the record itself is public and points at the same uuid.
check(
  'every event *inside* the project shares one h',
  new Set([issue, statusChange, projectChange].map((e) => tag(e, 'h'))).size === 1,
)
check(
  '  …and the record points at that same Folder from outside it',
  tag(project, 'buzz-channel') === tag(issue, 'h'),
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

// ── Two project wire shapes, read together ──────────────────────────────────

/*
  REW-11 moves the project record off its channel: `h` → `buzz-channel`,
  `title` → `name`, and the description out of `.content` into a tag. Records
  written before that keep the old shape **forever** — a replaceable event can
  only be rewritten by its author, and rewriting stamps a fresh `created_at`
  the relay will not let us backdate past ±15 minutes.

  So the two shapes coexist permanently, and the failure they would cause is
  silent: a reader that stops understanding `h` does not error, it renders a
  project whose Folder is the empty string and whose issues have all vanished.
  These pin both directions.
*/

console.log('\n# a project record in either wire shape\n')

const globalProject: SignedEvent = sign(
  {
    pubkey: PK,
    created_at: Math.floor(Date.now() / 1000),
    kind: 30850,
    tags: [
      ['d', 'p2'],
      ['name', 'Payment integration'],
      ['description', 'Take card payments'],
      ['buzz-channel', CONTENT],
      ['lead', PK],
    ],
    content: '',
  },
  'g1',
)

const bothShapes = foldFolder([sign(project, 'e1'), globalProject])
const legacy = bothShapes.projects.find((p) => p.id === 'p1')
const global_ = bothShapes.projects.find((p) => p.id === 'p2')

check('both shapes fold', bothShapes.projects.length === 2)
check('the global record keeps its name', global_?.title === 'Payment integration')
check('  …reads its description from the tag', global_?.description === 'Take card payments')
check('  …resolves buzz-channel as its Folder', global_?.contentFolder === CONTENT)
check('  …and as the Folder its changes address', global_?.originFolder === CONTENT)
check('  …and still reports its lead', global_?.lead === PK)
check('the h-shaped record is unaffected', legacy?.contentFolder === CONTENT)
check('  …and still reads title, not name', legacy?.title === 'Payment integration')

// The one that would be invisible: a record carrying `h` reads as channel-scoped
// whatever else it says, because that is what the relay actually did with it.
const transitional = sign(
  {
    pubkey: PK,
    created_at: Math.floor(Date.now() / 1000),
    kind: 30850,
    tags: [['d', 'p3'], ['name', 'Both'], ['h', CONTENT], ['buzz-channel', TOPIC]],
    content: '',
  },
  't1',
)
check(
  'a record carrying both tags is read as channel-scoped',
  foldFolder([transitional]).projects[0]?.originFolder === CONTENT,
)

// An empty description tag is a statement, not an absence — otherwise clearing
// a description would silently resurrect whatever `.content` still held.
const clearedDescription = sign(
  {
    pubkey: PK,
    created_at: Math.floor(Date.now() / 1000),
    kind: 30850,
    tags: [['d', 'p4'], ['name', 'Cleared'], ['description', ''], ['buzz-channel', CONTENT]],
    content: 'stale prose nobody removed',
  },
  'c1',
)
check(
  'an empty description tag wins over leftover content',
  foldFolder([clearedDescription]).projects[0]?.description === '',
)

// A change still overrides the record, whichever shape the record is in.
const globalRename: SignedEvent = sign(
  buildChange(PK, Date.now(), {
    target: `30850:${PK}:p2`,
    field: 'title',
    value: 'Renamed by someone else',
    folder: CONTENT,
  }),
  'g2',
)
check(
  'a rename change still beats the record\'s own name tag',
  foldFolder([globalProject, globalRename]).projects[0]?.title === 'Renamed by someone else',
)

// ── NIP-22 comments read alongside kind:9 ───────────────────────────────────

/*
  REW-10's reader half. A `kind:9` comment is not replaceable at all — unlike a
  project record it cannot be rewritten even by its author — so the two shapes
  coexist permanently and both must land in the same thread.

  The case of the tags is the whole of NIP-22 and the easiest thing to get
  wrong: uppercase names the thread root, lowercase the immediate parent.
*/

console.log('\n# NIP-22 kind:1111 comments\n')

const ISSUE_ADDR = `30851:${PK}:i1`

const nip22Root: SignedEvent = sign(
  {
    pubkey: PK,
    created_at: Math.floor(Date.now() / 1000),
    kind: 1111,
    tags: [
      ['A', ISSUE_ADDR], ['K', '30851'], ['P', PK],
      ['a', ISSUE_ADDR], ['k', '30851'],
      ['h', CONTENT],
    ],
    content: 'A standard comment',
  },
  'c1',
)
const nip22Reply: SignedEvent = sign(
  {
    pubkey: PK,
    created_at: Math.floor(Date.now() / 1000) + 1,
    kind: 1111,
    tags: [
      ['A', ISSUE_ADDR], ['K', '30851'], ['P', PK],
      ['e', 'c1'], ['k', '1111'],
      ['h', CONTENT],
    ],
    content: 'A reply to it',
  },
  'c2',
)
// The shape Ship writes today, which must keep working forever.
const legacyComment: SignedEvent = sign(
  {
    pubkey: PK,
    created_at: Math.floor(Date.now() / 1000),
    kind: 9,
    tags: [['h', CONTENT], ['a', ISSUE_ADDR]],
    content: 'An old kind:9 comment',
  },
  'm1',
)

const convo = foldFolder([sign(issue, 'e2'), legacyComment, nip22Root, nip22Reply])
check('a 1111 comment is read at all', convo.conversations.length > 0)
check('  …it lands under the issue it names', convo.conversations.some((c) => c.about.includes(ISSUE_ADDR)))
check('  …and so does the old kind:9, in the same workspace',
  convo.conversations.filter((c) => c.about.includes(ISSUE_ADDR)).length === 2)

const thread = convo.conversations.find((c) => c.root.id === 'c1')
check('a top-level 1111 is its own conversation root', !!thread)
check('  …and its reply is grouped under it, not beside it', thread?.replies.length === 1 && thread?.replies[0]?.id === 'c2')
check('  …the reply keeps the thread anchor from the uppercase A', thread?.replies[0]?.about.includes(ISSUE_ADDR) === true)
check('the comment stays in its Folder', thread?.root.folder === CONTENT)

// Case is the trap: reading lowercase `a` as the root would put a reply in its
// own thread, and reading uppercase `E` as the parent would lose the ordering.
const miscased = foldFolder([nip22Reply])
check('a reply whose root is an address still parses', miscased.conversations.length === 1)
check('  …with the parent it names, not the root', miscased.conversations[0]?.root.parentId === 'c1')

// ── Writing a NIP-22 comment ────────────────────────────────────────────────

/*
  The writer half. Two things here are load-bearing and neither would fail a
  build: an `h` that is missing makes the comment world-readable, and a reply
  without a root would be a malformed 1111 rather than an old kind:9.
*/

console.log('\n# writing comments\n')

const ISSUE_ADDR2 = `30851:${PK}:i1`
const comment = buildConversationMessage(PK, Date.now(), {
  folder: CONTENT,
  body: 'A comment',
  about: ISSUE_ADDR2,
})

check('a comment about an object is a NIP-22 kind:1111', comment.kind === 1111)
check('  …with the object as its uppercase thread root', tag(comment, 'A') === ISSUE_ADDR2)
check('  …and the same object as the parent, being top-level', tag(comment, 'a') === ISSUE_ADDR2)
check('  …K and P derived from the address, not restated', tag(comment, 'K') === '30851' && tag(comment, 'P') === PK)
check('  …lowercase k and p mirror them', tag(comment, 'k') === '30851' && tag(comment, 'p') === PK)

// The one that is invisible if it breaks: no `h` means the relay stores it
// globally and world-readable, whatever the privacy of the issue.
check('a comment ALWAYS carries h, or it is published world-readable', tag(comment, 'h') === CONTENT)
check('  …and keeps ts, so a thread reads back in order', !!tag(comment, 'ts'))

// A message with nothing to anchor to has no NIP-22 root and must not pretend.
const plain = buildConversationMessage(PK, Date.now(), { folder: CONTENT, body: 'Just talking' })
check('a message about nothing stays a kind:9', plain.kind === 9)
check('  …and carries no A tag to be malformed by', tag(plain, 'A') === undefined)

// A reply has no anchor available, so it stays kind:9 rather than becoming a
// 1111 with no root. Both shapes fold into one thread either way.
const reply = buildConversationMessage(PK, Date.now(), {
  folder: CONTENT,
  body: 'Replying',
  replyTo: { rootId: 'r1', parentId: 'r1' },
})
check('a reply stays a kind:9 until a caller can supply the anchor', reply.kind === 9)
check('  …and threads by e, as it always did', tag(reply, 'e') === 'r1')

// The manifest is not a description of Ship, it is an instruction to Peek.
const shipManifest = buildManifest(PK, Date.now())
const commentAction = (JSON.parse(shipManifest.content) as {
  actions: { id: string; emits: { kind: number; alsoRead?: number[] } }[]
}).actions.find((a) => a.id === 'comment')!
check('the manifest tells consumers to publish 1111', commentAction.emits.kind === 1111)
check('  …and to keep reading the kind:9 it used to emit', commentAction.emits.alsoRead?.includes(9) === true)

// ── The manifest still projects a renamed tag ───────────────────────────────

/*
  REW-11 renamed the project record's title tag from `title` to `name`. Records
  published before that keep `title` permanently, so the projection has to name
  both — and the order matters, because the first that resolves wins.

  This is what actually broke: the record shape, the fold and the relay were all
  verified, and the *other app's rendering* was not. Four production records
  rendered untitled in Peek before anyone noticed.
*/

console.log('\n# the manifest projects both title spellings\n')

const manifestJson = JSON.parse(buildManifest(PK, Date.now()).content) as {
  projections: Record<string, { slots: Record<string, { tag?: string | string[] }> }>
}
const projectTitle = manifestJson.projections['30850'].slots.title
const issueTitle = manifestJson.projections['30851'].slots.title

check('the project title slot names the new spelling first', Array.isArray(projectTitle.tag) && projectTitle.tag[0] === 'name')
check('  …and keeps the old one behind it, for records that predate REW-11', Array.isArray(projectTitle.tag) && projectTitle.tag.includes('title'))
check('the issue title slot is untouched — REW-11 renamed nothing there', issueTitle.tag === 'title')

// What the builder actually writes has to match what the projection looks for,
// or the manifest is describing an app that does not exist.
const projForManifest = buildProject(PK, Date.now(), { projectId: 'p9', title: 'Named', folder: CONTENT })
check(
  'and the record really does carry the tag the projection names first',
  tag(projForManifest, 'name') === 'Named',
)

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
  { name: 'projects', archived: false },
  { name: 'projects', archived: true },
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

// ── Profiles ────────────────────────────────────────────────────────────────

// A kind:0 is a JSON blob written by another app, and a malformed one must cost
// a name rather than a screen: `parseProfile` throwing anywhere would take the
// whole directory — and with it every author line — down with it.

console.log('\n# who a pubkey is\n')

const PK2 = 'b'.repeat(64)
const profileEvent = (
  pubkey: string,
  content: string,
  createdAt = 1000,
  id = 'p',
): SignedEvent => ({ id, pubkey, kind: 0, created_at: createdAt, tags: [], content, sig: '' })

check(
  'display_name wins over name',
  parseProfile(profileEvent(PK, '{"name":"ana-ll","display_name":"Ana"}'))?.name === 'Ana',
)
check(
  'name is used when there is no display_name',
  parseProfile(profileEvent(PK, '{"name":"ana-ll"}'))?.name === 'ana-ll',
)
check(
  'picture and nip05 come through',
  parseProfile(profileEvent(PK, '{"picture":"http://x/a.png","nip05":"ana@relay"}'))?.nip05 ===
    'ana@relay',
)
check('empty strings are not names', parseProfile(profileEvent(PK, '{"name":"  "}'))?.name === undefined)
check('malformed JSON is dropped, not thrown', parseProfile(profileEvent(PK, '{"name":')) === null)
check('a non-object profile is dropped', parseProfile(profileEvent(PK, '"Ana"')) === null)
check(
  'a number where a name should be is ignored',
  parseProfile(profileEvent(PK, '{"name":42}'))?.name === undefined,
)
check(
  'a non-profile event is not a profile',
  parseProfile({ ...profileEvent(PK, '{}'), kind: 9 }) === null,
)

const directory = directoryFrom([
  profileEvent(PK, '{"name":"Old"}', 1000, 'e1'),
  profileEvent(PK, '{"name":"New"}', 2000, 'e2'),
  profileEvent(PK2, 'not json', 1000, 'e3'),
])
check('the newest profile per key wins', directory.get(PK)?.name === 'New')
check('one bad profile does not lose the good ones', directory.size === 1)

check('initials come from a two-word name', initials({ pubkey: PK, name: 'Ana Silva', createdAt: 0 }, PK) === 'AS')
check('initials fall back to the key', initials(undefined, PK) === 'AA')

console.log(failures === 0 ? '\nApp logic OK.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
