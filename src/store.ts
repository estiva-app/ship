/**
 * Estiva Ship's data layer: publish and read, over `lib/nostr/relay.ts`.
 *
 * There is no database here and no cache. Every read is a query against the
 * relay and a fresh fold — which is slower than it could be and is the honest
 * shape for the claim being made. If Ship kept its own materialised copy
 * of the state, "two apps agree on the data" would be measuring Ship's
 * cache rather than the shared record.
 */
import type { PublishResult, Relay } from '../lib/nostr/relay'
import type { Signer } from '../lib/nostr/signer'
import {
  buildCreateChannel,
  type SignedEvent,
  type ThreadRef,
  type UnsignedEvent,
} from '../lib/nostr/events'
import {
  assertFolderId,
  buildChange,
  buildConversationMessage,
  buildDeletion,
  buildIssue,
  buildProject,
  issueAddr,
  projectAddr,
} from './events'
import { findNaddrs, naddrToAddr } from '../lib/nostr/nip19'
import { foldFolder, projectFolders, type FolderState } from './fold'
import { directoryFrom, type Directory } from './profiles'
import { KIND } from './kinds'
import { buildRecommendation } from './manifest'
import { MANIFEST_ADDRESS } from './manifest-address'

/**
 * Kinds the reader pulls for a Folder.
 *
 * `kind:9` is Peek's topic message, and it is here because a project is that
 * Folder — the topic's conversations *are* the project's, read in one round
 * trip alongside everything else.
 */
const FOLDER_KINDS = [KIND.PROJECT, KIND.ISSUE, KIND.CHANGE, KIND.MESSAGE]

/**
 * Turn `nostr:naddr…` in a message body into addresses.
 *
 * This is what makes a Peek conversation land under the issue it mentions: a
 * person typing in Peek writes a reference, not an `a` tag, and that reference
 * is the only thing saying what the thread is about. Undecodable pointers are
 * dropped rather than thrown — a message is free text and may contain anything.
 */
function referencedAddresses(body: string): string[] {
  const out: string[] = []
  for (const naddr of findNaddrs(body)) {
    try {
      out.push(naddrToAddr(naddr))
    } catch {
      // Not a pointer we can read. Nothing to attach it to.
    }
  }
  return out
}

export class Store {
  constructor(
    private readonly relay: Relay,
    readonly signer: Signer,
  ) {}

  /**
   * Sign and publish.
   *
   * The store does not know how signing happens — a local key, the identity
   * service, or a browser extension all look the same from here (PEEK-44). That
   * is the point: this app works for anyone with a signer, not only for people
   * with an Estiva account.
   */
  private async publish(unsigned: UnsignedEvent): Promise<PublishResult> {
    return this.relay.publish(await this.signer.sign(unsigned))
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
   * non-member's query returns zero rows rather than an error, so a Ship
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
      buildCreateChannel(this.signer.pubkey, Date.now(), {
        channelUuid: folder,
        name,
        visibility: 'open',
        channelType: 'forum',
        about: 'Ship Folder',
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
   *
   * That ordering survives REW-11 even though the reason narrowed. The project
   * record is global now, so it no longer needs the channel to exist — but its
   * issues, changes and conversation all still carry an `h`, so a project whose
   * Folder was never created is a project nothing can be filed into. Bailing out
   * when `ensureFolder` fails is therefore still right: publishing the record
   * anyway would advertise a container that does not exist, and advertising it
   * *globally* would put that claim in front of everyone rather than only the
   * person who tried.
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
        return { result: created, addr: projectAddr(this.signer.pubkey, id), id, folder }
      }
    }

    const result = await this.publish(
      buildProject(this.signer.pubkey, Date.now(), {
        projectId: id,
        title: args.title,
        description: args.description,
        lead: args.lead,
        folder,
      }),
    )
    return { result, addr: projectAddr(this.signer.pubkey, id), id, folder }
  }

