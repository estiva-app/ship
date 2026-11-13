/**
 * Rendering another app's objects — Ship's half of PRO-7.
 *
 * **Ship has been a producer and nothing else.** It publishes a manifest saying
 * how its projects and issues should be drawn elsewhere, and has never drawn
 * anyone else's. Peek has been the only consumer since the layer was built, so
 * every line of the runtime has had exactly one caller and no second opinion —
 * which is the bill SHA-7 exists to pay, and PRO-1 deliberately left this
 * ticket in front of publishing the package.
 *
 * This file is the second opinion. It is deliberately thin: everything that
 * knows what a manifest *is* lives in the vendored runtime, and everything here
 * is Ship supplying its environment. If this file ever needs to know what Peek
 * is, the layer has failed and that belongs on PRO-7 rather than being worked
 * around here.
 */
import { pointerToAddress, referenceToPointer, type SignedEvent } from '@estiva-app/protocol'
import {
  buildActionEvents,
  resolveActingManifest,
  conversationCountsOf,
  archiveImpact,
  createLoadQuery,
  createPeopleCache,
  createProjectionCache,
  listFolders,
  nestingOf,
  resolveFolderContents,
  resolveForeignEvent,
  resolveForeignObject,
  resolveForeignRoots,
  resolveForeignObjects,
  fileCandidates,
  folderOf,
  isArchived,
  searchFileReferences,
  readTopics,
  readYourTopics,
  topicsOfFile,
  type ReadTopic,
  type TopicsRead,
  type YourTopicsRead,
  type FolderContents,
  type FolderSummary,
  type ForeignObject,
  type QueryFn,
} from '@estiva-app/interop'

/** Chain-walking, from the runtime — one implementation, not one per consumer. */
export { pickWidget } from '@estiva-app/interop'
import { KIND_CHANGE, placeFilters, placeListing, type Listed, type ReferenceCandidate } from '@estiva-app/conversation'
import { relatedTo } from '@/lib/ownKinds'
import { safeLink } from '@/lib/handoff'
import { REFRESH_MS } from '@/lib/useRefresh'
import { KIND } from '../nostr/kinds'
import { inOrderOption, projectFieldsNow, relay, signer } from './store'

export type { ForeignObject, ResolvedSlot, FolderContents, FolderSummary } from '@estiva-app/interop'

/**
 * The one environment touch the runtime takes: a filter query.
 *
 * ADR 0002 §10 constraint 2 in practice — the runtime reaches for nothing and
 * is handed everything. Ship's relay is authenticated the same way the rest of
 * the app's reads are, so a reference to a Folder the viewer cannot see comes
 * back `unreachable` rather than throwing.
 */
const query = (filters: Record<string, unknown>[]): Promise<SignedEvent[]> =>
  relay.query(filters as never)

/**
 * One load of Folder reads (APP-2): a Folder listing and the Folders' contents
 * read through the same one ask the relay for each file's changes once between
 * them, and join a read already in flight. Make one per load — an action's
 * read-back, a move's listings — and drop it, so the next load reads afresh.
 * Never held at module scope: it never sees a change made after its read.
 */
export function loadQuery(): QueryFn {
  return createLoadQuery(query)
}

/**
 * The page's first load, shared by the workspace's first read and the
 * sidebar's first listing, so a change is read once between them (APP-4): the
 * workspace reads every change, and the listing's change reads are answered
 * from that. Paged, as the workspace read must be. Each takes it once and every
 * later read makes its own, so it is dropped once both have it.
 *
 * The listing asks nothing until the workspace has taken it: the workspace
 * asks for every change the moment it starts, and a listing asking first reads
 * its changes itself — 27.6 MB more on 28 Oct, once the workspace read began
 * only after the opened page's own read. The sidebar waits for the whole read
 * anyway.
 */
const firstLoadFor = new Set(['workspace', 'listing'])
let firstLoadQuery: QueryFn | undefined
let workspaceTook: () => void = () => undefined
const workspaceStarted = new Promise<void>((resolve) => (workspaceTook = resolve))
export function firstLoad(reader: 'workspace' | 'listing'): QueryFn | undefined {
  if (!firstLoadFor.delete(reader)) return undefined
  const read = (firstLoadQuery ??= createLoadQuery((filters) => relay.queryAll(filters as never), { paged: true }))
  if (!firstLoadFor.size) firstLoadQuery = undefined
  if (reader === 'workspace') {
    workspaceTook()
    return read
  }
  return async (filters) => {
    await workspaceStarted
    return read(filters)
  }
}

