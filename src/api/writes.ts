import type { Imeta, PublishResult } from '@estiva-app/protocol'
import { addrToNaddr } from '@estiva-app/protocol'
import type { Conversation, Issue, Project } from '../nostr/fold'
import { nextRef, refPrefix } from '../nostr/store'
import { RELAY_URL } from '../config'
import { clockProblem } from './clock'
import { readFolderListing, readFolders } from './foreign'
import { placedIn } from '../lib/placement'
import { store } from './store'

/**
 * The writes (REW-5). Every one changes exactly one object, by design —
 * there is deliberately no way to express "close everything matching X":
 * every relay channel is open, so Folder membership bounds nothing, and the
 * shape of these commands is the containment. No bulk actions, no
 * multi-select, no "apply to all".
 *
 * Every publish goes through `publish()`: HTTP 200 does not mean accepted —
 * the relay answers `200 {"accepted": false}` for a rejection and the
 * `accepted` field is authoritative; `Relay` turns it into `ok`, and only
 * `ok` is read here. The clock is checked before anything is signed.
 *
 * Nothing here is reversible in the way a UI implies: no draft, no undo,
 * and a deletion is a request. The pages confirm before a deletion and
 * never say "saved" before the relay has said so — after an `ok` they
 * re-read the workspace, and what they show is what the relay holds.
 *
 * Which Folder an event carries is the one thing easy to get wrong:
 * - an issue's events go to the issue's own Folder (`issue.folder`), which
 *   is not necessarily its project's;
 * - a project's record changes go to the Folder the record names
 *   (`project.contentFolder`);
 * - its new comments and new issues go to the Folder that lists it
 *   (`workFolder`), which differs for a project once re-pointed or moved.
 *
 * Getting it wrong does **not** fail. Measured against production on
 * 2026-08-29, when a re-pointed project's content Folder could differ from its
 * record's: a project change published against the content Folder instead
 * of the record's is accepted by the relay, `ok: true`, no reason given. The
 * fold keys changes by target address, so `foldFolder` over the whole
 * workspace applies it and the app looks correct — but `loadFolder` and
 * `loadFolders` filter by `#h`, so anything reading the record's own Folder
 * never sees it. The edit exists for one reader and not for another,
 * permanently, with nothing anywhere reporting a problem.
 *
 * The rules above are load-bearing for that reason, not because
 * something downstream would catch a mistake. It would not.
 */
export type WriteResult = { ok: true } | { ok: false; reason: string }
export type CreateResult = { ok: true; addr: string } | { ok: false; reason: string }

const refused = (reason?: string): WriteResult => ({ ok: false, reason: reason ?? 'no reason given' })

/** One publish, with the clock checked first and `accepted` read. */
async function publish(action: () => Promise<PublishResult>): Promise<WriteResult> {
  const clock = await clockProblem()
  if (clock) return refused(clock)
  try {
    const result = await action()
    return result.ok ? { ok: true } : refused(result.reason)
  } catch (error) {
    return refused(error instanceof Error ? error.message : String(error))
  }
}

// ── Projects ────────────────────────────────────────────────────────────────

/**
 * Create a project in a team (FOL-2): the record, then its listing in the
 * team. A refused listing is still a created project — Ship shows it under
 * the team — so it comes back `ok` with `unlisted` saying why Peek will not.
 */