  /**
   * Hide a project from the lists, or bring it back.
   *
   * A change event, so it is reversible, attributable and available to anyone
   * in the Folder rather than only the project's author. This is the operation
   * that should be reached for; `deleteProject` is the narrow one.
   */
  archiveProject(args: {
    recordFolder: string
    project: string
    archived: boolean
  }): Promise<PublishResult> {
    return this.setField({
      folder: args.recordFolder,
      target: args.project,
      field: 'archived',
      value: args.archived ? 'true' : '',
      note: args.archived ? 'archived' : 'unarchived',
    })
  }

  /**
   * Ask the relay to drop a project's record.
   *
   * Only the project's author can do this — NIP-09 is author-scoped — and it
   * only removes the *record*. The issues in the Folder are separate events
   * with their own authors; they survive, and simply stop being reachable from
   * this app once the project they hung off is gone. Callers should say that
   * out loud before publishing.
   */
  deleteProject(args: {
    recordFolder: string
    project: string
    reason?: string
  }): Promise<PublishResult> {
    return this.publish(
      buildDeletion(this.signer.pubkey, Date.now(), {
        target: args.project,
        folder: args.recordFolder,
        reason: args.reason,
      }),
    )
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
  async linkProjectFolder(args: {
    /** The Folder the project *record* lives in — its own `h`. */
    recordFolder: string
    project: string
    folder: string
  }): Promise<PublishResult & { announced: boolean; announceReason?: string }> {
    assertFolderId(args.folder)
    const note = `linked to Folder ${args.folder.slice(0, 8)}…`

    // The change that decides the pairing. It goes where the record lives,
    // because that is the Folder every reader of this project already loads.
    const linked = await this.setField({
      folder: args.recordFolder,
      target: args.project,
      field: 'folder',
      value: args.folder,
      note,
    })
    if (!linked.ok) return { ...linked, announced: false }
    if (args.folder === args.recordFolder) return { ...linked, announced: true }

    // The same statement again, published *into* the Folder being paired.
    //
    // Without it that Folder contains no trace of the pairing at all: the
    // project record keeps the `h` it was born with, and so does the change
    // above, so an app reading the new Folder sees nothing naming the project.
    // Peek shipped a reader that infers it from the issues instead
    // (estiva-app/peek#54) — which works, and stops working for a Folder paired
    // before any issue is filed in it. Inference was the only option because
    // nothing here said it out loud; this is Ship saying it out loud.
    //
    // Deliberately the identical field and value, not a new vocabulary. It
    // folds to the same state, so a reader that already understands `folder`
    // needs no change, and one that loads both Folders sees the statement twice
    // and folds it once — last-write-wins is idempotent for a repeated value.
    const announced = await this.setField({
      folder: args.folder,
      target: args.project,
      field: 'folder',
      value: args.folder,
      note,
    })

    // The pairing itself succeeded either way, so this is not a failure to
    // report as one. It is a real caveat though — a Folder that refused the
    // write is a Folder other apps may not find the project in — so it is
    // returned rather than swallowed, and the caller says so.
    return {
      ...linked,
      announced: announced.ok,
      announceReason: announced.ok ? undefined : announced.reason,
    }
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
      buildIssue(this.signer.pubkey, Date.now(), { issueId: id, ...args }),
    )
    return { result, addr: issueAddr(this.signer.pubkey, id), id }
  }

  /**
   * Start a conversation, or reply in one.
   *
   * A `kind:9` in the Folder — the same kind and shape Peek writes for a topic
   * message. That is the entire integration: Peek's sync imports a foreign
   * pubkey's root message as a conversation and one carrying an `e` tag as a
   * reply, so anything posted here appears there without Peek changing.
   *
   * `about` names the Issue or Project the conversation concerns. When it is an
   * issue, its `nostr:naddr` is appended to the body as well — Peek renders that
   * as the issue's widget above the message, so a comment arriving in the topic
   * says what it is about instead of being a bare line of text.
   */
  postMessage(args: {
    folder: string
    body: string
    replyTo?: ThreadRef
    about?: string
    /** Reference to append so other apps can see what this is about. */
    aboutRef?: string
  }): Promise<PublishResult> {
    const body = args.aboutRef ? `${args.body}\n\n${args.aboutRef}` : args.body
    return this.publish(
      buildConversationMessage(this.signer.pubkey, Date.now(), {
        folder: args.folder,
        body,
        replyTo: args.replyTo,
        about: args.about,
      }),
    )
  }