/**
 * Resolve a `nostr:naddr…` (or a bare `kind:pubkey:d`) to a foreign object.
 *
 * Returns null when the reference is malformed or no app claims the kind — both
 * of which mean "there is nothing to draw", as distinct from an object that
 * resolved and cannot be read, which comes back with `unreachable` set. Those
 * are different sentences to a reader and the widget says so.
 */
/**
 * The NIP-89 discovery half of a resolve, remembered for this tab (SHI-13).
 *
 * Every reference widget re-resolves on Ship's poll — that is PRO-10's whole
 * claim, and dropping it would turn the widget back into a screenshot with a
 * timestamp nobody can see. But two of the four round trips it cost were
 * finding out *which app draws this kind*, and that answer does not change
 * between ticks. Measured against production: three references on one issue
 * cost 10 requests a tick, and 3 with this.
 *
 * The relay meters reads at 300 a minute for the whole tab, shared with the
 * workspace poll (SHI-12), so this is budget rather than latency.
 *
 * Module scope, so it lives as long as the tab and every widget shares it — the
 * same project referenced from three issues discovers its app once. Only the
 * manifest is held; the object, its changes, its comments and its children are
 * re-read on every tick, which is what keeps the widget live.
 */
const manifests = createProjectionCache()

/**
 * Who the people in a foreign object are, remembered for this tab (SHA-16).
 *
 * Ship passed nothing here, so the default lookup re-read `kind:0` for every
 * author of every child on every tick. A Ship object has few authors and never
 * noticed; a referenced **Peek topic** has one per message, and cost 2 requests
 * a tick where a Ship object cost 1 — the cross-app case PRO-7 exists for being
 * the dearest reference rather than the cheapest.
 *
 * A miss expires much sooner than a hit, which is the part worth not
 * reinventing: somebody with no profile yet is precisely the person whose name
 * is about to arrive, and caching that as long as a name makes them render as
 * `nostr:<8 chars>` until a reload. Peek found that (PEE-3) and the runtime now
 * owns it.
 *
 * Module scope, beside `manifests`, so every widget shares one answer.
 */
const profiles = createPeopleCache()

/**
 * Whether a reference names an event rather than an address.
 *
 * A message is an event: it has no `d` tag and is pointed at by id — an
 * `nevent`, a `note`, or the bare 64 hex characters an `e` tag gives you. The
 * two resolvers in the runtime are split the same way, and each throws on the
 * other's form.
 */
export function isEventReference(reference: string): boolean {
  const bare = reference.replace(/^nostr:/i, '')
  return /^(?:nevent|note)1/i.test(bare) || /^[0-9a-f]{64}$/i.test(bare)
}

export interface ResolveOptions {
  /**
   * A Folder's card: also read the files its `30890` lists that this reader
   * can open, as `children` (SPEC §3.2, interop 0.58). Costs a Folder page's
   * read, so only `useFolderFiles` asks, never the refresh tick; a chip never.
   */
  folderFiles?: boolean
  /**
   * The file's every change and comments, as interop's full read gives them: a page's text for a part of it
   * (`part.ts`), which a card never draws. Otherwise a file is read as a card draws it (ALO-23, below).
   */
  full?: boolean
  /** A card's read that no other component's answer stands in for: the file again, after a change made from it. */
  fresh?: boolean
}

/**
 * What a reference draws as: a message, or a file as a chip, row or card draws it. A file is read as it is now and
 * once for every component drawing it (`resolveCard`), unless `full` or `folderFiles` asks for more.
 */
export function resolveForeign(reference: string, { folderFiles, full, fresh }: ResolveOptions = {}): Promise<ForeignObject | null> {
  if (full || folderFiles) return readFull(reference, { folderFiles })
  return resolveCard(reference, { fresh })
}

function readFull(reference: string, { folderFiles }: Pick<ResolveOptions, 'folderFiles'> = {}): Promise<ForeignObject | null> {
  /*
    A message mentioned from Peek arrives as `nostr:nevent…` (RIC-11), and
    everything went to `resolveForeignObject`, which decodes an `naddr` or an
    address and throws on anything else — so the mention resolved to null and
    drew as twelve characters of bech32. `resolveForeignEvent` is the other
    half of the runtime (PRO-11) and had no caller in either app.
  */
  if (isEventReference(reference)) {
    return resolveForeignEvent(reference, query, profiles.viaRelay(query), manifests)
  }
  // `0` is the list-depth budget, at the top. Positional because that is the
  // runtime's signature; naming them here would be inventing an adapter the
  // seam does not need.
  return resolveForeignObject(reference, query, profiles.viaRelay(query), 0, manifests, folderFiles ? { folderFiles } : undefined)
}

