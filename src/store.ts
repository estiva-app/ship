/**
 * Linear-lite's data layer: publish and read, over `lib/nostr/relay.ts`.
 *
 * There is no database here and no cache. Every read is a query against the
 * relay and a fresh fold — which is slower than it could be and is the honest
 * shape for the claim being made. If Linear-lite kept its own materialised copy
 * of the state, "two apps agree on the data" would be measuring Linear-lite's
 * cache rather than the shared record.
 */
import { signEvent } from '../lib/nostr/sign'
import type { Identity, PublishResult, Relay } from '../lib/nostr/relay'
import { buildCreateChannel, type SignedEvent, type UnsignedEvent } from '../lib/nostr/events'
import { assertFolderId, buildChange, buildComment, buildIssue, buildProject, issueAddr, projectAddr } from './events'
import { foldFolder, projectFolders, type FolderState } from './fold'
import { KIND } from './kinds'
import { buildRecommendation } from './manifest'
import { MANIFEST_ADDRESS } from './manifest-address'

/**
 * Kinds the reader pulls for a Folder.
 *
 * Comments are included: they live in the Folder like everything else, and
 * pulling them in the same round trip is what makes the comment count on an
 * issue row free rather than a query per issue.
 */
const FOLDER_KINDS = [KIND.PROJECT, KIND.ISSUE, KIND.CHANGE, KIND.COMMENT]

export class Store {
  constructor(
    private readonly relay: Relay,
    readonly identity: Identity,
  ) {}

  private publish(unsigned: UnsignedEvent): Promise<PublishResult> {
    return this.relay.publish(signEvent(unsigned, this.identity.secretKeyHex))
  }

  /**
   * Make sure the Folder exists, and that we can write into it.
   *
   * FRICTION.md A4: ordering is enforced. Publishing into a channel the relay
   * has never heard of comes back `restricted: not a channel member` — which
   * reads as a permission problem and is actually a missing container. Creating
   * it first is cheap, and a duplicate create is reported as
   * `accepted:false, "duplicate: channel already exists"`, which `relay.ts`
   * already maps to success (FRICTION.md A2).
   *
   * **Open, not private.** A private Folder is invisible to every other app: a
   * non-member's query returns zero rows rather than an error, so a Linear-lite
   * issue in one silently fails to render anywhere else (FRICTION.md A7). Buzz
   * treats `open` as accessible to everyone — `get_accessible_channel_ids`
   * unions members with all open channels — which is what makes a Folder a
   * *shared* container rather than this app's private storage. Peek creates its
   * own topics open for the same reason.
   *
   * The trade-off is real and belongs in the UI rather than buried here: on this
   * relay `open` also bypasses the write gate, so anyone on the relay can write
   * into the Folder, not just read it. For a Folder that should be restricted,
   * pair with an existing one (`adoptFolder`) whose membership already means
   * something.
   */
  async ensureFolder(folder: string, name: string): Promise<PublishResult> {
    assertFolderId(folder)
    return this.publish(
      buildCreateChannel(this.identity.pubkey, Date.now(), {
        channelUuid: folder,
        name,
        visibility: 'open',
        channelType: 'forum',
        about: 'Linear-lite Folder',
      }),
    )
  }