  /**
   * **Ship does not publish `kind:0`. Estiva ID does, and it is the only
   * writer** (PEEK-48).
   *
   * There was a `publishProfile` here, and Peek had one too; each built a
   * profile from its own idea of a person, which is why one human could arrive
   * in the two apps as two different people. Two writers and no agreement is
   * the shape, not a bug in either publisher — one writer is the fix.
   *
   * Nothing could put it back by accident: `/sign` refuses `kind:0` for every
   * app, always, so an app cannot get a profile signed even if it asks. The
   * anonymous key could technically still sign one locally, and deliberately
   * does not — see `displayName` in `apps/ship/app.ts` for why an anonymous
   * participant has no profile rather than a made-up one.
   */

  /**
   * Who these pubkeys are.
   *
   * **Ship reads profiles and writes none** (PEEK-48). This is the half that
   * was always right: without it every author renders as 64 hex characters even
   * though Estiva ID has published a name for that key — the data was there,
   * nobody was asking for it.
   *
   * A key with no profile stays 64 hex characters, and that is correct rather
   * than missing: an anonymous participant is anonymous. See `displayName` in
   * `apps/ship/app.ts`.
   *
   * **One filter, `authors` as an array.** The `#h` OR-ing bug documented on
   * `rawFolders` is specific to *tag* filters; `authors` is a top-level NIP-01
   * field and the relay does OR it. Peek issues exactly this query shape
   * against the same bridge (`convex/nostr/sync.ts`), so this is proven rather
   * than assumed.
   *
   * Returns whatever came back — a key with no profile is simply absent, which
   * the caller renders as a truncated pubkey.
   */
  async profiles(pubkeys: string[]): Promise<Directory> {
    const authors = [...new Set(pubkeys)].filter((pubkey) => /^[0-9a-f]{64}$/.test(pubkey))
    if (!authors.length) return new Map()
    const events = await this.relay.query([
      { kinds: [KIND.PROFILE], authors, limit: authors.length },
    ])
    return directoryFrom(events)
  }

  /**
   * Tell the world which app handles Ship's kinds.
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
          buildRecommendation(this.signer.pubkey, Date.now(), {
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
    return this.publish(buildChange(this.signer.pubkey, Date.now(), args))
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
   *
   * **This and `loadFolders` filter by `#h`, so they do not see a global project
   * record** — one carrying `buzz-channel` instead of `h`. Such a Folder reads
   * as issues with no project. That is correct rather than broken: a global
   * record is by definition in no Folder, and a second query to put it back
   * would undo REW-11. `loadAll` is the method that sees everything, and it is
   * what both the app and the agent use; these two are for scripts and for
   * reading one container in isolation.
   */
  async loadFolder(folder: string, limit = 2000): Promise<FolderState> {
    return foldFolder(await this.rawFolders([folder], limit), referencedAddresses)
  }

  /**
   * Read several Folders at once.
   *
   * One filter with an `#h` array rather than a query per Folder: the whole
   * point of loading a workspace is that it fans out over every project, and
   * doing that serially would make the issue list N round trips deep.
   */
  async loadFolders(folders: string[], limit = 2000): Promise<FolderState> {
    return foldFolder(await this.rawFolders(folders, limit), referencedAddresses)
  }