/**
 * How long one card read answers every component drawing the same reference (ALO-23): half a refresh, so components
 * whose ticks fall close together share one read, and a card is never more than a tick and a half behind the relay.
 */
const CARD_SHARE_MS = REFRESH_MS / 2

const cardAnswers = new Map<string, { at: number; answer: Promise<ForeignObject | null> }>()
/** The references asked in this moment, and their one read. */
let cardBatch: { references: Set<string>; read: Promise<Map<string, ForeignObject | null>> } | undefined

/**
 * What a card, a row or a chip draws for a reference: the file as it is now, read once for every component drawing it
 * (ALO-23).
 *
 * The full read gives a file's every change (up to 500) and its comments, and each component asked on its own, so a
 * topic's page read one project's 1.8 MB three or four times over. A card draws none of that: it draws the file's
 * current fields, and a project's issues with theirs (`linkedFrom` in the kit). So the references asked in the same
 * moment are read together, through the list read (SPEC §6.13) where the relay has it, as `readTopicDocuments` does,
 * and the answer is shared for `CARD_SHARE_MS`. The people the files name are then looked up once, from the same
 * profiles cache, because the list read names nobody. A message (an event reference) keeps its own read.
 *
 * A read that fails rejects every reference it carried, and is not kept, so the next tick asks again.
 */
function resolveCard(reference: string, { fresh }: Pick<ResolveOptions, 'fresh'> = {}): Promise<ForeignObject | null> {
  const held = cardAnswers.get(reference)
  if (!fresh && held && Date.now() - held.at < CARD_SHARE_MS) return held.answer
  const answer = isEventReference(reference) ? readFull(reference) : inCardBatch(reference)
  cardAnswers.set(reference, { at: Date.now(), answer })
  answer.catch(() => {
    if (cardAnswers.get(reference)?.answer === answer) cardAnswers.delete(reference)
  })
  return answer
}

/** `reference` in the read the components asking in this same moment send together. */
function inCardBatch(reference: string): Promise<ForeignObject | null> {
  if (!cardBatch) {
    const references = new Set<string>()
    // A macrotask, so every component a render mounts or a tick refreshes has asked before the read goes.
    const read = new Promise<void>((go) => setTimeout(go, 0)).then(() => {
      cardBatch = undefined
      return readCards([...references])
    })
    cardBatch = { references, read }
  }
  cardBatch.references.add(reference)
  return cardBatch.read.then((answers) => answers.get(reference) ?? null)
}

function addressOfReference(reference: string): string | undefined {
  try {
    // A bare `naddr1…` parses only as a NIP-27 reference.
    return pointerToAddress(referenceToPointer(/^(nostr:|\d+:)/.test(reference) ? reference : `nostr:${reference}`))
  } catch {
    return undefined
  }
}

/** Every key a file draws as a person, as interop's full read names them: its person fields, controls and deleter. */
function pubkeysOf(object: ForeignObject): string[] {
  const keys: string[] = []
  for (const slot of [...Object.values(object.slots), ...object.meta]) if (slot.isPubkey && slot.value) keys.push(slot.value)
  for (const action of object.actions) if (action.control === 'pubkey' && action.current) keys.push(action.current)
  if (object.deleted) keys.push(object.deleted.by)
  return keys
}

async function readCards(references: readonly string[]): Promise<Map<string, ForeignObject | null>> {
  const read = await listRead()
  const addressed = references.flatMap((reference) => {
    const address = addressOfReference(reference)
    return address ? [[reference, address] as const] : []
  })
  const answers = new Map<string, ForeignObject | null>()
  // Without the list read, or for a reference that names no address, each its full read, as before.
  const alone = read.listRead ? references.filter((reference) => !addressed.some(([r]) => r === reference)) : references
  const [objects, ...each] = await Promise.all([
    read.listRead && addressed.length
      ? resolveForeignRoots(
          addressed.map(([, address]) => address),
          query,
          manifests,
          { listRead: true, children: true },
        )
      : Promise.resolve([]),
    ...alone.map((reference) => readFull(reference)),
  ])
  alone.forEach((reference, i) => answers.set(reference, each[i]))
  if (!objects.length) {
    if (read.listRead) for (const [reference] of addressed) answers.set(reference, null)
    return answers
  }
  const keys = [...new Set(objects.flatMap((object) => [object, ...(object.children ?? [])].flatMap(pubkeysOf)))]
  const people = keys.length ? await profiles.viaRelay(query)(keys) : {}
  const byAddress = new Map(
    objects.map((object) => [object.address, { ...object, people, ...(object.children ? { children: object.children.map((child) => ({ ...child, people })) } : {}) }]),
  )
  // A file the list read leaves out (deleted, or not readable here) is no answer, as the full read's `null`.
  for (const [reference, address] of addressed) answers.set(reference, byAddress.get(address) ?? null)
  return answers
}

