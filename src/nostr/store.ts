/**
 * Estiva Ship's data layer: publish and read, over `lib/nostr/relay.ts`.
 *
 * There is no database here and no cache. Every read is a query against the
 * relay and a fresh fold — which is slower than it could be and is the honest
 * shape for the claim being made. If Ship kept its own materialised copy
 * of the state, "two apps agree on the data" would be measuring Ship's
 * cache rather than the shared record.
 */
import type { Embed, Imeta, NostrTag, PartPointer, PublishResult, Relay } from '@estiva-app/protocol'
import { partsOf } from '@estiva-app/protocol'
import type { Signer } from './signer'
import {
  buildCreateChannel,
  type SignedEvent,
  type ThreadRef,
  type UnsignedEvent,
} from '@estiva-app/protocol'
import {
  assertFolderId,
  buildChange,
  buildConversationMessage,
  buildDeletion,
  buildIssue,
  buildProject,
  issueAddr,
  projectAddr,
  type CommentRef,
} from './events'
import { findNaddrs, naddrToAddr, buildReaction, buildEdit, buildDeletion as buildEventDeletion } from '@estiva-app/protocol'
import { planArchiveFolder, planCreateFolder, planDeleteFolder, planMoveFromFolders, planPlaceFile, planRenameFolder, planUnlistFile, type FolderRef, type MovableFile, type MoveRefusal } from '@estiva-app/interop'
import { foldFolder, type FolderState } from './fold'
import { buildMembershipChange, decorationsOf, foldAttachments, foldEdits, foldEmbeds, URGENT_TAG, type Decorations, type EditFold, type QueryFn } from '@estiva-app/conversation'
import { anchorIndex, type AnchorIndex } from './references'
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
const FOLDER_KINDS = [
  KIND.PROJECT,
  KIND.ISSUE,
  KIND.CHANGE,
  KIND.MESSAGE,
  KIND.COMMENT,
  // An edit rides with the messages it edits: 40003 carries an `h`, unlike a
  // reaction or a deletion, so it comes back on the Folder read rather than
  // needing a second query addressed by target (CON-4).
  KIND.MESSAGE_EDIT,
]

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

/**
 * The fold, plus the one thing it deliberately does not record — CON-7.
 *
 * A superset of `FolderState`, never a replacement for it. `foldFolder` is a
 * contract between this repository and `estiva-agent`, held to a recorded state
 * by `scripts/conformance.test.ts`, and adding a field to it is a change to
 * what the workspace *means* that has to land in both repos at once. Attachment
 * strength is not that: the same events fold to the same state, and `anchors` is
 * a second reading of the same input, taken here because this is the only place
 * that still has the events in hand.
 *
 * See `references.ts` for why the distinction cannot be recovered downstream:
 * `Conversation.about` is a union of tags and body text, unioned again across
 * every message in the thread, and `startConversation` writes the same address
 * into both — so no amount of subtracting one from the other separates them.
 */
export interface WorkspaceState extends FolderState {
  /** Message id → the addresses it is a comment on, by §6.4's per-tag rule. `references.ts` reads it. */
  anchors: AnchorIndex
  /**
   * Message id → its current text, where it was edited (CON-4).
   *
   * Beside the fold rather than inside it. `foldFolder` is a contract with
   * `estiva-agent` and its conformance test walks the union of keys, so an
   * `edited` field on `Message` would turn both repos red. The fold is
   * `@estiva-app/conversation`'s (SPEC §6.8, CON-5).
   */
  edits: Record<string, EditFold>
  /**
   * Message id → the files it carries: its own `imeta`, replaced by the
   * latest edit carrying any (CON-12, §6.8).
   *
   * Beside the fold for the same reason as `edits`: a `files` field on
   * `Message` would walk into the conformance test's union of keys and turn
   * both repos red.
   */
  attachments: Record<string, Imeta[]>
  /**
   * Message id → whom it names urgently: its `["urgent", <pubkey>]` tags
   * (SPEC §13.1, CON-24). The text holds the same `nostr:npub…` for an urgent
   * mention as for an ordinary one, so the chip's tone can come only from here.
   * Absent for a message with none, which is nearly all of them.
   *
   * Beside the fold for the same reason as `edits` and `attachments`.
   */
  urgent: Record<string, string[]>
  /**
   * Message id → the blocks of other objects it shows: its `part` tags (SPEC
   * §13.6.1, COM-2). An edit carries none, so an edited message keeps the
   * original's. Absent for a message with none.
   *
   * Beside the fold for the same reason as `edits`, `attachments` and `urgent`.
   */
  parts: Record<string, PartPointer[]>
  /**
   * Message id → the cards it asks for: its `embed` tags, replaced by the
   * latest edit carrying any (SPEC §13.6.2, OPT-16) — folded like
   * `attachments`, not kept like `parts`. Absent for a message with none.
   */
  embeds: Record<string, Embed[]>
  /**
   * Every Folder this read actually fetched (PER-3).
   *
   * Beside the fold, like the three above, and for the same reason: `foldFolder`
   * is a contract with `estiva-agent` whose conformance test walks the union of
   * its keys, so a `folders` field on `FolderState` would turn both repos red.
   *
   * It exists because the live socket needs the set and `loadAll` was the only
   * thing that knew it — discovery *derives* the Folder list while reading, so
   * there is no index to consult and nothing else can compute it. Which also
   * means the subscription cannot be opened until a read has landed; see
   * `useLiveWorkspace`.
   */
  folders: string[]
}