  /**
   * Everything this identity can see: every project, and everything in it.
   *
   * **Discovery, not an index.** The first round trip asks the relay for
   * `kind:30850` and `kind:30851` with no `#h` at all, and access control
   * decides what comes back — an object in a Folder you are not a member of,
   * and which is not open, simply is not there. That is the whole reason there is no workspace object: Buzz already
   * scopes this by community, resolved from the relay host before the request is
   * even authenticated (`ARCHITECTURE.md` §3 Step 0). The relay URL *is* the
   * workspace, so a workspace Folder would be a worse copy of something the
   * substrate already guarantees.
   *
   * That unscoped first query is also why this method needs no change for
   * REW-11: a global project record comes back from exactly the same filter,
   * and `projectFolders` reads its `buzz-channel` where it used to read `h`.
   *
   * **Issues are discovered directly as well as through their projects** — see
   * SHI-7 and the note inside. Reaching them only through a parent loses every
   * issue whose parent was deleted, which was 12 of 13 unreachable issues on
   * production.
   *
   * At least two round trips, and they cannot be collapsed: the widening
   * query's `#h` list *is* the answer to the discovery one.
   *
   * Folded as a single stream at the end rather than per Folder. Not an
   * optimisation — a re-linked project's record and its older issues sit in
   * different Folders, and folding those separately would drop changes.
   */
  async loadAll(limit = 2000): Promise<FolderState> {
    /*
      Two discovery queries, not one, and the second is the whole of SHI-7.

      Discovering only projects and widening into their Folders loses every
      issue whose parent does not resolve. On production that was 13 of 93,
      and none of them for the reason anybody assumed: twelve had a project
      record that was *deleted*, one never carried an `a` tag, and all
      thirteen sat in Folders this reader could already see. So it was never
      an access problem — nothing had asked for them.

      Asking for `kind:30851` directly is the same unscoped shape the coverage
      report already used to *count* them. The count was honest and the read
      was not; this closes that gap.
    */
    let events = await this.relay.query([
      { kinds: [KIND.PROJECT], limit },
      { kinds: [KIND.ISSUE], limit },
    ])
    const fetched = new Set<string>()

    /**
     * Widen until no new Folder appears.
     *
     * Not a loop for elegance — a re-linked project genuinely cannot be resolved
     * in one pass. The discovery query asks for `kind:30850` only, so it cannot
     * contain the `kind:1851` that re-points a project at a Peek topic; that
     * change lives in the Folder the *record* is in, which is only learned in
     * the first pass. Reading once therefore finds the project, misses the
     * re-link, and never queries the topic — so issues filed after pairing are
     * written correctly and then never read back, which looks exactly like
     * "creating a ticket is broken".
     *
     * Two passes settle the normal case and the re-linked one. The bound is
     * four, so a pathological chain of re-links degrades to a partial read
     * rather than an unbounded fan-out.
     */
    for (let pass = 0; pass < 4; pass++) {
      const state = foldFolder(events, referencedAddresses)
      const wanted = new Set<string>()
      for (const project of state.projects) {
        for (const folder of projectFolders(project, state.activity)) {
          if (!fetched.has(folder)) wanted.add(folder)
        }
      }
      /*
        An issue's own Folder, which is NOT reachable from its project when the
        project is gone — and skipping it is worse than not finding the issue
        at all.

        The issue root carries no status and no assignee by design; both are
        `kind:1851` changes living in the issue's Folder. Fold an issue without
        them and it renders with the *default* status, confidently.

        Measured on the thirteen by folding both ways and diffing: 14 change
        events target them, and they land on **2 distinct issues** — both of
        which are `done` and assigned, and both of which would have come back
        `todo` and unassigned. (The event count is not the issue count: six
        status changes were one ticket moved through its lifecycle several
        times.) Two wrong rows is a smaller number than thirteen missing ones
        and a worse outcome, because a missing row is noticed and a wrong
        status is believed.
      */
      for (const issue of state.issues) {
        if (issue.folder && !fetched.has(issue.folder)) wanted.add(issue.folder)
      }
      if (!wanted.size) break
      for (const folder of wanted) fetched.add(folder)
      events = [...events, ...(await this.rawFolders([...wanted], limit))]
    }

    return foldFolder(events, referencedAddresses)
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
    // `h` first, then `buzz-channel`: a REW-11 project record is global and has
    // no `h` at all, so keying only on `h` would resolve the event and then
    // throw it away — reported to the person as "you may not have access",
    // which would be a lie about the one record type most likely to be public.
    const folder =
      event.tags.find((t) => t[0] === 'h')?.[1] ??
      event.tags.find((t) => t[0] === 'buzz-channel')?.[1]
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
