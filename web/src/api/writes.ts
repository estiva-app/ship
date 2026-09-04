import type { PublishResult } from '@estiva-app/protocol'
import { addrToNaddr } from '@estiva-app/protocol'
import type { Conversation, Issue, Project } from '../../../src/fold'
import { nextRef, refPrefix } from '../../../src/store'
import { RELAY_URL } from '../config'
import { clockProblem } from './clock'
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
 *   is not necessarily its project's current one after a re-link;
 * - a project's record changes go to the Folder the record names
 *   (`project.originFolder`);
 * - a project's conversation and its new issues go to its content Folder
 *   (`project.contentFolder`).
 *
 * Getting it wrong does **not** fail. Measured against production on
 * 2026-08-29: a project change published against the content Folder instead
 * of the record's is accepted by the relay, `ok: true`, no reason given. The
 * fold keys changes by target address, so `foldFolder` over the whole
 * workspace applies it and the app looks correct — but `loadFolder` and
 * `loadFolders` filter by `#h`, so anything reading the record's own Folder
 * never sees it. The edit exists for one reader and not for another,
 * permanently, with nothing anywhere reporting a problem.
 *
 * The three lines above are load-bearing for that reason, not because
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

/**
 * A rejection with a specific, fixable cause is worth naming: pairing with a
 * Folder the relay does not know is almost always a Peek topic that has not
 * been published yet (the old app's `explainRejection`).
 */
export function explainRejection(reason: string | undefined, folder: string): string {
  if (reason?.includes('not a channel member')) {
    return (
      `The relay does not know Folder ${folder.slice(0, 8)}… — most likely the Peek topic ` +
      'has not been published yet. Send a message in that topic, then try again. ' +
      "(If it is somebody else's private topic, you need to be added to it.)"
    )
  }
  return reason ?? 'no reason given'
}

// ── Projects ────────────────────────────────────────────────────────────────

/**
 * Create a project — and, unless a Folder was pasted, its own Folder. A
 * pasted Folder makes the project live *in* that Peek topic from the first
 * event (PEEK-17); a rejection there gets the specific explanation.
 */
export async function createProject(draft: { title: string; description: string; folder?: string }): Promise<CreateResult> {
  const clock = await clockProblem()
  if (clock) return { ok: false, reason: clock }
  try {
    const { result, addr } = await store.createProject({ title: draft.title, description: draft.description, folder: draft.folder })
    if (!result.ok) return { ok: false, reason: draft.folder ? explainRejection(result.reason, draft.folder) : (result.reason ?? 'no reason given') }
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
  return publish(() => store.setField({ folder: project.originFolder, target: project.addr, field, ...body, note }))
}

/** Archive hides the project from the lists, reversibly, by a change anyone in the Folder can make. */
export function archiveProject(project: Project, archived: boolean): Promise<WriteResult> {
  return publish(() => store.archiveProject({ recordFolder: project.originFolder, project: project.addr, archived }))
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
 */
export function deleteProject(project: Project): Promise<WriteResult> {
  return publish(() => store.deleteProject({ recordFolder: project.originFolder, project: project.addr }))
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

/**
 * Re-point a project at another Folder. Two writes: the change that decides
 * it, and the same statement inside the Folder being paired so other apps
 * can find the project there. The second can be refused on its own — a
 * Folder that will not take a write is still a Folder we can point at — so
 * its outcome is reported separately rather than folded into the boolean.
 */
export async function pairProjectFolder(project: Project, folder: string): Promise<WriteResult & { announced?: boolean; announceReason?: string }> {
  const clock = await clockProblem()
  if (clock) return refused(clock)
  try {
    const result = await store.linkProjectFolder({ recordFolder: project.originFolder, project: project.addr, folder })
    if (!result.ok) return refused(explainRejection(result.reason, folder))
    return { ok: true, announced: result.announced, announceReason: result.announceReason }
  } catch (error) {
    return refused(error instanceof Error ? error.message : String(error))
  }
}

// ── Issues ──────────────────────────────────────────────────────────────────

/**
 * Create an issue in a project's content Folder, with a display ref derived
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
      folder: project.contentFolder,
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
export function startConversation(args: { folder: string; about: string; withReference: boolean; body: string; blockId?: string }): Promise<WriteResult> {
  return publish(() =>
    store.postMessage({
      folder: args.folder,
      body: args.body,
      about: args.about,
      // SPEC §13.6 — present only when the author was commenting on one block.
      blockId: args.blockId,
      aboutRef: args.withReference ? `nostr:${addrToNaddr(args.about, [RELAY_URL])}` : undefined,
    }),
  )
}

/** Reply into a conversation — the thread's own Folder, anchored to its root. */
export function reply(conversation: Conversation, fallbackFolder: string, body: string): Promise<WriteResult> {
  return publish(() =>
    store.postMessage({
      folder: conversation.root.folder || fallbackFolder,
      body,
      replyTo: { rootId: conversation.id, parentId: conversation.id },
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