/**
 * Fold a set of events, and read off the same set the two things `foldFolder`
 * deliberately does not carry: tag-vs-body provenance, edits, and attachments.
 */
/** `WorkspaceState.urgent`: every event's `urgent` tag keys, by event id. An edit carries none (§6.6), so none is read off one. */
export function urgentIndex(events: readonly SignedEvent[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const event of events) {
    const keys = [...new Set(event.tags.filter((t) => t[0] === URGENT_TAG && t[1]).map((t) => t[1]))]
    if (keys.length > 0) out[event.id] = keys
  }
  return out
}

/** `WorkspaceState.parts`: every event's `part` tags, by event id (SPEC §13.6.1). */
export function partsIndex(events: readonly SignedEvent[]): Record<string, PartPointer[]> {
  const out: Record<string, PartPointer[]> = {}
  for (const event of events) {
    const parts = partsOf(event)
    if (parts.length > 0) out[event.id] = parts
  }
  return out
}

function read(events: SignedEvent[], folders: string[]): WorkspaceState {
  return {
    ...foldFolder(events, referencedAddresses),
    anchors: anchorIndex(events),
    edits: foldEdits(events),
    attachments: foldAttachments(events),
    urgent: urgentIndex(events),
    parts: partsIndex(events),
    embeds: foldEmbeds(events),
    // A parameter rather than derived from the events: the set that was
    // *asked for* is not the set that came back. A Folder holding nothing this
    // reader may see yields no events and would vanish from a derived list,
    // and then nothing would ever subscribe to it — so it would stay empty and
    // silent, which is indistinguishable from working.
    folders: [...new Set(folders)],
  }
}

/**
 * The events a workspace read returned, before the fold — PER-17.
 *
 * Not a materialised state: every event in it is exactly what the relay
 * answered, and it is folded fresh each time, so the header's claim still
 * holds. What it buys is that a read scoped to the Folders that changed can
 * replace just their slice and leave the rest as last answered, rather than
 * re-asking for the whole workspace — 3,483 events, 32 times in one minute,
 * when a person deleted issues with a few Ship tabs open.
 */
export interface WorkspaceEvents {
  events: SignedEvent[]
  /** Every Folder the read fetched. See `WorkspaceState.folders`. */
  folders: string[]
}

/** Fold a workspace read. `loadAll` is `foldWorkspace(await loadAllEvents())`. */
export function foldWorkspace(snapshot: WorkspaceEvents): WorkspaceState {
  return read(snapshot.events, snapshot.folders)
}

