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
import type { SignedEvent } from '@estiva-app/protocol'
import {
  conversationCountsOf,
  createPeopleCache,
  createProjectionCache,
  listFolders,
  resolveFolderContents,
  resolveForeignObject,
  type FolderContents,
  type FolderSummary,
  type ForeignObject,
} from '@estiva-app/interop'

/** Chain-walking, from the runtime — one implementation, not one per consumer. */
export { pickWidget } from '@estiva-app/interop'
import { relatedTo } from '@/lib/ownKinds'
import { relay } from './store'

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

export function resolveForeign(reference: string): Promise<ForeignObject | null> {
  // `0` is the list-depth budget, at the top. Positional because that is the
  // runtime's signature; naming them here would be inventing an adapter the
  // seam does not need.
  return resolveForeignObject(reference, query, profiles.viaRelay(query), 0, manifests)
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

/** The foreign files placed under one of Ship's objects, with their conversation counts. */
export interface RelatedFiles {
  /** One level, in the Folder's order — see `relatedTo`. */
  files: ForeignObject[]
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
  const counts = files.length > 0 ? await conversationCountsOf(files, query, manifests) : {}
  return { files, counts }
}

/** Every Folder this identity can see, for the sidebar. */
export function readFolders(): Promise<FolderSummary[]> {
  return listFolders(query)
}
