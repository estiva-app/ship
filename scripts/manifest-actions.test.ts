/**
 * The rest of Ship's action set, built by another app — MAN-4.
 *
 *   npx tsx scripts/manifest-actions.test.ts
 *
 * A declaration is only right if what a consumer builds from it is what Ship
 * would have written itself. So each action here is built the way Peek builds
 * it — interop's `buildActionEvents`, handed Ship's own `manifestContent()` —
 * and then compared with Ship's own writer (`Store`, against a fake relay that
 * records what it was sent) and read back through Ship's own fold. Nothing is
 * compared with a hand-written expectation of what the event should be.
 */
import { buildActionEvents, type UnsignedActionEvent } from '@estiva-app/interop'
import {
  BLOCK_DOCUMENT_FORMAT,
  markerTextToBlockDocument,
  serializeBlockDocument,
  type PublishResult,
  type Relay,
  type SignedEvent,
  type UnsignedEvent,
} from '@estiva-app/protocol'
import { foldFolder } from '../src/nostr/fold'
import { KIND } from '../src/nostr/kinds'
import { manifestContent } from '../src/nostr/manifest'
import { Store } from '../src/nostr/store'
import type { Signer } from '../src/nostr/signer'

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures++
}

const ME = 'ab'.repeat(32)
const RELAY = 'cd'.repeat(32)
const FOLDER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const PROJECT = `${KIND.PROJECT}:${ME}:p1`
const PROJECT_2 = `${KIND.PROJECT}:${ME}:p2`
const ISSUE = `${KIND.ISSUE}:${ME}:i1`
const NOW = 1_759_000_000_000

// Cast, as `app.test.ts` does: `ManifestContent.actions` is `unknown[]` on purpose.
const manifest = manifestContent() as unknown as Parameters<typeof buildActionEvents>[0]['manifest']

const build = (args: Omit<Parameters<typeof buildActionEvents>[0], 'manifest' | 'pubkey' | 'createdAtMs'>) =>
  buildActionEvents({ manifest, pubkey: ME, createdAtMs: NOW, ...args })

const sign = (event: UnsignedEvent | UnsignedActionEvent, i: number): SignedEvent =>
  ({ ...event, id: `${i}`.padStart(64, '0'), sig: 'f'.repeat(128) }) as SignedEvent

const tag = (event: { tags: string[][] }, name: string) => event.tags.find((t) => t[0] === name)?.[1]

let sent: UnsignedEvent[] = []
const relay = {
  async publish(event: SignedEvent): Promise<PublishResult> {
    sent.push(event)
    return { ok: true } as PublishResult
  },
} as unknown as Relay
const signer = { pubkey: ME, sign: async (unsigned: UnsignedEvent) => ({ ...unsigned, id: 'x', sig: 'y' }) } as unknown as Signer
const store = new Store(relay, signer)

const issueRoot = sign(
  {
    pubkey: ME,
    created_at: NOW / 1000 - 100,
    kind: KIND.ISSUE,
    tags: [['d', 'i1'], ['title', 'Billing entry'], ['a', PROJECT], ['h', FOLDER]],
    content: 'As filed',
  },
  1,
)

// ── describe-issue and describe-project ─────────────────────────────────────
console.log('\n# describe-* is the change Ship writes for a description\n')

const document = serializeBlockDocument(markerTextToBlockDocument('# Goal\n\nShip **every** action.'))
const describe = build({
  kind: KIND.ISSUE,
  address: ISSUE,
  objectAuthor: ME,
  folder: FOLDER,
  actionId: 'describe-issue',
  value: document,
  contentFormat: BLOCK_DOCUMENT_FORMAT,
})
check('describe-issue builds one event', Array.isArray(describe) && describe.length === 1, typeof describe === 'string' ? describe : '')
if (Array.isArray(describe)) {
  const [change] = describe
  check('a kind:1851 on `description`, tagged as a block document', change.kind === KIND.CHANGE && tag(change, 'field') === 'description' && tag(change, 'content-format') === BLOCK_DOCUMENT_FORMAT)
  const folded = foldFolder([issueRoot, sign(change, 2)]).issues[0]
  check('Ship folds it as the issue’s body', folded.description === document)

  sent = []
  await store.setField({ folder: FOLDER, target: ISSUE, field: 'description', value: document, contentFormat: BLOCK_DOCUMENT_FORMAT, note: 'Description' })
  const own = sent[0]
  const ownFormat = foldFolder([issueRoot, sign(own, 3)]).issues[0].descriptionFormat
  check('…as blocks, the format Ship’s own edit folds to', folded.descriptionFormat === ownFormat && ownFormat !== 'marker', `${folded.descriptionFormat} vs ${ownFormat}`)
  const core = (event: { tags: string[][] }) => ['a', 'field', 'value', 'h', 'content-format'].map((name) => `${name}=${tag(event, name)}`).join(' ')
  check('the same five tags Ship’s own setField writes', core(change) === core(own), core(change) === core(own) ? '' : `${core(change)} vs ${core(own)}`)
}

check(
  'a plain value is still accepted, untagged — a consumer drawing a text box publishes correct marker text',
  (() => {
    const plain = build({ kind: KIND.PROJECT, address: PROJECT, objectAuthor: ME, folder: FOLDER, actionId: 'describe-project', value: 'Just words' })
    return Array.isArray(plain) && tag(plain[0], 'content-format') === undefined && tag(plain[0], 'field') === 'description'
  })(),
)

// ── move-issue ──────────────────────────────────────────────────────────────
console.log('\n# move-issue is the `project` change Ship’s picker writes\n')