export async function createProject(draft: { title: string; description: string; team: { folder: string; hasState: boolean } }): Promise<CreateResult & { unlisted?: string }> {
  const clock = await clockProblem()
  if (clock) return { ok: false, reason: clock }
  try {
    const { result, placed, addr } = await store.createProject({ title: draft.title, description: draft.description, team: draft.team })
    if (!result.ok) return { ok: false, reason: result.reason ?? 'no reason given' }
    if (placed && !placed.ok) return { ok: true, addr, unlisted: placed.reason ?? 'no reason given' }
    return { ok: true, addr }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

/** One field of a project record: title, description, status, lead. The record's own Folder. */
export function setProjectField(project: Project, field: 'title' | 'description' | 'status' | 'lead', value: string, note: string, contentFormat?: string): Promise<WriteResult> {
  /*
    A description is a rich text field (SPEC §13) and goes on the wire as a
    block document; every other field is a scalar and goes as it arrived.

    **The document arrives already built** (RIC-14). It used to be converted
    here from the textarea's marker text, which is also where block ids were
    carried across an edit — by matching the new text against the old
    document. The editor holds the ids on the blocks themselves now, so they
    survive a reorder, which that matching could not manage: it followed
    position, and an anchored comment silently moved with it.

    The tag travels with the body rather than being inferred from it, because
    §13.4 says a body's format is on the event and is never guessed.
  */
  const body = field === 'description' ? { value, contentFormat } : { value, contentFormat: undefined }
  return publish(() => store.setField({ folder: project.contentFolder, target: project.addr, field, ...body, note }))
}

/**
 * Archive hides the project, and its issues with it, from the lists,
 * reversibly, by a change anyone in the Folder can make. `resolution` is shown
 * first when it is opened (FOL-46).
 */
export function archiveProject(project: Project, archived: boolean, resolution?: string): Promise<WriteResult> {
  return publish(() => store.archiveProject({ recordFolder: project.contentFolder, project: project.addr, archived, resolution }))
}

/** Archive one issue, or restore it — the project's rule, one level down (FOL-46). */
export function archiveIssue(issue: Issue, archived: boolean, resolution?: string): Promise<WriteResult> {
  return publish(() => store.archiveIssue({ folder: issue.folder, issue: issue.addr, archived, resolution }))
}

/**
 * Archive a Folder, or restore it (FOL-46): a change on its address, so its
 * projects stay where they are and come back with it. `channel` is the
 * listing's `FolderSummary.channel`.
 */
export async function archiveFolder(folder: { id: string; channel: string }, archived: boolean, resolution?: string): Promise<WriteResult> {
  const clock = await clockProblem()
  if (clock) return refused(clock)
  try {
    const result = await store.archiveFolder({ folder: folder.id, channel: folder.channel, archived, resolution })
    return result.ok ? { ok: true } : refused(result.reason)
  } catch (error) {
    return refused(error instanceof Error ? error.message : String(error))
  }
}

/**
 * Delete is a NIP-09 *request*: relays may decline, copies elsewhere are
 * untouched, and it removes the record, not the issues.
 *
 * The page offers it to everyone and lets the relay adjudicate, the way
 * archiving already does. It used to be hidden from anyone but the author,
 * which was narrower than the rule it was modelling: the relay accepts a
 * deletion from the author **or** from the owner of an authoring agent
 * (`is_agent_owner`). Ship cannot evaluate that half — ownership lives in
 * `users.agent_owner_pubkey`, which no event carries and no route returns —
 * so guessing it hid the control from the one person most likely to want it,
 * and left an agent-authored project nobody could remove (SHI-14).
 *
 * Then it is unlisted from its team (FOL-48). Whether the team has state comes
 * from the Folder read the caller already holds (`useFolders`), or a fresh one
 * if that has not landed — never a guess. A refused unlist is still a deleted
 * project, so it comes back `ok` with `stillListed` saying why Peek keeps the row.
 *
 * **The team is whichever Folders list it** (FOL-7): after a move that is no
 * longer its content Folder, which keeps its conversation. Only when none of
 * the caller's Folders lists it is the content Folder the one unlisted.
 */
export async function deleteProject(
  project: Project,
  folders: readonly { id: string; hasState: boolean; addresses?: readonly string[] }[] | undefined,
): Promise<WriteResult & { stillListed?: string }> {
  const clock = await clockProblem()
  if (clock) return refused(clock)
  try {
    type Read = readonly { id: string; hasState: boolean; addresses?: readonly string[] }[]
    const listing = (list: Read) => list.filter((folder) => folder.addresses?.includes(project.addr)).map((folder) => ({ folder: folder.id, hasState: folder.hasState }))
    const own = (list: Read) => list.find((folder) => folder.id === project.contentFolder)
    // Neither listed in nor holding its content Folder is not "no state": the
    // read may not have landed, or it lists Folders the caller did not pass. Ask the relay.
    const held = folders ?? []
    const read = listing(held).length > 0 || own(held) ? held : await readFolders()
    const lists = listing(read)
    const unlistFrom = lists.length > 0 ? lists : [{ folder: project.contentFolder, hasState: own(read)?.hasState ?? false }]
    const { result, unlisted } = await store.deleteProject({ recordFolder: project.contentFolder, project: project.addr, folders: unlistFrom })
    if (!result.ok) return refused(result.reason)
    if (unlisted && !unlisted.ok) return { ok: true, stillListed: unlisted.reason ?? 'no reason given' }
    return { ok: true }
  } catch (error) {
    return refused(error instanceof Error ? error.message : String(error))
  }
}

/**
 * Move a project to another top-level Folder (FOL-7): listed in `to`, then
 * unlisted from each Folder in `from` — the ones that list it now, each with
 * `hasState` from the caller's read. Its record, its issues and its
 * conversation are not touched (`Store.moveProject`).
 *
 * A refused `remove` is still a move — the project is in `to` — so it comes
 * back `ok` with `stillIn`, each Folder that still lists it and why, as
 * `createProject`'s `unlisted` does. Moving it again is the retry.
 */
export async function moveProject(
  project: Project,
  /** With `addresses`, what each one's state lists: the project moves out of one that names it even when its card did not resolve. */
  from: readonly { id: string; hasState: boolean; addresses?: readonly string[] }[],
  to: { id: string; hasState: boolean; private?: boolean },
): Promise<WriteResult & { stillIn?: { folder: string; reason: string }[] }> {
  const clock = await clockProblem()
  if (clock) return refused(clock)
  try {
    // What each source lists beneath the project moves with it (SPEC §3.3): one read per source, at the moment of the move.
    // Unread, a move would leave what is under the project behind, so nothing is sent.
    const sources = from.filter((folder) => folder.id !== to.id && folder.hasState)
    const read = await Promise.all(sources.map((folder) => readFolderListing(folder.id).catch(() => null)))
    if (read.some((files) => files === null)) return refused('the Folder it is in could not be read, so nothing was moved. Try again')
    const listings = new Map(sources.map((folder, i) => [folder.id, read[i]!] as const))
    const { refused: unsafe, added, removed } = await store.moveProject({ project: project.addr, from, to, listings })
    if (unsafe === 'source-has-no-state') return refused('the Folder it is in has no list of its own, so taking it out would empty that Folder')
    if (unsafe === 'target-has-no-state') return refused('that Folder has no list of its own, so adding to it would hide what is already there')
    if (unsafe === 'target-is-private') return refused('that Folder is private, and this project would stay readable by the whole workspace')
    if (added && !added.ok) return refused(added.reason)
    const stillIn = removed.filter(({ result }) => !result.ok).map(({ folder, result }) => ({ folder, reason: result.reason ?? 'no reason given' }))
    return stillIn.length > 0 ? { ok: true, stillIn } : { ok: true }
  } catch (error) {
    return refused(error instanceof Error ? error.message : String(error))
  }
}

/**
 * Create a top-level Folder (FOL-8): the channel, then its state
 * (`Store.createFolder`). Resolves the new id, which the caller opens.
 *
 * **A refused command after an accepted channel is still a Folder** — one
 * that exists by its id and has no state, so no sidebar lists it. It comes
 * back `ok` with the id and `unlisted`, as `createProject`'s does, so the
 * caller opens it: reporting it as a failure would leave the dialog open, and
 * Create again would mint a second channel beside an orphan nobody can reach.
 */
export async function createFolder(name: string): Promise<{ ok: true; id: string; unlisted?: string } | { ok: false; reason: string }> {
  const clock = await clockProblem()
  if (clock) return { ok: false, reason: clock }
  try {
    const { id, refusedAt, result } = await store.createFolder(name)
    if (refusedAt === undefined) return { ok: true, id }
    if (refusedAt === 0) return { ok: false, reason: result.reason ?? 'no reason given' }
    return { ok: true, id, unlisted: result.reason ?? 'no reason given' }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Rename a Folder (FOL-8): its channel's name, the title's only home
 * (`Store.renameFolder`, SPEC §3.2).
 */
export async function renameFolder(folder: { id: string }, name: string): Promise<WriteResult> {
  const clock = await clockProblem()
  if (clock) return refused(clock)
  try {
    const result = await store.renameFolder({ folder: folder.id, name })
    return result.ok ? { ok: true } : refused(result.reason)
  } catch (error) {
    return refused(error instanceof Error ? error.message : String(error))
  }
}

/**
 * Delete an issue. Same contract as `deleteProject`, one level down: a NIP-09
 * request, offered to everyone, adjudicated by the relay.
 *
 * It removes the issue record. The conversations about it are separate events
 * in the same Folder and are not touched — SHI-3 is explicit that "delete the
 * issue" must not read as "delete the discussion", so the dialog says so.
 */
export function deleteIssue(issue: Issue): Promise<WriteResult> {
  return publish(() => store.deleteIssue({ folder: issue.folder, issue: issue.addr }))
}

// ── Issues ──────────────────────────────────────────────────────────────────

/**
 * Where a project's new issues and new comments go: the Folder that lists it,
 * which is the one both apps draw it under and the one its people get unread
 * signals from — Miky's ruling on MAN-5. The record's own Folder only when
 * nothing lists it, or the listing cannot be read; either way the write is
 * found again by its parent or anchor, not by its Folder.
 */
export async function workFolder(project: Project, folders?: readonly { id: string; addresses?: readonly string[] }[]): Promise<string> {
  try {
    return placedIn({ addr: project.addr, folder: project.contentFolder }, folders ?? (await readFolders()))[0]?.id ?? project.contentFolder
  } catch {
    return project.contentFolder
  }
}

/**
 * Create an issue in the Folder that lists its project (`workFolder`), with a display ref derived
 * from what is currently visible (`nextRef(refPrefix(title), siblings)`) —
 * so it can collide across projects, as the old app's does. The address is
 * the identity; the ref is decoration, generated the same way, never
 * resolved by.
 */
export async function createIssue(project: Project, existing: Issue[], draft: { title: string; description: string }): Promise<CreateResult> {
  const clock = await clockProblem()
  if (clock) return { ok: false, reason: clock }
  try {
    const { result, addr } = await store.createIssue({
      folder: await workFolder(project),
      title: draft.title,
      description: draft.description,
      projectAddr: project.addr,
      ref: nextRef(refPrefix(project.title), existing.map((issue) => issue.ref)),
    })
    if (!result.ok) return { ok: false, reason: result.reason ?? 'no reason given' }
    return { ok: true, addr }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

/** One field of an issue: title, description, status, assignee, project. The issue's own Folder. */
export function setIssueField(issue: Issue, field: 'title' | 'description' | 'status' | 'assignee' | 'project' | 'ref', value: string, note: string, contentFormat?: string): Promise<WriteResult> {
  // The description arrives as a built document with its own tag — see
  // `setProjectField`.
  const body = field === 'description' ? { value, contentFormat } : { value, contentFormat: undefined }
  return publish(() => store.setField({ folder: issue.folder, target: issue.addr, field, ...body, note }))
}

// ── Conversations ───────────────────────────────────────────────────────────

/**
 * Start a conversation about an object, in its Folder. About an issue, the
 * body also carries a `nostr:naddr` reference so Peek renders the issue's
 * widget above the message; about a project, the message is already in the
 * topic it belongs to and a reference would be noise.
 */
export function startConversation(args: { folder: string; about: string; withReference: boolean; body: string; blockId?: string; files?: readonly Imeta[]; urgent?: readonly string[] }): Promise<WriteResult> {
  return publish(() =>
    store.postMessage({
      folder: args.folder,
      body: args.body,
      about: args.about,
      // SPEC §13.6 — present only when the author was commenting on one block.
      blockId: args.blockId,
      aboutRef: args.withReference ? `nostr:${addrToNaddr(args.about, [RELAY_URL])}` : undefined,
      // Already on the relay by the time this runs — `uploadAttachment` had to
      // resolve before the composer would submit, because ingest refuses a
      // message naming a blob it does not hold.
      files: args.files,
      urgent: args.urgent,
    }),
  )
}

/**
 * Reply into a conversation — the thread's own Folder, anchored to its root.
 *
 * A thread whose root is a comment gets a flat `kind:1111` naming that comment
 * (SHI-28); a chat thread gets a `kind:9`. The root's `anchor` is what tells
 * them apart — only a NIP-22 comment carries one.
 */
export function reply(conversation: Conversation, fallbackFolder: string, body: string, files?: readonly Imeta[], urgent?: readonly string[]): Promise<WriteResult> {
  const { root } = conversation
  return publish(() =>
    store.postMessage({
      folder: root.folder || fallbackFolder,
      body,
      ...(root.anchor
        ? {
            replyToComment: {
              id: conversation.id,
              anchor: root.anchor,
              // A reply standing in for a root outside the read is not its author.
              author: root.id === conversation.id ? root.author : undefined,
            },
          }
        : { replyTo: { rootId: conversation.id, parentId: conversation.id } }),
      files,
      urgent,
    }),
  )
}

/**
 * Give display keys to a project's issues that arrived without one.
 *
 * Only Ship can mint a ref: it is the project title's first three letters and a
 * count of that project's issues, so a consumer creating an issue through the
 * manifest cannot produce one — it cannot see the siblings. And Ship cannot put
 * it on the root, because a NIP-33 address is `(kind, pubkey, d)` and the root
 * belongs to whoever signed it. A change event is the only move available,
 * which is why `ref` is folded now (`fold.ts`).
 *
 * **Ship does this itself rather than asking.** A key is the app's own
 * bookkeeping, and an empty column with a button in it hands a person a chore
 * that exists only because two apps disagree about who fills a field. Nobody
 * would decline it, so nobody should be asked.
 *
 * The whole batch is numbered in one pass rather than a call per issue: each
 * `nextRef` reads the refs assigned so far, so issuing them one at a time
 * against unrefreshed state would give every one of them the same number.
 *
 * Racing another tab produces two changes for one field and last-write-wins
 * settles it — a cosmetic collision `nextRef` already tolerates by design,
 * since it counts what it can see rather than owning a counter.
 */
export async function assignMissingRefs(project: Project, issues: Issue[]): Promise<WriteResult[]> {
  const assigned = issues.map((issue) => issue.ref)
  const results: WriteResult[] = []
  // Oldest first, so the numbers run in the order the issues were filed.
  const missing = issues.filter((issue) => !issue.ref).sort((a, b) => a.createdAt - b.createdAt)
  for (const issue of missing) {
    const ref = nextRef(refPrefix(project.title), assigned)
    assigned.push(ref)
    results.push(await setIssueField(issue, 'ref', ref, `Ref → ${ref}`))
  }
  return results
}

// ── Reactions ───────────────────────────────────────────────────────────────

/**
 * React to a message — CON-2.
 *
 * **This needs a grant Ship did not have until 2026-09-07.** `estiva-ship`'s
 * `allowedKinds` had no `7`, so every call here would have failed at `/sign`
 * after the control was already on screen — AGE-2's shape, where the cost is
 * paid twice. estiva-id#59 added it; the row was re-seeded and verified.
 *
 * No `h` tag, and no Folder argument: Buzz derives a reaction's channel from
 * the target's `e` tag and ignores a client-supplied `h`. That makes this the
 * one write in this file that does not have to know which Folder it is in — and
 * the reason `postMessage` and the change events all do.
 */
export function react(targetEventId: string, emoji: string): Promise<WriteResult> {
  return publish(() => store.react({ targetEventId, emoji }))
}

/**
 * Take a reaction back.
 *
 * Targets **the reaction's own event**, never the message — a `kind:5` naming
 * the message would ask the relay to delete somebody's comment, and it would
 * refuse only because the author differs. The id comes off the fold's `mine`,
 * which exists for exactly this.
 *
 * A request, like every deletion here: the relay honours it from the reaction's
 * author or that author's NIP-OA owner (SPEC §6.5), and a refusal is reported
 * rather than assumed away.
 */
export function unreact(reactionEventId: string): Promise<WriteResult> {
  return publish(() => store.unreact({ reactionEventId }))
}

// ── Deleting a comment ──────────────────────────────────────────────────────

/**
 * Take a comment back — CON-3.
 *
 * **Offered to everyone, gated by nobody here.** The relay honours a `kind:5`
 * from the target's effective author or from the NIP-OA owner of an authoring
 * agent, and no client can evaluate the second half: ownership is written from
 * the attestation and read server-side only, and the attestation runs
 * agent→owner, never the reverse. An app that hides the control behind its own
 * `author === me` therefore hides it from the one *other* party the relay would
 * accept — and on this workspace that is most of the conversation: 425 of 583
 * messages on 2026-09-06 were authored by a single agent identity.
 *
 * So the answer comes from the relay. `must be event author` is what a refusal
 * reads as, and the caller shows it rather than pretending the write did not
 * happen. SHI-14 reached the same conclusion for projects and issues; this is
 * the comment surface catching up.
 *
 * The same shape as `unreact` — a regular event named by `e`, no Folder, no
 * `h`. What differs is only what is being taken back.
 */
export function deleteMessage(messageEventId: string): Promise<WriteResult> {
  return publish(() => store.deleteMessage({ messageEventId }))
}

// ── Editing a comment ───────────────────────────────────────────────────────

/**
 * Change what a comment says — CON-4.
 *
 * A `kind:40003` naming the target, never a rewrite: the original event is
 * immutable and stays on the relay, and `foldEdits` picks the latest edit on
 * the way back.
 *
 * **This is the only write here that needs both a Folder and an event id.** A
 * reaction and a deletion carry no `h` because the relay derives the channel
 * from the target; an edit is in `requires_h_channel_scope`, so one without an
 * `h` is refused while the kind is granted and the signature is fine.
 *
 * Offered to everyone, gated by nobody here — the relay takes an edit from the
 * target's effective author or the NIP-OA owner of an authoring agent, and no
 * client can evaluate the second half. Same reasoning as `deleteMessage`.
 */
export function editMessage(folder: string, messageEventId: string, body: string): Promise<WriteResult> {
  return publish(() => store.editMessage({ folder, messageEventId, body }))
}