/**
 * A file's archive when it is archived with its parent (an issue in an archived
 * project, FOL-46), else `undefined`. One more read than `resolveForeign`, so a
 * card asks once, never the refresh tick (SHI-13).
 */
export async function parentArchiveOf(reference: string): Promise<ForeignObject['archived'] | undefined> {
  const file = await resolveForeignObject(reference, query, async () => ({}), 0, manifests, { archivedWith: true }).catch(() => null)
  return file?.archived?.with ? file.archived : undefined
}

/** The fields a card never writes: a file's words, and its archive. */
const NOT_ON_A_CARD = new Set(['title', 'summary', 'description', 'archived'])

/** The tags a §7.3 change carries: the file and its id, the field, its value, the Folder, the writer's clock, a person it names, and a staged option's stage. */
const CHANGE_TAGS = new Set(['a', 'O', 'field', 'value', 'h', 'ts', 'p', 'stage'])

/** Whether what the runtime built is exactly one `kind:1851` change of `field` on `address`, in `folder`. */
function isFieldChange(built: readonly { kind: number; tags: string[][] }[], want: { address: string; folder: string; field: string }): boolean {
  if (built.length !== 1 || built[0].kind !== KIND_CHANGE) return false
  const tags = built[0].tags
  const one = (name: string) => tags.filter((t) => t[0] === name)
  if (!tags.every((t) => CHANGE_TAGS.has(t[0]))) return false
  // The file's id beside its address (interop 0.73, §6.2): at most one, and the address's own.
  const id = want.address.split(':').slice(2).join(':')
  if (one('O').length > 1 || (one('O').length === 1 && one('O')[0][1] !== id)) return false
  // A staged option's stage (interop 0.73): at most one, about the field this change sets.
  if (one('stage').length > 1 || (one('stage').length === 1 && one('stage')[0][1] !== want.field)) return false
  return one('a').length === 1 && one('a')[0][1] === want.address && one('h').length === 1 && one('h')[0][1] === want.folder && one('field').length === 1 && one('field')[0][1] === want.field && one('value').length === 1
}

/**
 * Change a linked file from its card: a status, an owner — the manifest's own
 * action, built by the runtime (`buildActionEvents`) as Peek's `applyAction`
 * builds it, so a Ship card writes exactly what the file's own app would. Any
 * reader may (Decided 16 Oct); the relay is the authority on whether it may.
 *
 * Only a change of one field, which is all a card's pickers are: never a
 * creation, a deletion or a write a Folder command follows (`emits.listed`).
 */
export async function applyCardAction(args: { reference: string; actionId: string; value: string }): Promise<{ ok: true } | { ok: false; reason: string }> {
  let pointer
  try {
    pointer = referenceToPointer(args.reference)
  } catch {
    return { ok: false, reason: 'That link could not be read.' }
  }
  const address = pointerToAddress(pointer)
  const resolved = await resolveActingManifest(pointer, undefined, query, manifests)
  if (!resolved) return { ok: false, reason: 'No app claims this file, so there is nothing to change.' }
  const declared = resolved.manifest.actions?.find((action) => action.id === args.actionId)
  if (!declared || declared.effect !== 'writes' || !declared.emits.field || declared.emits.listed || NOT_ON_A_CARD.has(declared.emits.field)) return { ok: false, reason: 'This can’t be changed from here.' }
  // The file as its page reads it: its Folder, which the change is written into, and whether it or its parent is archived.
  // No names are drawn from it, so no profiles are asked for.
  const file = await resolveForeignObject(address, query, async () => ({}), 0, manifests, { archivedWith: true }).catch(() => null)
  const folder = file && !file.unreachable ? file.folder : undefined
  if (!file || !folder) return { ok: false, reason: 'That file can’t be read from here.' }
  // A move is the tree's control, and an archived file is read-only (Leaf's `saveCardChoice` refuses the same).
  if (file.archived || declared.emits.field === file.parentField) return { ok: false, reason: 'This can’t be changed from here.' }
  const built = buildActionEvents({
    manifest: resolved.manifest,
    kind: pointer.kind,
    address,
    objectAuthor: pointer.pubkey,
    folder,
    actionId: args.actionId,
    value: args.value,
    pubkey: signer.pubkey,
    createdAtMs: Date.now(),
  })
  if (typeof built === 'string') return { ok: false, reason: built }
  /*
    The manifest is a stranger's text on a shared relay (anyone may publish a
    31990 and point a 31989 at it), and it names the kind and the tags the
    runtime builds. The reader signs only SPEC §7.3's change of one field on
    this file, in its Folder — never a handler recommendation, a rename, read
    state or a deletion dressed as a "status".
  */
  if (!isFieldChange(built, { address, folder, field: declared.emits.field })) return { ok: false, reason: 'This can’t be changed from here.' }
  const result = await relay.publish(await signer.sign(built[0]))
  return result.ok ? { ok: true } : { ok: false, reason: result.reason ?? 'The relay refused the change.' }
}