const moved = build({ kind: KIND.ISSUE, address: ISSUE, objectAuthor: ME, folder: FOLDER, actionId: 'move-issue', value: PROJECT_2 })
check('move-issue builds one kind:1851 on `project`', Array.isArray(moved) && moved.length === 1 && tag(moved[0], 'field') === 'project', typeof moved === 'string' ? moved : '')
if (Array.isArray(moved)) {
  check('Ship folds the issue under the project it was moved to', foldFolder([issueRoot, sign(moved[0], 4)]).issues[0].projectAddr === PROJECT_2)
  check('and the change keeps the issue’s Folder: `h` is the issue’s own', tag(moved[0], 'h') === FOLDER)
}
const unparented = build({ kind: KIND.ISSUE, address: ISSUE, objectAuthor: ME, folder: FOLDER, actionId: 'move-issue', value: '' })
check(
  'an empty value is “No project”, as Ship’s picker offers',
  Array.isArray(unparented) && foldFolder([issueRoot, sign(unparented[0], 5)]).issues[0].projectAddr === '',
)
const listSlot = (manifestContent().projections[String(KIND.PROJECT)].slots.list as { children?: { movedBy?: string } }).children
check('the project’s issue list declares the field a move sets', listSlot?.movedBy === 'project', JSON.stringify(listSlot))

// ── add-project ─────────────────────────────────────────────────────────────
console.log('\n# add-project is createProject: the record, then its listing\n')

const FOLDER_RECORD = `39000:${RELAY}:${FOLDER}`
const created = build({
  kind: 39000,
  address: FOLDER_RECORD,
  objectAuthor: RELAY,
  folder: FOLDER,
  actionId: 'add-project',
  value: { name: 'Launch', description: 'What launch means' },
  newId: 'p9',
  folderHasState: true,
})
check('into a Folder with state: the record, then one kind:1852', Array.isArray(created) && created.map((e) => e.kind).join() === `${KIND.PROJECT},1852`, typeof created === 'string' ? created : '')
if (Array.isArray(created)) {
  const [record, listing] = created
  sent = []
  await store.createProject({ title: 'Launch', description: 'What launch means', team: { folder: FOLDER, hasState: true } })
  const [ownRecord, ownListing] = sent
  check(
    'the description is on a `description` tag with empty content, as buildProject writes it',
    tag(record, 'description') === 'What launch means' && record.content === '' && tag(ownRecord, 'description') === 'What launch means' && ownRecord.content === '',
  )
  check('the record names its Folder in `buzz-channel` and carries no `h`, as buildProject does', tag(record, 'buzz-channel') === FOLDER && tag(record, 'h') === undefined && tag(ownRecord, 'buzz-channel') === FOLDER && tag(ownRecord, 'h') === undefined)
  check('its name is on `name`, the tag Ship writes', tag(record, 'name') === 'Launch' && tag(ownRecord, 'name') === 'Launch')
  const ownId = tag(ownRecord, 'd')!
  const listingShape = (event: { tags: string[][] }, id: string) => event.tags.map((t) => t.join('=')).join(' ').replace(id, '<d>')
  check('the listing is the one createProject publishes', listingShape(listing, 'p9') === listingShape(ownListing, ownId), `${listingShape(listing, 'p9')} vs ${listingShape(ownListing, ownId)}`)
  const project = foldFolder([sign(record, 6)]).projects[0]
  check('Ship folds the new project’s name, Folder and description', project.title === 'Launch' && project.contentFolder === FOLDER && project.description === 'What launch means', `${project.title} ${project.contentFolder} ${project.description}`)
}
const stateless = build({ kind: 39000, address: FOLDER_RECORD, objectAuthor: RELAY, folder: FOLDER, actionId: 'add-project', value: { name: 'Launch' }, newId: 'p9', folderHasState: false })
check('into a Folder without state: the record alone, which containment already lists', Array.isArray(stateless) && stateless.length === 1)
check(
  'and the runtime refuses to guess when nobody read the Folder',
  typeof build({ kind: 39000, address: FOLDER_RECORD, objectAuthor: RELAY, folder: FOLDER, actionId: 'add-project', value: { name: 'Launch' }, newId: 'p9' }) === 'string',
)

// ── delete-project ──────────────────────────────────────────────────────────
console.log('\n# delete-project is deleteProject: the kind:5, then every unlisting\n')

const listedIn = [
  { id: FOLDER, hasState: true },
  { id: OTHER, hasState: true },
]
const deleted = build({ kind: KIND.PROJECT, address: PROJECT, objectAuthor: ME, folder: FOLDER, actionId: 'delete-project', value: '', listedIn })
sent = []
await store.deleteProject({ recordFolder: FOLDER, project: PROJECT, folders: listedIn.map((f) => ({ folder: f.id, hasState: f.hasState })) })
const shape = (events: { kind: number; tags: string[][] }[]) => events.map((e) => `${e.kind} ${tag(e, 'op') ?? ''} ${e.kind === 5 ? tag(e, 'a') : (tag(e, 'h') ?? '')}`.trim())
check(
  'the kind:5 first, then a remove from each Folder listing it — what Ship sends',
  Array.isArray(deleted) && JSON.stringify(shape(deleted)) === JSON.stringify(shape(sent)),
  Array.isArray(deleted) ? `${shape(deleted).join(' | ')} vs ${shape(sent).join(' | ')}` : deleted,
)
check(
  'and it is refused, not half-built, without the Folders that list it',
  typeof build({ kind: KIND.PROJECT, address: PROJECT, objectAuthor: ME, folder: FOLDER, actionId: 'delete-project', value: '' }) === 'string',
)

console.log(failures ? `\n${failures} failed` : '\nall passed')
process.exit(failures ? 1 : 0)
