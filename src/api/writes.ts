import type { Embed, Imeta, NostrTag, PublishResult } from '@estiva-app/protocol'
import { addrToNaddr, serializeBlockDocument, toRenderTree } from '@estiva-app/protocol'
import { MAX_MENTIONED_PEOPLE, boxLinksOf, embedsToEdit, embedsToSend, namedBefore, withoutCard } from '@estiva-app/conversation'
import { linksIn, listedBeneath, MAX_LINKS_ASKED, textOf, within, type OwnPlace } from '@estiva-app/interop'
import type { FileText } from '@estiva-app/conversation'
import type { DocumentAsks } from '@estiva-app/ui/editor'
import { documentAsksOf } from '../nostr/textAsks'
import type { Conversation, Issue, Project } from '../nostr/fold'
import { clashes, explicitKey, keyOfRef, nextRef, projectKeys, suggestKey, takenKeys } from '../nostr/keys'
import { RELAY_URL } from '../config'
import { clockProblem } from './clock'
import { loadQuery, readFolderListing, readFolders } from './foreign'
import { links } from './linkCards'
import { linkResolverFor } from '../lib/linksNamingCards'
import { isRelayBusy } from '../lib/relayBudget'
import { SignerTokenExpired } from '../nostr/signer'
import { projectFieldsNow, store } from './store'

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
 * - its new comments and new issues go to its own Folder too (`workFolder`),
 *   never the one that lists it, which differs once a project is moved.
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
 * Join or leave an issue or a project yourself, or add somebody to it (SHI-31,
 * SPEC §11.8). It is a change to the object's record, so it goes to the
 * record's Folder: an issue's own, a project's `contentFolder`.
 */
export function setMembership(target: { kind: 'issue'; issue: Issue } | { kind: 'project'; project: Project }, person: string, member: boolean): Promise<WriteResult> {
  const [file, folder] = target.kind === 'issue' ? [target.issue.addr, target.issue.folder] : [target.project.addr, target.project.contentFolder]
  return publish(() => store.setMembership({ folder, file, person, member }))
}

/**
 * Add this issue or project to a topic, or take it off (TOP-5): an entry on
 * the topic's list, by the file's id, filed in the topic's Folder. Refused by
 * the relay for someone outside that Folder.
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-topic-keeps-its-own-list-of-files.md
 */
export function setListedInTopic(topic: { address: string; folder: string }, file: string, listed: boolean): Promise<WriteResult> {
  return publish(() => store.setListedInTopic({ topic: { address: topic.address, folder: topic.folder }, file, listed }))
}

/**
 * Add the people a description save names anew, as the Add button does (SPEC
 * §11.8): one Add each, never for yourself, at most `MAX_MENTIONED_PEOPLE`.
 * Answers the ones the relay refused, for the next save that still names them.
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-mention-in-a-files-text-adds-the-person-with-no-unread.md
 */
export async function addMentioned(target: { kind: 'issue'; issue: Issue } | { kind: 'project'; project: Project }, people: readonly string[], me: string | undefined): Promise<string[]> {
  const added = people.filter((person) => person !== me).slice(0, MAX_MENTIONED_PEOPLE)
  const answers = await Promise.all(added.map((person) => setMembership(target, person, true)))
  return added.filter((_, i) => {
    const answer = answers[i]
    if (answer.ok) return false
    console.warn('[relay] mention add refused', answer.reason)
    return true
  })
}

/**
 * Create a project in a team (FOL-2): the record, then its listing in the
 * team. A refused listing is still a created project — Ship shows it under
 * the team — so it comes back `ok` with `unlisted` saying why Peek will not.
 */
