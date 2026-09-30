/**
 * Unit tests for the parts that fail silently.
 *
 * What goes wrong without an error here: an event written with the wrong `h` —
 * accepted into a container nobody reads, which is what measuring it against
 * production actually showed rather than the ingest rejection assumed here — a
 * manifest that misdescribes what the app can do, and a `kind:0` from another
 * app that costs a whole directory rather than one name. None of them are
 * visible in a screenshot, so they are pinned here.
 *
 * Two more used to be: a route that does not survive a round trip through the
 * URL bar, and an issue whose status is outside the vocabulary and vanishes from
 * every list. Both subjects moved into `web/` with the rewrite, so their checks
 * moved with them (REW-9) — routing to `src/router.test.tsx`, grouping to
 * `src/components/batch2.test.tsx`. They are not gone, and this note is here
 * because a deleted test and a relocated one look identical in a diff.
 *
 * No DOM: everything below is pure. Rendering is checked by `smoke.ts`.
 *
 *   npx tsx scripts/app.test.ts
 */
import { buildChange, buildConversationMessage, buildIssue, buildProject } from '../src/nostr/events'
import { buildManifest } from '../src/nostr/manifest'
import { KIND } from '../src/nostr/kinds'
import { foldFolder, projectFolders, type Change, type Project } from '../src/nostr/fold'
import { foldAttachments } from '../src/nostr/attachments'
import { directoryFrom, initials, parseProfile } from '../src/nostr/profiles'
import type { SignedEvent } from '@estiva-app/protocol'
import { actionProblems } from '@estiva-app/interop'

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
check('  …and a status change names nobody', tag(statusChange, 'p') === undefined && tag(projectChange, 'p') === undefined)

const WHO = 'c'.repeat(64)
const assign = buildChange(PK, Date.now(), { target: `30851:${PK}:i1`, field: 'assignee', value: WHO, folder: CONTENT })
const lead = buildChange(PK, Date.now(), { target: `30850:${PK}:p1`, field: 'lead', value: WHO, folder: CONTENT })
const unassign = buildChange(PK, Date.now(), { target: `30851:${PK}:i1`, field: 'assignee', value: '', folder: CONTENT })
check('assigning an issue names the assignee as a p tag (FOL-30)', tag(assign, 'p') === WHO)
check('  …and so does making someone a project lead', tag(lead, 'p') === WHO)
check('  …while clearing an assignment names nobody', tag(unassign, 'p') === undefined)
check('  …and the fixed four keep their order ahead of it', assign.tags.slice(0, 4).map((t) => t[0]).join(',') === 'a,field,value,h')

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

// ── A ref can arrive after the issue does ───────────────────────────────────

/*
  An issue created by another app through the manifest carries no `ref`: a
  display key is the project title's first three letters and a count of its
  siblings, so only Ship can compute one. And Ship cannot add it to the root —
  a NIP-33 address is `(kind, pubkey, d)`, so the root belongs permanently to
  whoever signed it. A change event is the only move available.

  Measured on production when this was found: 168 of 170 issues carried a ref,
  and the one created from Peek showed a dash for ever while its status and
  assignee arrived normally — because those were folded and this was not. `ref`
  was the only field on an issue read from the root alone.
*/
console.log('\n# a ref can be assigned after the fact\n')

const unreffed = buildIssue(PK, Date.now(), {
  issueId: 'i2',
  title: 'Testing issue created directly from Peek',
  folder: CONTENT,
  projectAddr: `30850:${PK}:p1`,
})
check('an issue may be created with no ref at all', tag(unreffed, 'ref') === undefined)

const refChange = buildChange(PK, Date.now(), {
  target: `30851:${PK}:i2`,
  field: 'ref',
  value: 'PAY-7',
  folder: CONTENT,
})
const withLateRef = foldFolder([sign(project, 'r1'), sign(unreffed, 'r2'), sign(refChange, 'r3')])
check('  …and take a ref from the change stream afterwards', withLateRef.issues[0]?.ref === 'PAY-7')

const refOnRoot = buildIssue(PK, Date.now(), {
  issueId: 'i3',
  title: 'Filed in Ship',
  folder: CONTENT,
  projectAddr: `30850:${PK}:p1`,
  ref: 'PAY-1',
})
const rootOnly = foldFolder([sign(project, 's1'), sign(refOnRoot, 's2')])
check('  …while a ref written on the root still reads, as every existing issue does', rootOnly.issues[0]?.ref === 'PAY-1')

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

