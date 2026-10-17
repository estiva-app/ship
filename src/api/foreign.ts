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
  folderOf,
  resolveActingManifest,
  conversationCountsOf,
  archiveImpact,
  createPeopleCache,
  createProjectionCache,
  listFolders,
  nestingOf,
  resolveFolderContents,
  resolveForeignEvent,
  resolveForeignObject,
  resolveForeignRoots,
  fileCandidates,
  searchFileReferences,
  type FolderContents,
  type FolderSummary,
  type ForeignObject,
} from '@estiva-app/interop'

/** Chain-walking, from the runtime — one implementation, not one per consumer. */
export { pickWidget } from '@estiva-app/interop'
import { KIND_CHANGE, type ReferenceCandidate } from '@estiva-app/conversation'
import { relatedTo } from '@/lib/ownKinds'
import { relay, signer } from './store'

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
}

export function resolveForeign(reference: string, { folderFiles }: ResolveOptions = {}): Promise<ForeignObject | null> {
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

/** The tags a §7.3 change carries: the file, the field, its value, the Folder, the writer's clock, and a person it names. */
const CHANGE_TAGS = new Set(['a', 'field', 'value', 'h', 'ts', 'p'])

/** Whether what the runtime built is exactly one `kind:1851` change of `field` on `address`, in `folder`. */
function isFieldChange(built: readonly { kind: number; tags: string[][] }[], want: { address: string; folder: string; field: string }): boolean {
  if (built.length !== 1 || built[0].kind !== KIND_CHANGE) return false
  const tags = built[0].tags
  const one = (name: string) => tags.filter((t) => t[0] === name)
  if (!tags.every((t) => CHANGE_TAGS.has(t[0]))) return false
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
  if (!declared || declared.effect !== 'writes' || !declared.emits.field || declared.emits.listed) return { ok: false, reason: 'This can’t be changed from here.' }
  // The Folder comes off the file itself: the change is written into it.
  const [root] = await query([{ kinds: [pointer.kind], authors: [pointer.pubkey], '#d': [pointer.identifier], limit: 1 }])
  const folder = root ? folderOf(root) : undefined
  if (!folder) return { ok: false, reason: 'That file can’t be read from here.' }
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
export function readFolder(id: string): Promise<FolderContents> {
  return resolveFolderContents(id, query, profiles.viaRelay(query), manifests)
}

/**
 * A Folder's files for a move to plan from (SPEC §3.3) — what lists what
 * beneath it, and nothing a person reads, so no profiles are asked for.
 * Archived files included: a topic archived under a project, or every file
 * under an archived project, moves with it (SHI-37).
 */
export async function readFolderListing(id: string): Promise<FolderContents['files']> {
  return (await resolveFolderContents(id, query, async () => ({}), manifests, { includeArchived: true })).files
}

/**
 * `[`'s search tier (PEE-21): the files whose current title or ref holds
 * `text`, as this identity can read them. Rejects on a refused read, which
 * `referenceSearch` answers as no hits for a while.
 */
export function searchFiles(text: string): Promise<ReferenceCandidate[]> {
  return searchFileReferences(text, query, { cache: manifests })
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
  if (!('addresses' in files)) return fileCandidates(files, tier, query, { cache: manifests })
  const objects = await resolveForeignRoots(files.addresses, query, manifests)
  return fileCandidates(objects, tier, query, { cache: manifests, at: files.at })
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
export function readFolders(): Promise<FolderSummary[]> {
  return listFolders(query)
}

/**
 * What archiving a Folder would hide, worded for the warning (FOL-46).
 *
 * The counts are interop's `archiveImpact`, so Ship and Peek say the same
 * numbers; the words are Ship's. `folders` is the sidebar's listing, which
 * saves reading it again and names where a file stays visible.
 */
export async function folderArchiveImpact(channel: string, folders?: FolderSummary[]): Promise<{ hides: string[]; staysVisible: string[] }> {
  const impact = await archiveImpact(channel, query, { folders, cache: manifests })
  const hides = impact.hides.map(({ kind, count }) => countOf(kind, count))
  const byFolder = new Map<string, number>()
  for (const file of impact.staysVisible) {
    const name = file.in[0]?.name ?? 'another folder'
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
  39000: ['folder', 'folders'],
}