/**
 * Everything in one Folder, whichever app owns it.
 *
 * The same seam as `resolveForeign` one line up, pointed at a container rather
 * than a reference — and deliberately the same two caches, because a Folder is
 * where the cross-app case actually bites: a project and a topic in one list
 * are two apps' manifests and two apps' authors, and without the memo that is
 * the whole discovery cost on every tick.
 *
 * The *read* takes whatever comes back: it does not filter by kind, does not
 * sort by app, and has no list of kinds it expects. What the tree then lists is
 * a different question — navigation is by kind (RFC 0.5 §10.7), so the folder
 * view lists Ship's own files and counts the rest, and a project or issue page
 * shows the foreign files placed under it as Related. Both are filters over
 * this one read (`lib/ownKinds.ts`), and a Folder holding something neither app
 * has heard of still arrives through the widget chain like everything else.
 */
export async function readFolder(id: string, read: QueryFn = loadQuery()): Promise<FolderContents> {
  return resolveFolderContents(id, read, profiles.viaRelay(query), manifests, await listRead())
}

/**
 * Where projects are read by their fields (ALO-5), a Folder's files are too:
 * each as its first record and its fields' current changes, not every change
 * ever made to it (§6.13). No row here draws a text, and a deleted file is left out.
 */
async function listRead(): Promise<{ listRead?: true }> {
  return (await projectFieldsNow()) ? { listRead: true } : {}
}

/**
 * A Folder's files for a move to plan from (SPEC §3.3) — what lists what
 * beneath it, and nothing a person reads, so no profiles are asked for.
 * Archived files included: a topic archived under a project, or every file
 * under an archived project, moves with it (SHI-37).
 */
export async function readFolderListing(id: string, read: QueryFn = loadQuery()): Promise<FolderContents['files']> {
  return (await resolveFolderContents(id, read, async () => ({}), manifests, { includeArchived: true, ...(await listRead()) })).files
}

/**
 * `[`'s search tier (PEE-21): the files whose current title or ref holds
 * `text`, as this identity can read them. Rejects on a refused read, which
 * `referenceSearch` answers as no hits for a while. Where the relay finds
 * projects by their words (ALO-5), they are found by their current summary,
 * key and text too, through the list read (§6.13).
 */
export async function searchFiles(text: string): Promise<ReferenceCandidate[]> {
  const fields = await projectFieldsNow()
  const byFields = fields?.search ? { kinds: [KIND.PROJECT], query: (filters: Record<string, unknown>[]) => relay.queryWithMatches(filters as never) } : undefined
  return searchFileReferences(text, query, { cache: manifests, ...(fields ? { listRead: true } : {}), ...(byFields ? { byFields } : {}), ...(await inOrderOption()) })
}

/** A topic as the Topics line draws it and a list entry names it (TOP-5). */
export interface TopicOfFile {
  /** Its address, `30840:<pubkey>:<d>`. */
  address: string
  /** Its Folder, read from its root (§6.2): where an entry about it is filed. */
  folder: string
  title: string
  /** Where it opens: Peek, as its manifest says. */
  openUrl?: string
  /** Archived: read-only in every app, so no Add and no Remove on it. */
  archived: boolean
}