function folderOfEvent(event: SignedEvent): string | undefined {
  return event.tags.find((t) => t[0] === 'h')?.[1]
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
   * into the Folder, not just read it.
   *
   * No project is created this way any more: a project is filed into its
   * team's Folder (`createProject`, FOL-2).
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
   * Create a top-level Folder — FOL-8, RFC 0.4 §4.1: `kind:9007`, then
   * `kind:1852 add + name` listing nothing, planned by `planCreateFolder`.
   *
   * **Peek's `createFolderAsViewer`, event for event**, so a Folder made here
   * and one made there are the same wire object: no visibility (the relay's
   * default, open) and no channel type. The command gives it state from birth,
   * which is what makes it a top-level Folder in both apps' navigation — the
   * listings show only Folders with state that nothing lists.
   *
   * Published in order, stopping at the first refusal; `refusedAt` is its
   * index. 0 is no Folder at all; 1 is a channel that exists by its id and is
   * listed nowhere.
   */
  async createFolder(name: string): Promise<{ id: string; refusedAt?: number; result: PublishResult }> {
    const id = crypto.randomUUID()
    const { refusedAt, result } = await this.publishInOrder(planCreateFolder(this.signer.pubkey, Date.now(), { folder: id, name }))
    return { id, ...(refusedAt === undefined ? {} : { refusedAt }), result }
  }

  /**
   * Rename a Folder — FOL-8: the `kind:9002` alone, planned by
   * `planRenameFolder` as Peek's `renameFolderAsViewer` does. The title is the
   * channel's name and only that (SPEC §3.2); the relay refuses it to anybody
   * but the channel's owners and admins.
   */
  async renameFolder(args: { folder: string; name: string }): Promise<PublishResult> {
    assertFolderId(args.folder)
    const [rename] = planRenameFolder(this.signer.pubkey, Date.now(), args)
    return this.publish(rename)
  }

  /** Publish a Folder plan in order, stopping at the first refusal — each later event assumes the earlier ones were accepted. */
  private async publishInOrder(events: UnsignedEvent[]): Promise<{ refusedAt?: number; result: PublishResult }> {
    let result: PublishResult = { ok: true }
    for (const [index, event] of events.entries()) {
      result = await this.publish(event)
      if (!result.ok) return { refusedAt: index, result }
    }
    return { result }
  }

  /**
   * Create a project in a team — SPEC §6.7, RFC 0.5 §10.5 (FOL-2).
   *
   * **No Folder of its own.** It used to be paired with one: a fresh
   * `project-…` channel (`ensureFolder`) or a pasted Peek topic. A project
   * belongs to a team now, and its issues, changes and conversation carry the
   * team's `h` — the record's `buzz-channel` names the team, so `contentFolder`
   * folds to it and nothing downstream changes meaning.
   *
   * **Then it is listed in the team**, which the record alone never does. A
   * Folder with state lists only what its `kind:30890` names, and filing by `h`
   * never updates it, so without the `kind:1852` Peek does not place the
   * project — which is how 6 of 17 active projects came to be in no team.
   * Record first: `planPlaceFile` lists a file that was just published, and a
   * listing that names a record the relay refused would point at nothing.
   *
   * `placed` is reported separately rather than folded into `result`, because
   * the two failures differ: a refused record is no project at all, a refused
   * listing is a project Ship shows under its team and Peek does not.
   */
  async createProject(args: {
    title: string
    description?: string
    lead?: string
    /** The prefix of its issues' refs — SHI-4. */
    key?: string
    /** The one-line summary beside its name — SPEC §6.12. */
    summary?: string
    /** The team's Folder, and whether it has state — from a read, never a guess. */
    team: { folder: string; hasState: boolean }
  }): Promise<{ result: PublishResult; placed?: PublishResult; addr: string; id: string; folder: string }> {
    assertFolderId(args.team.folder)
    const id = crypto.randomUUID()
    const folder = args.team.folder
    const addr = projectAddr(this.signer.pubkey, id)

    const result = await this.publish(
      buildProject(this.signer.pubkey, Date.now(), {
        projectId: id,
        title: args.title,
        description: args.description,
        lead: args.lead,
        key: args.key,
        summary: args.summary,
        folder,
      }),
    )
    if (!result.ok) return { result, addr, id, folder }

    const { result: placed } = await this.publishInOrder(planPlaceFile(this.signer.pubkey, Date.now(), { folder, address: addr, hasState: args.team.hasState }))
    return { result, placed, addr, id, folder }
  }

  /**
   * Move a project to another top-level Folder — FOL-7, RFC 0.4 §2.
   *
   * **Only the listings change.** One `kind:1852 add` to `to`, then one
   * `kind:1852 remove` from each Folder in `from`, planned by interop's
   * `planMoveFromFolders` — the planner Peek and the agent move by too.
   * No `kind:1851` and no `buzz-channel` change: what is already written stays
   * where it is, and new comments follow the listing (`workFolder`, MAN-5);
   * both apps find a project's threads by anchor, not by Folder. The old "Pair with another Folder…" wrote the
   * record's Folder instead, and that is how Ship and Peek came to read one
   * project's conversation from two channels (PRO-21).
   *
   * `from` is every Folder that lists it now, not only one: a project a move
   * left in two (below) is taken out of both by moving it again. Empty for a
   * project no Folder lists, which is then only added.
   *
   * **What is listed beneath it moves with it** (SPEC §3.3): `listings` holds
   * each source Folder's files, archived ones included, and the one `add`
   * names the project and every file under it in any source — a topic started
   * under the project. So the add lands whole or not at all (SHI-37). A source
   * with no listing moves the project alone.
   *
   * **Add first, and nothing at all if either side has no state** — the
   * planner's rules. A refused `remove` leaves the project listed in both,
   * which is visible and fixed by moving again; `removed` says which Folders
   * still list it. `refused` is a move planned as unsafe, before anything was
   * sent — `target-is-private` included: a project's root carries no `h`, so it
   * is readable by the whole workspace wherever it is listed.
   */
  async moveProject(args: {
    project: string
    /** The Folders that list it now, each with `hasState` and `addresses` from a read. The target, if among them, is ignored. */
    from: readonly FolderRef[]
    to: FolderRef
    /** Each source Folder's files (`FolderContents.files`, archived included), by Folder id. */
    listings?: ReadonlyMap<string, readonly MovableFile[]>
  }): Promise<{ refused?: MoveRefusal; added?: PublishResult; removed: { folder: string; result: PublishResult }[] }> {
    assertFolderId(args.to.id)
    // One add naming everything every source lists beneath it, then a remove from each (SHI-37).
    const plan = planMoveFromFolders(this.signer.pubkey, Date.now(), {
      file: { ref: args.project, address: args.project },
      from: args.from,
      to: args.to,
      listings: args.listings ?? new Map(),
    })
    if (!plan.ok) return { refused: plan.reason, removed: [] }
    if (!plan.add) return { removed: [] }
    const added = await this.publish(plan.add)
    if (!added.ok) return { added, removed: [] }
    const removed: { folder: string; result: PublishResult }[] = []
    for (const { folder, event } of plan.removes) removed.push({ folder, result: await this.publish(event) })
    return { added, removed }
  }

  /**
   * Hide a project from the lists, or bring it back.
   *
   * A change event, so it is reversible, attributable and available to anyone
   * in the Folder rather than only the project's author. This is the operation
   * that should be reached for; `deleteProject` is the narrow one.
   *
   * `resolution` is what the person archiving said about it (FOL-46), carried
   * as the change's `content` — one event, so it cannot land without the
   * archive. It replaces the `archived` / `unarchived` placeholder notes, which
   * nothing ever displayed. The project's issues are archived with it when
   * read; nothing is written to them.
   */
  archiveProject(args: {
    recordFolder: string
    project: string
    archived: boolean
    resolution?: string
  }): Promise<PublishResult> {
    return this.setField({
      folder: args.recordFolder,
      target: args.project,
      field: 'archived',
      value: args.archived ? 'true' : '',
      note: args.archived ? (args.resolution ?? '') : '',
    })
  }

  /**
   * Hide one issue from the lists, or bring it back — FOL-46. The same field
   * and shape as a project's, written into the issue's own Folder where its
   * status lives.
   */
  archiveIssue(args: { folder: string; issue: string; archived: boolean; resolution?: string }): Promise<PublishResult> {
    return this.setField({
      folder: args.folder,
      target: args.issue,
      field: 'archived',
      value: args.archived ? 'true' : '',
      note: args.archived ? (args.resolution ?? '') : '',
    })
  }

  /**
   * Archive a Folder, or restore it — FOL-46. A change on the Folder's own
   * address (`FolderSummary.channel`), published into it; never a `kind:9008`,
   * which hides everything under its `h` for good.
   */
  async archiveFolder(args: { folder: string; channel: string; archived: boolean; resolution?: string }): Promise<PublishResult> {
    assertFolderId(args.folder)
    const [change] = planArchiveFolder(this.signer.pubkey, Date.now(), args)
    return this.publish(change)
  }

  /**
   * Delete a Folder for good — a `kind:9008`, SHI-27. Not a person's action:
   * people archive (above), because a 9008 hides everything under its `h` and
   * no app can undo it.
   *
   * For a Folder this key made and has emptied: the relay admits a 9008 only
   * from the channel's owner (its creator) or a community steward, and refuses
   * it while any file is still live under the `h` (buzz#16, #17) — so delete the
   * files first, and report a refusal rather than retry it.
   */
  async deleteFolder(folder: string): Promise<PublishResult> {
    assertFolderId(folder)
    const [remove] = planDeleteFolder(this.signer.pubkey, Date.now(), { folder })
    return this.publish(remove)
  }

  /**
   * Ask the relay to drop a project's record.
   *
   * It only removes the *record*. The issues in the Folder are separate events
   * with their own authors; they survive, and simply stop being reachable from
   * this app once the project they hung off is gone. Callers should say that
   * out loud before publishing.
   *
   * Who may do it is the relay's call and not this method's — the author, or
   * the NIP-OA owner of an authoring agent (SPEC §6.5, corrected 2026-09-06).
   * This comment used to say "only the project's author can do this", which is
   * the rule SHI-14 found wrong and CON-3 withdrew.
   *
   * **Then it is unlisted from its team** (FOL-48), `createProject` in
   * reverse. A Folder with state lists what its `kind:30890` names, deleted or
   * not, so without the `kind:1852` remove the team keeps a row pointing at
   * nothing — measured on production on 2026-09-24. Delete first, as
   * `planUnlistFile` says: a refused remove then leaves a stale row, where the
   * other order would unlist a project the relay kept. A team without state
   * lists by `h` and needs nothing.
   *
   * `unlisted` is reported separately, as `placed` is: a refused delete is a
   * project that still exists, a refused unlist is a deleted project Peek
   * still shows a row for.
   *
   * **Every Folder that lists it**, not its `contentFolder` alone (FOL-7).
   * Once a project can be moved, the Folder listing it and the Folder its
   * conversation lives in are different Folders, and unlisting only the second
   * leaves the first with a row pointing at nothing. `unlisted` is the first
   * refusal, or the last answer when none was refused.
   */
  async deleteProject(args: {
    recordFolder: string
    project: string
    reason?: string
    /** The Folders that list it, each with `hasState` — from a read, never a guess. */
    folders: readonly { folder: string; hasState: boolean }[]
  }): Promise<{ result: PublishResult; unlisted?: PublishResult }> {
    const result = await this.publish(
      buildDeletion(this.signer.pubkey, Date.now(), {
        target: args.project,
        folder: args.recordFolder,
        reason: args.reason,
      }),
    )
    if (!result.ok) return { result }

    let unlisted: PublishResult | undefined
    for (const listing of args.folders) {
      for (const command of planUnlistFile(this.signer.pubkey, Date.now(), { folder: listing.folder, address: args.project, hasState: listing.hasState })) {
        const answer = await this.publish(command)
        if (!unlisted || unlisted.ok) unlisted = answer
      }
    }
    return { result, unlisted }
  }

  /**
   * Ask the relay to drop an issue's record.
   *
   * The same shape as `deleteProject`, and the same caveats: NIP-09 is a
   * *request*, and it removes the record rather than the discussion. An
   * issue's conversations are separate events in the same Folder with their
   * own authors — they survive, and stop being reachable from the issue.
   *
   * Who may do it is the relay's call, not this method's. It accepts a
   * deletion from the target's author **or** from the owner of an authoring
   * agent, and only the relay can evaluate the second half (SHI-14).
   */
  deleteIssue(args: {
    folder: string
    issue: string
    reason?: string
  }): Promise<PublishResult> {
    return this.publish(
      buildDeletion(this.signer.pubkey, Date.now(), {
        target: args.issue,
        folder: args.folder,
        reason: args.reason,
      }),
    )
  }

  /**
   * Ask the relay to drop a comment — CON-3.
   *
   * ## Why this is the event form and not the address form
   *
   * A comment is a `kind:1111`: a regular event with an id and no address. So
   * the `kind:5` names it with an `e` tag, and carries **no `h`** — the relay
   * looks the target up and takes the channel from it (`ingest.rs`: *"kind:5
   * events don't carry an h-tag, so we look up the target event and use its
   * channel_id"*). Exactly one target is allowed, `e` or `a`, never both.
   *
   * That is the same shape `unreact` uses, and deliberately: a reaction and a
   * comment are both regular events, and the relay validates their deletions
   * through the same branch. The difference is only what is being taken back.
   *
   * ## Who may
   *
   * The relay's call, never this app's. `validate_standard_deletion_event`
   * accepts the target's effective author **or** that author's NIP-OA owner,
   * on both branches — so a human can retract a comment their agent wrote.
   * **No client can evaluate the second half**: `users.agent_owner_pubkey` is
   * written from the attestation and read server-side only, and the attestation
   * runs agent→owner rather than the reverse. So the control is offered and the
   * refusal is reported in the relay's own words (SPEC §6.5, corrected
   * 2026-09-06; SHI-14 found the same thing on objects).
   *
   * ## Still a request
   *
   * The relay stops returning the event, which is why nothing here has to fold
   * a tombstone: the next read simply does not contain it. A copy on another
   * relay, or in another app's cache, is untouched.
   */
  deleteMessage(args: { messageEventId: string }): Promise<PublishResult> {
    return this.publish(buildEventDeletion(this.signer.pubkey, Date.now(), { targetEventId: args.messageEventId }))
  }

  /**
   * Edit a comment — CON-4, RFC 0.4 §7.2.1.
   *
   * ## An edit is a new event
   *
   * `kind:9` and `kind:1111` are both non-replaceable, so nothing here
   * overwrites anything. This publishes a `kind:40003` naming the target, and
   * `edits.ts` folds the pair on the way back — latest edit wins.
   *
   * ## The one write in this file that needs BOTH a Folder and an event id
   *
   * A reaction and a deletion carry no `h`: the relay derives the channel from
   * the target. An edit is the exception — 40003 is in
   * `requires_h_channel_scope`, so an edit without an `h` is refused with
   * `accepted: false` while the kind is granted and the signature is fine. The
   * two shapes are not interchangeable and the wrong one fails in a way that
   * looks like a permissions problem.
   *
   * ## Who may
   *
   * The relay's call. `validate_edit_ownership` takes the target's effective
   * author **or** the NIP-OA owner of an authoring agent, and on the author
   * path re-checks channel membership — so somebody removed from a private
   * channel cannot go back and rewrite what they said while they were in it.
   * No client can evaluate that, so nothing here gates on authorship; the
   * control is offered and a refusal is reported, exactly as for deletion.
   */
  editMessage(args: {
    folder: string
    messageEventId: string
    body: string
    /** The message's whole `embed` set after the edit, when it changes it (SPEC §13.6.2); omitted, the set stays. */
    embeds?: readonly Embed[]
  }): Promise<PublishResult> {
    assertFolderId(args.folder)
    return this.publish(
      buildEdit(this.signer.pubkey, Date.now(), {
        channelUuid: args.folder,
        targetEventId: args.messageEventId,
        body: args.body,
        embeds: args.embeds,
      }),
    )
  }

  async createIssue(args: {
    folder: string
    title: string
    description?: string
    summary?: string
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
   * A comment about an object, and a reply to one, is a NIP-22 `kind:1111`;
   * a message in the Folder and a reply in its thread are a `kind:9`, the
   * shape Peek writes for chat (SPEC §6.4). Either lands in the Folder, so
   * anything posted here appears there without Peek changing.
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
    /** A reply to a comment, instead of `replyTo` — SHI-28. */
    replyToComment?: CommentRef
    about?: string
    /** A block of that object, when the comment is about one part — §13.6. */
    blockId?: string
    /** Reference to append so other apps can see what this is about. */
    aboutRef?: string
    /** Files already uploaded to the relay — SHI-2. See `buildConversationMessage`. */
    files?: readonly Imeta[]
    /** Who the composer's urgent picks name — CON-25. */
    urgent?: readonly string[]
    /** The block links' `part` tags, already resolved — COM-2. See `buildConversationMessage`. */
    partTags?: readonly NostrTag[]
    /** The body's app links' `a` and `q` tags, already resolved — OPT-19. See `buildConversationMessage`. */
    linkTags?: readonly NostrTag[]
    /** The card it asks for under it (SPEC §13.6.2) — `embedsToSend`. */
    embeds?: readonly Embed[]
  }): Promise<PublishResult> {
    const body = args.aboutRef ? `${args.body}\n\n${args.aboutRef}` : args.body
    return this.publish(
      buildConversationMessage(this.signer.pubkey, Date.now(), {
        folder: args.folder,
        body,
        replyTo: args.replyTo,
        replyToComment: args.replyToComment,
        about: args.about,
        blockId: args.blockId,
        files: args.files,
        urgent: args.urgent,
        partTags: args.partTags,
        linkTags: args.linkTags,
        embeds: args.embeds,
      }),
    )
  }

  /**
   * Reactions on a set of messages — CON-2.
   *
   * **One filter with an `#e` array, and that is checked rather than assumed.**
   * One filter with an `#e` array, not one per message — which would be 588
   * round trips for this workspace. Measured against production 2026-09-06:
   * `#e` **does** OR, two targets asked for and two answered. `rawFolders` is
   * per-Folder for a reason that does not apply here: it is about `limit`
   * being shared across a filter's values, and this call bounds the events it
   * takes back explicitly through `REACTION_EVENT_LIMIT`.
   *
   * (The note that used to sit here said `#h` does not OR at all. It does —
   * see `rawFolders`, re-measured 2026-09-07.)
   *
   * The read is `@estiva-app/conversation`'s `decorationsOf` (CON-5): the
   * horizon is SPEC §6.6's newest 100 by `created_at`, and a read that comes
   * back at the relay's page ceiling is reported as cut — this used to take
   * 500 events and say nothing past them. It also brings edits, which this
   * app folds from the Folder read instead and ignores here.
   *
   * No `kind:5` query. The relay stops returning an event once it holds a
   * deletion for it, and this app caches nothing — so a retracted reaction is
   * absent from the next read rather than something to reconcile.
   */
  decorationsFor(targets: readonly { id: string; at: number }[]): Promise<Decorations> {
    const query: QueryFn = (filters) => this.relay.query(filters as never)
    return decorationsOf(targets, query)
  }

  /**
   * React to a message.
   *
   * No `h`, deliberately — `buildReaction` mirrors Buzz's own builder, which
   * emits none, because the relay derives the channel from the target's `e` tag
   * and ignores a client-supplied one. Adding it would change the event id for
   * no benefit.
   */
  react(args: { targetEventId: string; emoji: string }): Promise<PublishResult> {
    return this.publish(
      buildReaction(this.signer.pubkey, Date.now(), {
        targetEventId: args.targetEventId,
        emoji: args.emoji,
      }),
    )
  }

  /**
   * Take a reaction back.
   *
   * A `kind:5` naming **the reaction's own event**, not the message — and with
   * no `h`, matching `build_remove_reaction`. That is a different shape from
   * this file's other deletions, which target an *address* and must carry the
   * record's Folder; the two are not interchangeable and the wrong one is
   * accepted-and-ignored rather than refused.
   *
   * Still a request. The relay honours it from the reaction's author or that
   * author's NIP-OA owner (SPEC §6.5, corrected 2026-09-06), and the caller
   * reports a refusal rather than assuming it worked.
   */
  unreact(args: { reactionEventId: string }): Promise<PublishResult> {
    return this.publish(buildEventDeletion(this.signer.pubkey, Date.now(), { targetEventId: args.reactionEventId }))
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
    /** SPEC §13.4, for a field that carries a body. See `buildChange`. */
    contentFormat?: string
  }): Promise<PublishResult> {
    return this.publish(buildChange(this.signer.pubkey, Date.now(), args))
  }

  /**
   * Join, leave, or add somebody to a file (SPEC §11.8 *The membership
   * change*): one `kind:1851` with `field: member:<person>`, the one Peek
   * publishes. A leave counts only when the person signs it, so `member: false`
   * is for oneself; `true` may name anyone. Signed only on a person's click.
   */
  setMembership(args: { folder: string; file: string; person: string; member: boolean }): Promise<PublishResult> {
    return this.publish(buildMembershipChange(this.signer.pubkey, Date.now(), args))
  }

  /**
   * Read a Folder's whole state.
   *
   * One query, three kinds, filtered by `#h`. `POST /query` takes a **bare
   * array** of filters — a single filter object gets
   * `invalid type: map, expected a sequence` (FRICTION.md A5).
   *
   * Paged rather than bounded by a generous literal. The fold needs the
   * *complete* change stream to be correct — a truncated stream produces a
   * stale status rather than an error — and `limit: 2000` stopped delivering
   * that when the relay's ceiling halved to 1000. `queryAll` pages on the
   * `until` cursor, so completeness no longer depends on a number this file
   * guesses about a relay it does not control.
   *
   * Note the relay clamps **per filter**, not per response
   * (`buzz-db/src/event.rs`: `q.limit.unwrap_or(100).min(clamp)`, called once
   * per filter). So a filter carrying no `limit` at all gets **100**, not the
   * ceiling — which is why the fix is `queryAll`, not deleting the limit.
   *
   * **This and `loadFolders` filter by `#h`, so they do not see a global project
   * record** — one carrying `buzz-channel` instead of `h`. Such a Folder reads
   * as issues with no project. That is correct rather than broken: a global
   * record is by definition in no Folder, and a second query to put it back
   * would undo REW-11. `loadAll` is the method that sees everything, and it is
   * what both the app and the agent use; these two are for scripts and for
   * reading one container in isolation.
   */
  async loadFolder(folder: string): Promise<WorkspaceState> {
    return read(await this.rawFolders([folder]), [folder])
  }

  /**
   * Read several Folders at once.
   *
   * One filter with an `#h` array rather than a query per Folder: the whole
   * point of loading a workspace is that it fans out over every project, and
   * doing that serially would make the issue list N round trips deep.
   */
  async loadFolders(folders: string[]): Promise<WorkspaceState> {
    return read(await this.rawFolders(folders), folders)
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
   * and `contentFolder` reads its `buzz-channel` where it used to read `h`.
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
   * optimisation — a project's record and its older issues can sit in
   * different Folders, and folding those separately would drop changes.
   */
  async loadAll(): Promise<WorkspaceState> {
    return foldWorkspace(await this.loadAllEvents())
  }

  /** `loadAll` without the fold, for a caller that will re-read part of it — see `reloadFolders`. */
  async loadAllEvents(): Promise<WorkspaceEvents> {
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
    const events = await this.relay.queryAll([
      { kinds: [KIND.PROJECT] },
      { kinds: [KIND.ISSUE] },
    ])
    return this.widen(events, new Set())
  }

  /**
   * Re-read only `folders`, keeping the rest of a previous read as it was —
   * PER-17.
   *
   * Every event of the previous read that carries one of these `h` is dropped
   * and the Folders are read again, so a deletion, an edit or a replaced record
   * in them shows exactly as `loadAll` would show it. Then the same widening
   * pass runs, so a Folder this change introduced — an issue filed into one
   * not read before — is fetched rather than folded without its changes.
   *
   * What it cannot see is anything *outside* those Folders: a global project
   * record (`buzz-channel`, no `h`) or a Folder the discovery query would newly
   * turn up. A write to either needs `loadAll`, which is why the app still
   * reads everything on load and on focus.
   */
  async reloadFolders(previous: WorkspaceEvents, folders: string[]): Promise<WorkspaceEvents> {
    const scope = new Set(folders)
    if (!scope.size) return previous
    const kept = previous.events.filter((event) => {
      const folder = folderOfEvent(event)
      return !folder || !scope.has(folder)
    })
    const fresh = await this.rawFolders([...scope])
    return this.widen([...kept, ...fresh], new Set([...previous.folders, ...scope]))
  }

  private async widen(events: SignedEvent[], fetched: Set<string>): Promise<WorkspaceEvents> {
    /**
     * Widen until no new Folder appears.
     *
     * Every project's own Folder and every issue's. A Folder read can turn up
     * an object the discovery query did not — one named by a reference, or a
     * project only a Folder's events reach — so it repeats until nothing new
     * appears. The bound is four, so a pathological chain degrades to a
     * partial read rather than an unbounded fan-out.
     *
     * Threads anchored at a project but filed elsewhere — in the Folder a
     * retired `folder` change used to point at (MAN-5) — are reached because
     * each such Folder holds that project's issues. Measured on production
     * on 2026-10-02: 0 of the 24 formerly re-pointed Folders would go unread.
     */
    for (let pass = 0; pass < 4; pass++) {
      const state = foldFolder(events, referencedAddresses)
      const wanted = new Set<string>()
      for (const project of state.projects) {
        if (project.contentFolder && !fetched.has(project.contentFolder)) wanted.add(project.contentFolder)
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
      events = [...events, ...(await this.rawFolders([...wanted]))]
    }

    return { events, folders: [...fetched] }
  }

  /**
   * Raw events for one or more Folders — for debugging and verification.
   *
   * **One filter per Folder, not one filter with an `#h` array — but not for
   * the reason this comment used to give.**
   *
   * It said Buzz does not OR the values of a tag filter, and that
   * `{'#h': [A, B]}` returns only A's events. Re-measured against production
   * 2026-09-07: **it returns both.** Two Folders holding 13 and 3 events came
   * back as 16; at `limit: 5` the answer was 5 drawn from both, which is
   * NIP-01 behaving exactly as written. Whatever was seen before, that is not
   * what the relay does now, and the belief had been reasoned from ever since
   * without being re-checked.
   *
   * The shape survives the correction because the real reason is the `limit`.
   * One filter over thirty-six Folders shares **one** limit, so a busy Folder
   * crowds the others out; NIP-01 has no truncation signal, so what a reader
   * gets is a short read with no error — a project whose issues have silently
   * vanished. One filter per Folder gets the relay's clamp *per Folder*,
   * measured: ten filters at `limit: 5` returned 48 events, not 5.
   *
   * And it is a single round trip again. `queryAll` batches every filter's
   * first page into one `POST /query` since protocol 0.15.0, so the per-Folder
   * shape no longer costs a request per Folder — this read went from 39
   * requests to 3 against production.
   */
  async rawFolders(folders: string[]): Promise<SignedEvent[]> {
    for (const folder of folders) assertFolderId(folder)
    if (!folders.length) return []
    // One filter per Folder, and the relay clamps per filter — so this gets the
    // ceiling for each Folder rather than sharing one across all of them.
    return this.relay.queryAll(
      folders.map((folder) => ({ kinds: FOLDER_KINDS, '#h': [folder] })),
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