export async function createProject(draft: { title: string; description: string; summary?: string; key: string; team: { folder: string; hasState: boolean } }): Promise<CreateResult & { unlisted?: string }> {
  const clock = await clockProblem()
  if (clock) return { ok: false, reason: clock }
  try {
    // Filed in its team's Folder by `h` where projects are kept in order (SPEC §6.13, D5), as Leaf and the agent file theirs.
    const filedIn = !!(await projectFieldsNow())
    const { result, placed, addr } = await store.createProject({ title: draft.title, description: draft.description, summary: draft.summary, key: draft.key, team: draft.team, filedIn })
    if (result.ok) claimedHere.add(addr)
    if (!result.ok) return { ok: false, reason: result.reason ?? 'no reason given' }
    if (placed && !placed.ok) return { ok: true, addr, unlisted: placed.reason ?? 'no reason given' }
    return { ok: true, addr }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Per project, each text this page has shown or saved, and the change holding
 * it (ALO-5): a save edited from that text follows that change, and the merge
 * with a newer one starts from it (§13.3). A text edited from one nobody here
 * holds would merge against the wrong base, so it is not saved.
 */
const textChanges = new Map<string, Map<string, string>>()

const noteText = (project: string, content: string, id: string): void => {
  const held = textChanges.get(project) ?? new Map<string, string>()
  held.set(content, id)
  textChanges.set(project, held)
}

/** The text the page shows, and the change it is: its first record's seed until one is written. Call as it is shown. */
export function noteProjectText(project: Project): void {
  const id = project.fields.description?.id ?? project.rootId
  if (id) noteText(project.addr, project.description, id)
}

/** What a field save answers where projects are kept in order: a description save may ask instead (ALO-5). */
export type FieldWriteResult = WriteResult | { ok: false; reason: string; asks: DocumentAsks }

/**
 * One field after the change it follows (SPEC §6.2), where projects are kept
 * in order: `prev` is the field's change as read, or the record's id for its
 * first; a description's is the change holding the text it was edited from.
 */
async function writeProjectField(project: Project, field: string, value: string, note: string, contentFormat?: string, from?: FileText): Promise<FieldWriteResult> {
  const clock = await clockProblem()
  if (clock) return refused(clock)
  const text = field === 'description'
  const edited = from && (typeof from.content === 'string' ? from.content : serializeBlockDocument(from.content))
  const prev = text && edited !== undefined ? textChanges.get(project.addr)?.get(edited) : (project.fields[field]?.id ?? project.rootId)
  if (!prev) return refused(text ? 'someone changed it while you were editing. Copy your text, then reload' : 'reload the page and try again')
  try {
    const result = await store.writeField({ folder: project.contentFolder, target: project.addr, field, value, note, contentFormat, prev })
    if (result.ok) {
      if (text) {
        const saved = 'event' in result ? result.event : result.mergedOnto
        noteText(project.addr, textOf(saved)?.value ?? value, result.id)
      }
      return { ok: true }
    }
    if ('refused' in result) return refused(result.refused)
    const theirs = textOf(result.theirs)
    noteText(project.addr, theirs?.value ?? '', result.theirs.id)
    const base = { value: edited ?? '', ...(from?.format ? { format: from.format } : {}) }
    return { ok: false, reason: 'asks', asks: documentAsksOf(base, theirs ?? { value: '' }, { value, ...(contentFormat ? { format: contentFormat } : {}) }, result.asks) }
  } catch (error) {
    return refused(error instanceof Error ? error.message : String(error))
  }
}

/** One field of a project record: title, description, status, lead. The record's own Folder. */
export async function setProjectField(project: Project, field: 'title' | 'description' | 'summary' | 'status' | 'lead' | 'key', value: string, note: string, contentFormat?: string, from?: FileText): Promise<FieldWriteResult> {
  if (await projectFieldsNow()) return writeProjectField(project, field, value, note, field === 'description' ? contentFormat : undefined, from)
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
export async function archiveProject(project: Project, archived: boolean, resolution?: string): Promise<WriteResult> {
  if (await projectFieldsNow()) return writeProjectField(project, 'archived', archived ? 'true' : '', archived ? (resolution ?? '') : '')
  return publish(() => store.archiveProject({ recordFolder: project.contentFolder, project: project.addr, archived, resolution }))
}

/**
 * Delete or restore a project where projects are kept in order (SPEC §6.5): a
 * change setting `deleted` to `true`, or to the empty value, after the one it
 * follows, by anyone in its Folder. It leaves every list and search and keeps
 * its id, record and changes, so Restore brings it back whole; nothing is
 * unlisted and no `kind:5` is sent. The agent's `setDeleted` writes the same.
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-file-is-its-fields-each-kept-in-order-by-the-relay.md
 */
export function setProjectDeleted(project: Project, deleted: boolean): Promise<WriteResult> {
  return writeProjectField(project, 'deleted', deleted ? 'true' : '', deleted ? 'Delete' : 'Restore')
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
  if (await projectFieldsNow()) return setProjectDeleted(project, true)
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

/** What a move says when it stopped: nothing moved (a sentence, and `changed` when the Folders must be read again), or half moved. */
export type MoveResult =
  | { ok: true; stillIn?: { folder: string; why?: string } }
  | { ok: false; reason: string; changed?: true }

/**
 * Why a move stopped where this side failed rather than the relay judging the
 * move: said as that failure, on any command (TEA-3). A wait is the relay's
 * quota (HTTP 429) or busy answer; an `accepted: false` is its judgement, read
 * by `readMoveRefusal` whatever its words.
 */
function ownFailure(stopped: { reason?: string; httpStatus?: number; threw?: unknown }): string | undefined {
  if (stopped.threw instanceof SignerTokenExpired) return 'your sign-in has ended. Sign in again.'
  if (stopped.httpStatus === 429 || isRelayBusy(stopped.reason ?? '') || isRelayBusy(stopped.threw)) return 'the relay is too busy right now. Try again shortly.'
  if ('threw' in stopped) return 'the move could not be sent. Try again.'
  return undefined
}

/**
 * Move a project to another top-level Folder (FOL-7): one move into `to` from
 * each Folder in `from` — the ones it is under now, each with `hasState` and
 * `addresses` from the caller's read. Its record, its issues and its
 * conversation are not touched (`Store.moveProject`).
 *
 * **Only a Folder that holds some of it is moved from.** Each source's listing
 * is read at the move; one whose state names the project, or lists it or a
 * file beneath it, is a source, and the project is named in it so the two go
 * together. One that holds none of it — the project's own Folder, where the
 * sidebar places a project no Folder lists (`placedIn`) — is not: the relay
 * refuses a move whose source lists none of its files, and the planner, seeing
 * no source, places the project in `to` instead.
 *
 * A refusal after an earlier move is still a move — the project is in `to` —
 * so it comes back `ok` with `stillIn`: the Folder whose move was refused and
 * why, which moving again fixes. Why is said in Ship's words, never the
 * relay's text, and a refusal as one sentence the person reads as it is.
 */
export async function moveProject(
  project: Project,
  /** With `addresses`, what each one's state lists. */
  from: readonly { id: string; hasState: boolean; addresses?: readonly string[] }[],
  to: { id: string; hasState: boolean; private?: boolean },
): Promise<MoveResult> {
  const clock = await clockProblem()
  if (clock) return refused(clock)
  const nothing = (why?: string) => (why ? `Nothing was moved: ${why}` : 'Nothing was moved. Try again.')
  try {
    // What each source lists beneath the project moves with it (SPEC §3.3): one read per source, at the moment of the move.
    // Unread, a move would leave what is under the project behind, so nothing is sent.
    const read = from.filter((folder) => folder.id !== to.id && folder.hasState)
    // One load across the sources: a file listed in two of them has its changes asked for once (APP-2).
    const load = loadQuery()
    const files = await Promise.all(read.map((folder) => readFolderListing(folder.id, load).catch(() => null)))
    if (files.some((listed) => listed === null)) return refused(nothing('the team it is in could not be read. Try again.'))
    const listings = new Map(read.map((folder, i) => [folder.id, files[i]!] as const))
    const holds = (folder: (typeof from)[number]) => {
      const listing = listings.get(folder.id)
      if (!listing) return true
      return !!folder.addresses?.includes(project.addr) || listing.some((file) => file.address === project.addr) || listedBeneath(listing, { ref: project.addr }).length > 0
    }
    const sources = from.filter(holds).map((folder) => (listings.has(folder.id) ? { ...folder, addresses: [project.addr] } : folder))
    const { refused: unsafe, moveRefused } = await store.moveProject({ project: project.addr, from: sources, to, listings })
    // `target-is-not-home` is a topic's rule: a project has no home, so it is never planned.
    if (unsafe === 'source-has-no-state') return refused(nothing('the team it is in has no list of its own, so taking it out would empty that team.'))
    if (unsafe === 'target-is-private') return refused(nothing('that team is private, and this project would stay readable by the whole workspace.'))
    if (unsafe) return refused(nothing('that team has no list of its own, so adding to it would hide what is already there.'))
    if (!moveRefused) return { ok: true }
    // Ship's words for why, never the relay's text (TEA-3).
    const why =
      ownFailure(moveRefused) ??
      (moveRefused.why === 'team-archived'
        ? 'one of the teams is archived.'
        : moveRefused.why === 'not-a-member'
          ? 'you need to be a member of both teams to move this.'
          : moveRefused.why === 'changed-meanwhile'
            ? 'the teams changed since you opened this. Try again.'
            : undefined)
    // A list changed since it was read: the caller reads the Folders again, so moving again can succeed.
    if (moveRefused.nothingMoved) return { ok: false, reason: nothing(why), ...(moveRefused.why === 'changed-meanwhile' ? { changed: true as const } : {}) }
    // The earlier moves arrived. Only the refused command's Folder was asked; the ones after it were never sent to.
    return { ok: true, stillIn: { folder: moveRefused.notMovedFrom[0], ...(why ? { why } : {}) } }
  } catch (error) {
    return refused(nothing(ownFailure({ threw: error })))
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
 * Where a project's new issues and new comments go: the project's own Folder
 * (`contentFolder`, its `h` or `buzz-channel`), never the Folder whose listing
 * it was opened from, so they have the project's readers once a Folder can be
 * private. Either way the write is found again by its parent or anchor, not by
 * its Folder. A record that names no Folder is refused rather than written
 * with no `h`, or into a Folder that lists it (0 of 76 projects, 19 Oct).
 *
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/what-belongs-to-a-file-is-stored-with-it.md
 */
export function workFolder(project: Project): string {
  if (!project.contentFolder) throw new Error('This project names no team of its own')
  return project.contentFolder
}

/** What numbering reads: every project and issue this reader can see. */
export interface Visible {
  projects: Project[]
  issues: Issue[]
}

/**
 * Projects and issues whose key or ref this tab claimed, so `settleClaims` can
 * tell its own claims from everybody else's (SPEC §6.1: only the later claim's
 * client moves it). A reload forgets them, which is fine: a race is settled
 * in the seconds after the claim, by the page that made it.
 */
const claimedHere = new Set<string>()

/**
 * The project's key, writing it first when the project has none of its own on
 * the wire (SHI-4).
 *
 * A project made before keys, or by an app that set none, gets the key
 * `projectKeys` derives — the prefix it holds most refs under, or the shortest
 * free one from its title — the first time Ship numbers an issue in it. From
 * then on the key is a fact on the relay rather than a derivation, so a later
 * project or a moved issue cannot change it.
 */
async function keyFor(project: Project, visible: Visible): Promise<string> {
  // A value another client wrote that is not a key is shown, never numbered from (SPEC §6.1).
  const own = explicitKey(project)
  if (own) return own
  const key = projectKeys(visible.projects, visible.issues).get(project.addr) ?? suggestKey(project.title, takenKeys(visible.projects, visible.issues))
  const pinned = await setProjectField(project, 'key', key, `Key → ${key}`)
  if (pinned.ok) claimedHere.add(project.addr)
  return key
}

/**
 * Create an issue in its project's own Folder (`workFolder`), with
 * the next ref under the project's key (SHI-4). The ref counts every issue
 * this reader can see, in any project, so it is unique among them; a race is
 * `settleClaims`'s. The address is still the identity — a ref is never
 * resolved by. Says which Folder it went into, for the page to re-read.
 */
export async function createIssue(project: Project, visible: Visible, draft: { title: string; description: string; summary?: string }): Promise<CreateResult & { folder?: string }> {
  const clock = await clockProblem()
  if (clock) return { ok: false, reason: clock }
  try {
    const folder = workFolder(project)
    const key = await keyFor(project, visible)
    const { result, addr } = await store.createIssue({
      folder,
      title: draft.title,
      description: draft.description,
      summary: draft.summary,
      projectAddr: project.addr,
      ref: nextRef(key, visible.issues.map((issue) => issue.ref)),
    })
    if (!result.ok) return { ok: false, reason: result.reason ?? 'no reason given' }
    claimedHere.add(addr)
    return { ok: true, addr, folder }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

/** One field of an issue: title, description, status, assignee, project. The issue's own Folder. */
export function setIssueField(issue: Issue, field: 'title' | 'description' | 'summary' | 'status' | 'assignee' | 'project' | 'ref', value: string, note: string, contentFormat?: string): Promise<WriteResult> {
  // The description arrives as a built document with its own tag — see
  // `setProjectField`.
  const body = field === 'description' ? { value, contentFormat } : { value, contentFormat: undefined }
  return publish(() => store.setField({ folder: issue.folder, target: issue.addr, field, ...body, note }))
}

// ── Conversations ───────────────────────────────────────────────────────────

/**
 * The card a new message sends when the box did not say: its one file's
 * default (SPEC §13.6.2), read from the links its send has just asked about, so
 * readers count the same links. The shared box says (COMM-7): the card it
 * showed under itself, unless ✕ took it off, comes in as `embeds`.
 */
function cardToSend(body: string, here: string | undefined): Embed[] {
  return embedsToSend(boxLinksOf(body, { resolveLink: linkResolverFor(body, links.known), blockOf: links.knownBlock, here }), new Set())
}

/**
 * The `a`, `q` and `part` tags a message's words earn (SPEC §13.1, §13.6.1):
 * every file and message it names, by a `nostr:` reference or an app link the
 * reader answers, never the file it is on nor the message it answers. A URL in
 * code names nothing, and `[A](B)` names B only. An edit asks with `edit` and
 * gets the `a`/`q` its new words earn, never a `part` (nor a `p` or `urgent`,
 * which are not read from here).
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/an-edit-says-what-the-message-links-now.md
 */
function tagsEarnedBy(body: string, own: OwnPlace, edit = false): Promise<NostrTag[]> {
  return links.tagsFor(toRenderTree(body, 'marker'), own, { edit })
}

/**
 * Start a conversation about an object, in its Folder. About an issue, the
 * body also carries a `nostr:naddr` reference, so a reader of the Folder in
 * Peek sees which issue it is about, as that issue's chip; about a project,
 * the message is already in the topic it belongs to and a reference would be
 * noise.
 */
export function startConversation(args: { folder: string; about: string; withReference: boolean; body: string; blockId?: string; files?: readonly Imeta[]; urgent?: readonly string[]; embeds?: readonly Embed[] }): Promise<WriteResult> {
  return publish(async () => {
    // A pasted block link shows that block (SPEC §13.6.1, COM-2); a pasted app link is a mention, as a `nostr:`
    // reference is (SPEC §13.1, OPT-19).
    const linkTags = await tagsEarnedBy(args.body, { file: args.about })
    return store.postMessage({
      folder: args.folder,
      body: args.body,
      about: args.about,
      linkTags,
      embeds: args.embeds ? [...args.embeds] : cardToSend(args.body, args.about),
      // SPEC §13.6 — present only when the author was commenting on one block.
      blockId: args.blockId,
      aboutRef: args.withReference ? `nostr:${addrToNaddr(args.about, [RELAY_URL])}` : undefined,
      // Already on the relay by the time this runs — `uploadAttachment` had to
      // resolve before the composer would submit, because ingest refuses a
      // message naming a blob it does not hold.
      files: args.files,
      urgent: args.urgent,
    })
  })
}

/**
 * Reply into a conversation — the thread's own Folder, anchored to its root.
 *
 * A thread whose root is a comment gets a flat `kind:1111` naming that comment
 * (SHI-28); a chat thread gets a `kind:9`. The root's `anchor` is what tells
 * them apart — only a NIP-22 comment carries one.
 */
export function reply(conversation: Conversation, fallbackFolder: string, body: string, files?: readonly Imeta[], urgent?: readonly string[], embeds?: readonly Embed[]): Promise<WriteResult> {
  const { root } = conversation
  return publish(async () => {
    // A pasted block link shows that block (SPEC §13.6.1, COM-2); a comment's own file keeps its one `a`, and the
    // message it answers is its `e`, not a `q`.
    const linkTags = await tagsEarnedBy(body, { file: root.anchor, parent: conversation.id })
    return store.postMessage({
      folder: root.folder || fallbackFolder,
      body,
      linkTags,
      // The box's card, but never the thread's own file: a reply under "Mentioned in" is read on another page than its own.
      embeds: embeds ? embeds.filter((embed) => embed.value !== (root.anchor ?? conversation.about[0])) : cardToSend(body, root.anchor ?? conversation.about[0]),
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
    })
  })
}

/**
 * Give display keys to a project's issues that arrived without one.
 *
 * Only Ship mints a ref: it is the project's key and one past the highest number
 * under that key in the workspace (SHI-4), so a consumer creating an issue
 * through the manifest — Peek, the agent — files it without one. And Ship cannot put
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
 * It numbers against **every** visible issue, not the project's own: until
 * SHI-4 it counted only the siblings, so two agent-filed issues in two new
 * projects both became `SHI-1` beside the real one.
 *
 * Two tabs filling the same issue write the same number, and last-write-wins
 * settles it. Two tabs giving one number to two different issues is a clash,
 * which `settleClaims` moves.
 */
export async function assignMissingRefs(project: Project, visible: Visible): Promise<WriteResult[]> {
  const mine = visible.issues.filter((issue) => issue.projectAddr === project.addr)
  // Oldest first, so the numbers run in the order the issues were filed.
  const missing = mine.filter((issue) => !issue.ref).sort((a, b) => a.createdAt - b.createdAt)
  if (missing.length === 0) return []
  const key = await keyFor(project, visible)
  const assigned = visible.issues.map((issue) => issue.ref)
  const results: WriteResult[] = []
  for (const issue of missing) {
    const ref = nextRef(key, assigned)
    assigned.push(ref)
    const result = await setIssueField(issue, 'ref', ref, `Ref → ${ref}`)
    if (result.ok) claimedHere.add(issue.addr)
    results.push(result)
  }
  return results
}

/**
 * Move this tab's own claims that lost a race — SPEC §6.1's later-claim rule.
 *
 * Run after a refresh that follows a claim. Where this tab gave a project a
 * key, or an issue a ref, that an earlier claim already holds, it takes the
 * next free one. Nobody else's claim is touched, so a duplicate from before
 * keys stays as it is (Miky, 2026-10-09).
 */
export async function settleClaims(visible: Visible): Promise<WriteResult[]> {
  if (claimedHere.size === 0 || settling) return []
  settling = true
  try {
    const results: WriteResult[] = []
    // Each losing claim is moved once. A move that failed, or that the next read
    // has not caught up with yet, is not retried on every refresh — that would
    // publish the same change in a loop (a 429 answered by another 429).
    const once = (addr: string, value: string) => {
      const attempt = `${addr}=${value}`
      if (settled.has(attempt)) return false
      settled.add(attempt)
      return true
    }
    for (const project of clashes(visible.projects, (project) => explicitKey(project), 'key', claimedHere)) {
      if (!once(project.addr, project.key ?? '')) continue
      const key = suggestKey(project.title, takenKeys(visible.projects, visible.issues))
      results.push(await setProjectField(project, 'key', key, `Key → ${key}, ${project.key} was taken`))
    }
    const assigned = visible.issues.map((issue) => issue.ref)
    for (const issue of clashes(visible.issues, (issue) => issue.ref, 'ref', claimedHere)) {
      const key = keyOfRef(issue.ref)
      if (!key || !once(issue.addr, issue.ref ?? '')) continue
      const ref = nextRef(key, assigned)
      assigned.push(ref)
      results.push(await setIssueField(issue, 'ref', ref, `Ref → ${ref}, ${issue.ref} was taken`))
    }
    return results
  } finally {
    settling = false
  }
}

/** Moves `settleClaims` has made, as `addr=value`, and whether one is running. */
const settled = new Set<string>()
let settling = false

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
export function editMessage(folder: string, messageEventId: string, body: string, card?: CardEdit, changedFiles?: readonly Imeta[]): Promise<WriteResult> {
  // Files left as they were still ride the edit: an edit is the whole new message, and one with none takes them off.
  // why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/an-edit-is-the-whole-new-message.md
  const files = changedFiles ?? card?.files
  // With the message not in hand, its file and the message it answers are unknown: the edit could `q` its own parent
  // or tag its own file, and with no files listed it would take them off. Every message a page draws is in hand,
  // Activity's rows read from elsewhere included, so this is a message the page never read.
  if (!card) return Promise.resolve(refused('The message could not be read, so the edit was not sent. Try again.'))
  return publish(async () => {
    if (card.remove) {
      // ✕ on a sent card: the text as it was, byte for byte, so the message is not marked edited (§7.2.1).
      const linkTags = await tagsEarnedBy(card.before, card.own, true)
      return store.editMessage({ folder, messageEventId, body: card.before, embeds: withoutCard(card.embeds, card.remove), files, linkTags })
    }
    // An edit says what the message links now: the whole `a`/`q` set its new words earn (asked first, as at send).
    // The old words are asked about too, as long as the new ones at most, so the card rule reads what they named.
    const [linkTags] = await Promise.all([
      tagsEarnedBy(body, card.own, true),
      within(links.ask(linksIn(toRenderTree(card.before, 'marker')).slice(0, MAX_LINKS_ASKED)), 5000),
    ])
    const [after, before] = [linkResolverFor(body, links.known), linkResolverFor(card.before, links.known)]
    const read = { resolveLink: (url: string) => after(url) ?? before(url), blockOf: links.knownBlock, here: card.here }
    // The card the edit box read: the message's own while the edit names its file, else a file named first; one taken
    // off before never again (`folded`, Katerina, 30 Oct, widget review 36). Its ✕ in the box: the own card set none,
    // a first-named one not added (items 36, 37).
    const named = boxLinksOf(body, { ...read, previous: namedBefore(card.before, read), folded: card.embeds ?? [] })
    const embeds = embedsToEdit(named, new Set(card.dropped ? [card.dropped] : []), card.embeds)
    // The files ride the same edit as the text and the cards, so neither can race the other.
    return store.editMessage({ folder, messageEventId, body, embeds, files, linkTags })
  })
}

/**
 * What an edit needs to keep a message's cards right (SPEC §13.6.2): the text
 * it replaces, as sent, and the message's folded cards and parts. With
 * `remove`, the edit is ✕ on that file's card and leaves the text as it is.
 */
export interface CardEdit {
  /** The message's text before this edit, whole: its own reference included. */
  before: string
  /** Its `embed` set, folded over earlier edits. */
  embeds?: readonly Embed[]
  /** The file whose conversation it is in: it never gets a card there. */
  here?: string
  /** The file it is a comment on and the message it answers: an edit's `a`/`q` never name either. */
  own: OwnPlace
  /** The file whose sent card ✕ removes. */
  remove?: string
  /** The card the edit box's ✕ took off: the message's own is set none, a file named first gets none. */
  dropped?: string
  /** Its files, folded over earlier edits: what an edit that does not change them lists again. */
  files?: readonly Imeta[]
}