/** A topic as its chip and Add to topic's row draw it. */
export function topicAsDrawn(address: string, folder: string, object: ForeignObject): TopicOfFile {
  // https only: the link comes from a manifest anyone may publish until WOR-2.
  return { address, folder, title: object.slots.title?.value || 'Untitled topic', openUrl: safeLink(object.openUrl), archived: isArchived(object) }
}

/**
 * The topics whose list names this file (TOP-5, SPEC §6.14): `#o` on its id,
 * the newest entry per topic, only topics the reader can read, each with its
 * current title and archive — its own, or with its project (SHIPS-2). A–Z.
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-topic-keeps-its-own-list-of-files.md
 */
export async function readFileTopics(file: string): Promise<TopicOfFile[]> {
  const [listing, read] = await Promise.all([topicsOfFile(query, file), listRead()])
  if (listing.length === 0) return []
  const roots = new Map(listing.map((topic) => [topic.address, topic.root]))
  const objects = await resolveForeignRoots([...roots.keys()], query, manifests, { archivedWith: true, ...read })
  return objects
    .flatMap((object) => {
      const root = object.address ? roots.get(object.address) : undefined
      const folder = root ? folderOf(root) : null
      return root && folder && !object.unreachable ? [topicAsDrawn(object.address!, folder, object)] : []
    })
    .sort((a, b) => a.title.localeCompare(b.title))
}

/**
 * Every topic the reader can read, with its list, its archive and whether it
 * is theirs (SHIPS-2): interop's one read, which Add to topic and the Topics
 * page draw from. Paged, as a read of every topic must be. Each list by the
 * list read where the relay offers it: every move or look someone sets is a
 * change on the topic, and reading them all would grow with each (TOPI-5).
 */
export async function readAllTopics(): Promise<TopicsRead> {
  const lists = await listRead()
  // The parents walked to see whether a topic is archived with one are read by the same list read (ALO-17).
  return readTopics((filters) => relay.queryAll(filters as never), signer.pubkey, { cache: manifests, ...lists, ...(lists.listRead ? { parentsListRead: true } : {}) })
}

/**
 * Only your topics, newest activity first (ALO-17): interop's lean read, what
 * the sidebar draws its five from on every page but Topics and a topic's. One
 * request a call, never paged by `queryAll`, which would ask each filter for a
 * thousand events and keep interop's reads from ending on a short page.
 * `decrypt` opens your mute list. Your spaces come with it, marked, so a link
 * to one goes to Peek on every page; the sidebar leaves them out itself.
 */
export async function readSidebarTopics(decrypt: (ciphertext: string) => Promise<string | undefined>): Promise<YourTopicsRead> {
  return readYourTopics(query, signer.pubkey, { cache: manifests, decrypt, spaces: true, ...(await listRead()) })
}

/**
 * The Leaf documents a topic lists: what each is called now, where it opens,
 * who changed it last and when, and the pages directly under it (SHIPS-4,
 * TOPI-8). Where the relay has the list read, one read for all of them and
 * their pages, by their fields' current changes and never their text; without
 * it, each document's full read, as before. People are named by Ship's own
 * directory, so none are looked up here. One the reader cannot read is not
 * returned.
 */
export async function readTopicDocuments(addresses: readonly string[]): Promise<ForeignObject[]> {
  if (addresses.length === 0) return []
  const read = await listRead()
  if (read.listRead) return resolveForeignRoots(addresses, query, manifests, { archivedWith: true, listRead: true, children: true })
  const objects = await resolveForeignObjects(addresses, query, async () => ({}), manifests, { archivedWith: true })
  return Object.values(objects).filter((object): object is ForeignObject => !!object && !object.unreachable)
}

const KIND_ROSTER = 39002
const ROSTER_COMMANDS: readonly number[] = [9000, 9001, 9021, 9022, 9007]
const KIND_FOLDER_STATE = 30890
const KIND_FOLDER_COMMAND = 1852
/** The viewer's private teams list, which `placeFilters` asks for too. */
const KIND_APP_DATA = 30078

/**
 * Filters asking the same kinds by the same tags, as one: each tag's values
 * together. It asks for more than each alone (an author with another's `d`),
 * so every topic takes back only what its own filters answer.
 */
function mergedFilters(filters: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  const groups = new Map<string, Record<string, unknown>>()
  for (const filter of filters) {
    const shape = JSON.stringify([filter.kinds, Object.keys(filter).sort()])
    const into = groups.get(shape)
    if (!into) {
      groups.set(shape, { ...filter })
      continue
    }
    for (const [key, value] of Object.entries(filter)) {
      if (key !== 'kinds' && Array.isArray(value)) into[key] = [...new Set([...(into[key] as unknown[]), ...value])]
    }
  }
  return [...groups.values()]
}