/*
  Attaching a file — SHI-2, the other end of `attachments.ts`.

  Checked as a round trip rather than by reading the tag back by hand: the
  producer and the reader are two halves of the same feature and this is the
  only place both are in scope. A tag that serialises fine and folds to nothing
  is exactly the failure this pins — Ship would draw a message with no
  attachment on it and say nothing about why.
*/
const FILE_SHA = 'f'.repeat(64)
const SECOND_SHA = 'e'.repeat(64)
const file = { url: `/media/${FILE_SHA}.png`, m: 'image/png', x: FILE_SHA, size: 4096 }
const second = { url: `/media/${SECOND_SHA}.png`, m: 'image/png', x: SECOND_SHA, size: 8192 }
/* The fold takes signed events. Nothing here verifies a signature, so an id is
   all these need to be indexable. */
const asSigned = (event: { tags: string[][]; kind: number; content: string; pubkey: string; created_at: number }, id: string): SignedEvent =>
  ({ ...event, id, sig: '0'.repeat(128) }) as SignedEvent

const withFile = buildConversationMessage(PK, Date.now(), { folder: CONTENT, body: 'Here it is', files: [file] })
check('a message can carry a file', foldAttachments([asSigned(withFile, 'm1')]).m1?.[0]?.x === FILE_SHA)

const commentWithFile = buildConversationMessage(PK, Date.now(), { folder: CONTENT, body: 'Look', about: ISSUE_ADDR2, files: [file] })
check('a comment carries one too, on the 1111 branch', commentWithFile.kind === 1111 && foldAttachments([asSigned(commentWithFile, 'm2')]).m2?.[0]?.x === FILE_SHA)
check('  …and the comment keeps its NIP-22 root', tag(commentWithFile, 'A') === ISSUE_ADDR2)

const two = buildConversationMessage(PK, Date.now(), { folder: CONTENT, body: 'Both', files: [file, second] })
check('several files keep the order they were attached in', foldAttachments([asSigned(two, 'm3')]).m3?.map((f) => f.x).join() === `${FILE_SHA},${SECOND_SHA}`)

// A message that attached nothing must carry no `imeta` at all. An empty tag
// would be a claim about a blob the relay does not hold, and ingest refuses the
// whole message for it.
check('a message with no files carries no imeta', plain.tags.every((t) => t[0] !== 'imeta'))

/*
  A description's files reach the change event as tags — SPEC §13.3, SHI-2.

  The point of the requirement, and so of these checks: ingest verifies `imeta`
  **tags** and never parses `content`. Without the tag a description could name
  a blob the relay does not hold and nothing would refuse it — where a message
  physically cannot. `buildChange` derives them from the document so that no
  caller can leave them off.
*/
const BLOCKS_FORMAT = 'estiva-blocks-1'
const descriptionWith = (...attachments: Record<string, unknown>[]) =>
  JSON.stringify({
    type: 'doc',
    content: [
      { type: 'paragraph', id: 'b1', content: [{ type: 'text', text: 'here it is' }] },
      ...attachments.map((attrs, i) => ({ type: 'attachment', id: `b${i + 2}`, attrs })),
    ],
  })
const descFile = { url: `/media/${FILE_SHA}.png`, m: 'image/png', x: FILE_SHA, size: 4096 }

const described = buildChange(PK, Date.now(), {
  target: ISSUE_ADDR2,
  field: 'description',
  value: descriptionWith(descFile),
  folder: CONTENT,
  contentFormat: BLOCKS_FORMAT,
})
const imetaTags = described.tags.filter((t) => t[0] === 'imeta')
check('a description with a file names it in an imeta tag', imetaTags.length === 1)
check('  …carrying the blob hash ingest will look for', imetaTags[0]?.some((part) => part === `x ${FILE_SHA}`) === true)
check('  …and the value tag still holds the document', tag(described, 'value') === descriptionWith(descFile))
check('  …with the content-format the reader needs', tag(described, 'content-format') === BLOCKS_FORMAT)

const twoFiles = buildChange(PK, Date.now(), {
  target: ISSUE_ADDR2,
  field: 'description',
  value: descriptionWith(descFile, { ...descFile, x: SECOND_SHA, url: `/media/${SECOND_SHA}.png` }),
  folder: CONTENT,
  contentFormat: BLOCKS_FORMAT,
})
check('two files become two tags', twoFiles.tags.filter((t) => t[0] === 'imeta').length === 2)