  /**
   * Open a Folder somebody else already created — typically a Peek topic.
   *
   * This is the case the RFC actually describes: "the Peek topic, the Linear
   * project, the messages all carry the same `h`. One container, many
   * projections" (RFC_UPDATES.md §1.1). Creating a *new* Folder for a project
   * that already has a Peek topic produces two containers for one thing, and
   * then nobody in the topic can see the issues.
   *
   * Deliberately does NOT publish a `kind:9007`. The channel exists; re-creating
   * it would either be a no-op duplicate or, worse, hand ownership questions to
   * whoever clicked last. Access is whatever the Folder's owner already decided,
   * which is the point of pairing rather than forking.
   */
  async adoptFolder(folder: string): Promise<{ ok: boolean; reason?: string }> {
    assertFolderId(folder)
    // A read is the honest membership test: if this returns rows we can see the
    // Folder, and if it throws or returns nothing we say so rather than
    // discovering it three publishes later.
    try {
      await this.relay.query([{ kinds: [KIND.ISSUE], '#h': [folder], limit: 1 }])
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: (error as Error).message }
    }
  }

  /**
   * Create a project — which is to say, create a Folder and put a project
   * record in it.
   *
   * Pass `folder` to use one that **already exists**, in practice a Peek topic.
   * That path deliberately does not publish a `kind:9007`: the container is
   * already there, and re-creating it would fork one thing into two, which is
   * the exact failure pairing exists to avoid. It is also all that "linking a
   * topic to a project" needs to be — the project is created *in* the topic,
   * so there is no second container and nothing to reconcile afterwards.
   *
   * When creating a new Folder the order matters: it has to exist before
   * anything can be written into it (FRICTION.md A4).
   */
  async createProject(args: {
    title: string
    description?: string
    lead?: string
    /** Use an existing Folder — a Peek topic — instead of making one. */
    folder?: string
  }): Promise<{ result: PublishResult; addr: string; id: string; folder: string }> {
    const id = crypto.randomUUID()
    const folder = args.folder ?? crypto.randomUUID()

    if (!args.folder) {
      const created = await this.ensureFolder(folder, `project-${folder.slice(0, 8)}`)
      if (!created.ok) {
        return { result: created, addr: projectAddr(this.identity.pubkey, id), id, folder }
      }
    }

    const result = await this.publish(
      buildProject(this.identity.pubkey, Date.now(), {
        projectId: id,
        title: args.title,
        description: args.description,
        lead: args.lead,
        folder,
      }),
    )
    return { result, addr: projectAddr(this.identity.pubkey, id), id, folder }
  }

  /**
   * Re-point an existing project at a different Folder.
   *
   * Only needed after the fact. Creating the project in the topic's Folder is
   * the normal way to pair them; this exists because an event cannot change its
   * own `h`, so a project that already exists elsewhere has no other way to say
   * "my work happens over there now".
   *
   * A change event rather than an edit, so somebody who is not the project's
   * author can do it — which matters here more than anywhere, since the person
   * who owns the Peek topic is frequently not the person who made the project.
   *
   * Issues already filed under the old Folder keep their `h` and do not move.
   * Readers take the union of every Folder a project has pointed at
   * (`projectFolders`) rather than pretending the history did not happen.
   */
  linkProjectFolder(args: {
    /** The Folder the project *record* lives in — its own `h`. */
    recordFolder: string
    project: string
    folder: string
  }): Promise<PublishResult> {
    assertFolderId(args.folder)
    return this.setField({
      folder: args.recordFolder,
      target: args.project,
      field: 'folder',
      value: args.folder,
      note: `linked to Folder ${args.folder.slice(0, 8)}…`,
    })
  }

  async createIssue(args: {
    folder: string
    title: string
    description?: string
    projectAddr?: string
    ref?: string
  }): Promise<{ result: PublishResult; addr: string; id: string }> {
    const id = crypto.randomUUID()
    const result = await this.publish(
      buildIssue(this.identity.pubkey, Date.now(), { issueId: id, ...args }),
    )
    return { result, addr: issueAddr(this.identity.pubkey, id), id }
  }

  /**
   * Comment on an Issue or Project.
   *
   * NIP-22, so this needs no Linear-lite kind at all — which is the whole
   * reason to use it. Peek can read and write the same comments without either
   * app owning the format.
   */
  comment(args: { folder: string; target: string; body: string }): Promise<PublishResult> {
    return this.publish(buildComment(this.identity.pubkey, Date.now(), args))
  }

  /**
   * Tell the world which app handles Linear-lite's kinds.
   *
   * Published from the *user's* key, not the app's. A `#k` query returns every
   * manifest claiming a kind and NIP-89 does not rank them; this is what lets a
   * consumer choose. Idempotent — kind:31989 is addressable by
   * `(pubkey, kind, d)`, so calling this on every load replaces rather than
   * accumulates.
   */
  async recommendHandler(relayHint?: string): Promise<PublishResult[]> {
    return Promise.all(
      [KIND.PROJECT, KIND.ISSUE].map((kind) =>
        this.publish(
          buildRecommendation(this.identity.pubkey, Date.now(), {
            kind,
            manifestAddr: MANIFEST_ADDRESS,
            relayHint,
          }),
        ),
      ),
    )
  }

  /**
   * Set one field on one object.
   *
   * Deliberately takes an *address*, not an object we loaded — the caller may
   * be acting on something another app created, and this path must not care.
   */
  setField(args: {
    folder: string
    target: string
    field: string
    value: string
    note?: string
  }): Promise<PublishResult> {
    return this.publish(buildChange(this.identity.pubkey, Date.now(), args))
  }

  /**
   * Read a Folder's whole state.
   *
   * One query, three kinds, filtered by `#h`. `POST /query` takes a **bare
   * array** of filters — a single filter object gets
   * `invalid type: map, expected a sequence` (FRICTION.md A5).
   *
   * `limit` is generous rather than paged: the fold needs the *complete* change
   * stream to be correct, and a truncated stream would silently produce a stale
   * status rather than an error. Paging this properly means folding
   * incrementally, which the MVP does not need.
   */
  async loadFolder(folder: string, limit = 2000): Promise<FolderState> {
    return foldFolder(await this.rawFolders([folder], limit))
  }

  /**
   * Read several Folders at once.
   *
   * One filter with an `#h` array rather than a query per Folder: the whole
   * point of loading a workspace is that it fans out over every project, and
   * doing that serially would make the issue list N round trips deep.
   */
  async loadFolders(folders: string[], limit = 2000): Promise<FolderState> {
    return foldFolder(await this.rawFolders(folders, limit))
  }

  /**
   * Everything this identity can see: every project, and everything in it.
   *
   * **Discovery, not an index.** The first query asks the relay for `kind:30850`
   * with no `#h` at all, and access control decides what comes back — a project
   * in a Folder you are not a member of, and which is not open, simply is not
   * there. That is the whole reason there is no workspace object: Buzz already
   * scopes this by community, resolved from the relay host before the request is
   * even authenticated (`ARCHITECTURE.md` §3 Step 0). The relay URL *is* the
   * workspace, so a workspace Folder would be a worse copy of something the
   * substrate already guarantees.
   *
   * Two round trips, and they cannot be collapsed: the second query's `#h` list
   * *is* the answer to the first.
   *
   * Folded as a single stream at the end rather than per Folder. Not an
   * optimisation — a re-linked project's record and its older issues sit in
   * different Folders, and folding those separately would drop changes.
   */
  async loadAll(limit = 2000): Promise<FolderState> {
    const projectEvents = await this.relay.query([{ kinds: [KIND.PROJECT], limit }])
    const discovered = foldFolder(projectEvents)

    const folders = new Set<string>()
    for (const project of discovered.projects) {
      for (const folder of projectFolders(project, discovered.activity)) folders.add(folder)
    }

    // The project records came back above, but their *changes* and issues did
    // not — that first query asked for one kind. Re-reading the Folders picks up
    // everything, project records included, so the fold sees one complete stream.
    const contentEvents = folders.size ? await this.rawFolders([...folders], limit) : []
    return foldFolder([...projectEvents, ...contentEvents])
  }

  /**
   * Raw events for one or more Folders — for debugging and verification.
   *
   * **One filter per Folder, not one filter with an `#h` array.** NIP-01 says
   * the values of a tag filter are OR-ed, and Buzz does not do that: measured
   * against the live relay, `{'#h': [A, B]}` returns only A's events, silently.
   * Two filters return both.
   *
   * That failure mode is the worst kind — no error, just a short read, which
   * folds into a project whose issues have all vanished. Costing one filter
   * object per project is cheap next to that; it is still a single round trip,
   * because `POST /query` takes a **bare array** of filters (FRICTION.md A5).
   */
  async rawFolders(folders: string[], limit = 2000): Promise<SignedEvent[]> {
    for (const folder of folders) assertFolderId(folder)
    if (!folders.length) return []
    return this.relay.query(
      folders.map((folder) => ({ kinds: FOLDER_KINDS, '#h': [folder], limit })),
    )
  }

  /**
   * Resolve a single object by address, without knowing its Folder.
   *
   * This is what makes an inbound `nostr:naddr…` work: a pointer carries the
   * kind, author and `d`, but not the container, and asking the user which
   * Folder their link belongs to would defeat the point of the link.
   *
   * Peek already relies on this exact query shape working without an `#h`
   * filter (`projection.ts`), so the capability is proven rather than assumed —
   * access control still applies, it is the *scoping* that is not required.
   */
  async resolveObject(
    address: string,
  ): Promise<{ event: SignedEvent; folder: string } | null> {
    const [kind, pubkey, d] = address.split(':')
    if (!kind || !pubkey || d === undefined) return null
    const events = await this.relay.query([
      { kinds: [Number(kind)], authors: [pubkey], '#d': [d], limit: 1 },
    ])
    const event = events.find((e) => e.tags.find((t) => t[0] === 'd')?.[1] === d)
    if (!event) return null
    const folder = event.tags.find((t) => t[0] === 'h')?.[1]
    return folder ? { event, folder } : null
  }

}

/**
 * Next display key for a project, e.g. `LL-7`.
 *
 * Display-only, per the spec: never used for addressing, never authoritative.
 * It is derived from what we can currently see, so two people creating an issue
 * at the same moment can produce the same key. That is a cosmetic collision and
 * fixing it would need a counter nobody owns — the address is the identity.
 */
export function nextRef(prefix: string, existingRefs: (string | undefined)[]): string {
  const used = existingRefs
    .filter((ref): ref is string => !!ref && ref.startsWith(`${prefix}-`))
    .map((ref) => Number.parseInt(ref.slice(prefix.length + 1), 10))
    .filter((n) => Number.isFinite(n))
  return `${prefix}-${used.length ? Math.max(...used) + 1 : 1}`
}

/** A short, stable prefix from a project title: "Payment integration" → "PAY". */
export function refPrefix(title: string): string {
  const letters = title.toUpperCase().replace(/[^A-Z]/g, '')
  return letters.slice(0, 3) || 'LL'
}