/** Whether an event answers a filter by its kinds, authors and `#x` tags, as NIP-01 reads them: the only parts `placeFilters` uses. */
function answersFilter(event: SignedEvent, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, value]) => {
    const wanted = value as unknown[]
    if (key === 'kinds') return wanted.includes(event.kind)
    if (key === 'authors') return wanted.includes(event.pubkey)
    if (key.startsWith('#')) return event.tags.some((tag) => tag[0] === key.slice(1) && wanted.includes(tag[1]))
    return true
  })
}

/**
 * How many people each topic lists, for Explore's Members (TOPI-9; Miky,
 * 6 Nov: the same columns in every app): conversation's `placeListing`, the
 * rule Peek's people list draws — who chose a level, was added or made it,
 * and its team's members.
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-place-lists-who-chose-a-level-and-its-teams-members.md
 *
 * One paged read for every topic asked: each topic's `placeFilters` without
 * the viewer's private teams list (a topic's listing never needs it), merged
 * by shape. A failed read rejects: a failed read is not "nobody".
 */
export async function readTopicMembers(topics: readonly ReadTopic[]): Promise<Map<string, number | undefined>> {
  if (topics.length === 0) return new Map()
  const asked = topics.map((topic) => {
    const place = { address: topic.address, team: topic.folder }
    try {
      const filters = (placeFilters(place, signer.pubkey) as Record<string, unknown>[]).filter((filter) => !(filter.kinds as number[]).includes(KIND_APP_DATA))
      return { topic, place, filters }
    } catch {
      // A topic whose team is no team id cannot be read for its people: it draws no count, and the others still do.
      return { topic, place, filters: undefined }
    }
  })
  const events: SignedEvent[] = await relay.queryAll(mergedFilters(asked.flatMap(({ filters }) => filters ?? [])) as never)
  return new Map(
    asked.map(({ topic, place, filters }): [string, number | undefined] => {
      if (!filters) return [topic.address, undefined]
      const mine = events.filter((event) => filters.some((filter) => answersFilter(event, filter)))
      const roster = mine.filter((event) => event.kind === KIND_ROSTER || ROSTER_COMMANDS.includes(event.kind))
      const listing = mine.filter((event) => event.kind === KIND_FOLDER_STATE || event.kind === KIND_FOLDER_COMMAND)
      const own = mine.filter((event) => !roster.includes(event) && !listing.includes(event))
      return [topic.address, placeListing(place, { events: own, roster, listing }).length]
    }),
  )
}

/**
 * Who one topic lists, for its page's members pill (TOPI-8): the same rule
 * and read as Explore's count above, so the pill and Explore never disagree,
 * and Peek's people list draws the same. Its own events come back too, for an
 * Add to follow a leave. A failed read rejects.
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-place-lists-who-chose-a-level-and-its-teams-members.md
 */
export async function readTopicPlace(topic: { address: string; folder: string }): Promise<{ listed: Listed[]; events: SignedEvent[] }> {
  const place = { address: topic.address, team: topic.folder }
  const filters = (placeFilters(place, signer.pubkey) as Record<string, unknown>[]).filter((filter) => !(filter.kinds as number[]).includes(KIND_APP_DATA))
  const events: SignedEvent[] = await relay.queryAll(filters as never)
  const roster = events.filter((event) => event.kind === KIND_ROSTER || ROSTER_COMMANDS.includes(event.kind))
  const listing = events.filter((event) => event.kind === KIND_FOLDER_STATE || event.kind === KIND_FOLDER_COMMAND)
  const own = events.filter((event) => !roster.includes(event) && !listing.includes(event))
  return { listed: placeListing(place, { events: own, roster, listing }), events: own }
}

/**
 * `[`'s rows for files already in hand — a Folder's listing — or known only by
 * address — the files read recently, `at` each one's read marker (PEE-21).
 * Addresses are read as roots and changes alone: what a file is called now,
 * never its conversation.
 */
export async function fileCandidatesOf(
  files: readonly ForeignObject[] | { addresses: readonly string[]; at: ReadonlyMap<string, number> },
  tier: number,
): Promise<ReferenceCandidate[]> {
  // A project the relay keeps in order is picked as its id link (ALO-8, SPEC §13.1): interop's `pickedFileUri`.
  const [read, inOrder] = await Promise.all([listRead(), inOrderOption()])
  if (!('addresses' in files)) return fileCandidates(files, tier, query, { cache: manifests, ...read, ...inOrder })
  const objects = await resolveForeignRoots(files.addresses, query, manifests, read)
  return fileCandidates(objects, tier, query, { cache: manifests, at: files.at, ...read, ...inOrder })
}