// Every other field goes through the same builder, and a scalar has no
// document to read. A `status` change growing an imeta tag would be nonsense
// the relay would then try to verify.
const scalarChange = buildChange(PK, Date.now(), {
  target: ISSUE_ADDR2,
  field: 'status',
  value: 'in_progress',
  folder: CONTENT,
})
check('a scalar change carries no imeta', scalarChange.tags.every((t) => t[0] !== 'imeta'))

const plainDescription = buildChange(PK, Date.now(), {
  target: ISSUE_ADDR2,
  field: 'description',
  value: 'just words, no blocks',
  folder: CONTENT,
})
check('  …and neither does a marker-text description', plainDescription.tags.every((t) => t[0] !== 'imeta'))

// The manifest is not a description of Ship, it is an instruction to Peek.
const shipManifest = buildManifest(PK, Date.now())
const commentAction = (JSON.parse(shipManifest.content) as {
  actions: { id: string; emits: { kind: number; alsoRead?: number[] } }[]
}).actions.find((a) => a.id === 'comment')!
check('the manifest tells consumers to publish 1111', commentAction.emits.kind === 1111)
check('  …and to keep reading the kind:9 it used to emit', commentAction.emits.alsoRead?.includes(9) === true)

// ── Every action says what it does and what it costs (PRO-5) ───────────────

/*
  `ManifestContent.actions` is `unknown[]` on purpose: Ship is the *producer*
  here, and typing its manifest against the consumer runtime's `ManifestAction`
  would point the data layer at `@estiva-app/interop`, which is the wrong
  direction — that package exists to read other apps' manifests, not to
  constrain Ship's own.

  That still holds, and it never applied to a *test*. The rules these three
  checks enforced were right and lived in the wrong place: the field they are
  about is read across every app's manifest, and one app's private test cannot
  cover that. So they moved into the package as `actionProblems` (PRO-16) and
  this now runs the shared one — one rule, not two that can drift, and the next
  app gets it on day one instead of discovering it by having its actions matched
  badly.

  `actionProblems` is advisory and nothing in resolution calls it, so importing
  it here does not point the data layer anywhere. It reports what a producer
  should fix before signing, which is exactly what this file is for.
*/
console.log('\n# every action carries description and effect\n')

const allActions = (JSON.parse(buildManifest(PK, Date.now()).content) as {
  // `id` to name a failure and `effect` for the destructive inventory below.
  // Everything the three checks used to read now belongs to `actionProblems`.
  actions: { id: string; effect?: string }[]
}).actions

check('the manifest declares fifteen actions', allActions.length === 15, allActions.map((a) => a.id).join(', '))
for (const action of allActions) {
  // The problems are sentences naming the action, so a failure here says what
  // to write rather than which assertion index went red.
  const problems = actionProblems(action)
  check(`  ${action.id} is publishable`, problems.length === 0, problems.join(' '))
}

/*
  The destructive inventory is exactly two: deleting an issue and deleting a
  project (MAN-4). Asserted as a list, not a count, so adding another is a
  deliberate act with a failing test in front of it.
*/
const destructive = allActions.filter((a) => a.effect === 'destructive').map((a) => a.id)
check('the destructive actions are delete-issue and delete-project', destructive.join() === 'delete-issue,delete-project', destructive.join(', '))

/*
  The shapes a consumer turns into controls — MAN-4. Peek finds Rename by the
  field the title slot folds, draws a select only for an input naming a
  vocabulary, and a confirm for a `kind:5`. Each of those is a property of the
  declaration, so each is checked here rather than trusted.
*/
const declared = JSON.parse(buildManifest(PK, Date.now()).content) as {
  actions: { id: string; appliesTo: string | string[]; emits: { kind: number; field?: string }; input?: { enum?: string } }[]
  vocabularies: Record<string, { value: string }[]>
}
const byId = (id: string) => declared.actions.find((a) => a.id === id)
check('rename-issue and rename-project both set `title`', byId('rename-issue')?.emits.field === 'title' && byId('rename-project')?.emits.field === 'title')
check(
  'archive-project names a vocabulary holding exactly true and empty',
  declared.vocabularies[byId('archive-project')?.input?.enum ?? '']?.map((v) => v.value).sort().join('|') === '|true',
)
check('delete-issue emits kind:5 on an issue', byId('delete-issue')?.emits.kind === KIND.DELETION && byId('delete-issue')?.appliesTo === String(KIND.ISSUE))
// RFC 0.4 §13.9: the display key is derived by its owner alone.
check('no action sets `ref`', declared.actions.every((a) => a.emits.field !== 'ref'))

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
  format: 'marker',
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