/** The foreign files placed under one of Ship's objects, with their conversation counts. */
export interface RelatedFiles {
  /** Everything the Folder lists, whichever app owns it: `[`'s first Files tier (PEE-21). Absent before the read. */
  all?: ForeignObject[]
  /** One level, in the Folder's order — see `relatedTo`. */
  files: ForeignObject[]
  /**
   * What is under each of those files, and under those, keyed by the parent's
   * `ref` (FOL-4). From the same listing — every sub-file is in its parent's
   * team (SPEC §6.7) — so no request per level. A leaf has no entry.
   */
  inside: Record<string, ForeignObject[]>
  /** Comments addressed to each file, keyed by `ref`. Absent where the file has no address to ask about. */
  counts: Record<string, number>
}

/**
 * What is placed under a project or an issue — its Related section.
 *
 * **The same fetch as the folder view, with a different filter.** A file
 * somebody put under a project lives in that project's Folder, so the Folder
 * read already holds it, `parentRef` on it already says which file it is
 * under (interop 0.19.0: a bare file's own `a` tag; any other kind's declared
 * relation), and there is nothing to resolve twice.
 *
 * The count is one more query, from `conversationCountsOf`, and it is real for
 * the file this was built for: a bare file's `kind:1111`s carry `#a`, so the
 * badge is the discussion. Zero is a real zero — nothing addressed to it — and
 * not "nobody has discussed it", which the runtime's own note on the function
 * is careful about. Skipped entirely when there is nothing to count.
 */
export async function readRelated(folder: string, address: string): Promise<RelatedFiles> {
  const contents = await readFolder(folder)
  const files = relatedTo(contents.files, address)
  /*
    The nesting below each related file (FOL-4), walked in the listing with
    `nestingOf` — the one read that has a moved file under its new parent, and
    cycle-safe, so the walk ends. Counted with the rest in one query.
  */
  const nesting = nestingOf(contents.files)
  const inside: Record<string, ForeignObject[]> = {}
  const below: ForeignObject[] = []
  const stack = [...files]
  while (stack.length) {
    const parent = stack.pop() as ForeignObject
    const children = nesting.childrenOf(parent)
    if (children.length === 0 || inside[parent.ref]) continue
    inside[parent.ref] = children
    below.push(...children)
    stack.push(...children)
  }
  const counted = [...files, ...below]
  const counts = counted.length > 0 ? await conversationCountsOf(counted, query, manifests) : {}
  return { all: contents.files, files, inside, counts }
}

/** Every Folder this identity can see, for the sidebar. */
export async function readFolders(read: QueryFn = loadQuery()): Promise<FolderSummary[]> {
  return listFolders(read, await listRead())
}

/**
 * What archiving a Folder would hide, worded for the warning (FOL-46).
 *
 * The counts are interop's `archiveImpact`, so Ship and Peek say the same
 * numbers; the words are Ship's. `folders` is the sidebar's listing, which
 * saves reading it again and names where a file stays visible.
 */
export async function folderArchiveImpact(channel: string, folders?: FolderSummary[]): Promise<{ hides: string[]; staysVisible: string[] }> {
  const impact = await archiveImpact(channel, loadQuery(), { folders, cache: manifests })
  const hides = impact.hides.map(({ kind, count }) => countOf(kind, count))
  const byFolder = new Map<string, number>()
  for (const file of impact.staysVisible) {
    const name = file.in[0]?.name ?? 'another team'
    byFolder.set(name, (byFolder.get(name) ?? 0) + 1)
  }
  const staysVisible = [...byFolder].map(([name, n]) => `${n} ${n === 1 ? 'file' : 'files'} also in ${name}`)
  return { hides, staysVisible }
}

/** "14 issues", by the kind's plain name. A kind Ship has never heard of is a file. */
function countOf(kind: number, n: number): string {
  const [one, many] = KIND_WORDS[kind] ?? ['file', 'files']
  return `${n} ${n === 1 ? one : many}`
}

const KIND_WORDS: Record<number, [string, string]> = {
  30850: ['project', 'projects'],
  30851: ['issue', 'issues'],
  30840: ['topic', 'topics'],
  39000: ['team', 'teams'],
}
