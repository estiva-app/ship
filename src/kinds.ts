/**
 * Estiva Ship's kinds and vocabularies.
 *
 * Kind numbers are **provisional** — 30820–30899 and 185x are unused in the NIP
 * repository and in Buzz. They are not accepted by a stock Buzz relay either;
 * `crates/buzz-core/src/kind.rs` allowlists kinds at ingest, so these three had
 * to be registered there first. See the two commits on Buzz's `nfb-demo-kinds`
 * branch.
 */

export const KIND = {
  /**
   * NIP-29 create group — this is how a **Folder** comes into existence.
   *
   * Buzz calls it a channel; the RFC calls it a Folder and Ship shows it
   * as a workspace. One container, many projections
   * (RFC_UPDATES.md §1.1). Mechanically it is the `h` tag, and it is required
   * on every object below.
   */
  FOLDER: 9007,
  /** Project — addressable, editable in place by its author only. */
  PROJECT: 30850,
  /** Issue — the *root* event. Immutable facts only; no status, no assignee. */
  ISSUE: 30851,
  /** Change — append-only, sets one field on one object. The important one. */
  CHANGE: 1851,
  /**
   * NIP-29 stream message — a conversation, or a reply in one.
   *
   * The same kind Peek writes for a topic message, deliberately. A project *is*
   * a Folder, so a conversation in the topic and a conversation on the project
   * are not two things to reconcile — they are one event read twice. A root
   * message (no `e` tag) starts a conversation; an `e` tag makes it a reply.
   *
   * An optional `a` tag names the object a conversation is *about*, which is
   * what puts it under an issue rather than only on the project.
   */
  MESSAGE: 9,
  /**
   * NIP-22 comment — a threaded comment scoped to any event or **address**.
   *
   * Read but not yet written (REW-10). Ship publishes comments as `kind:9` so
   * that a comment and the Peek topic conversation are one event rather than
   * two records nobody reconciles; `1111` keeps that property while dropping
   * the one non-standard part, since scoping to an addressable event is
   * precisely what lets two apps comment on the same object without either
   * owning the comment kind.
   *
   * Uppercase `A`/`E`/`K`/`P` name the thread root, lowercase the immediate
   * parent. See `parseNip22Comment` in `fold.ts` — the case is the whole spec.
   */
  COMMENT: 1111,
  /**
   * NIP-25 reaction — an emoji on one message.
   *
   * **It carries no `h` tag**, and that is the whole difficulty (SPEC §6.6).
   * Every other kind here is found by Folder; a reaction cannot be, because
   * Buzz derives its channel from the target's `e` tag and ignores a
   * client-supplied `h`. So reactions are fetched *addressed by target* — the
   * event ids on screen — which is what forces a horizon nobody can see.
   * `reactions.ts` holds that decision and the number.
   *
   * Attaches to a **message**, never to a block (RFC 0.4 §7.2) and not — yet —
   * to an object. An issue has an address and no event id, so nothing here can
   * express reacting to one even by accident.
   */
  REACTION: 7,
  /**
   * NIP-09 deletion request.
   *
   * A request rather than a delete. Buzz accepts it and stops returning the
   * target, from the target's effective author **or** the NIP-OA owner of an
   * authoring agent — not author-only, which is what this comment said until
   * SPEC §6.5 was corrected on 2026-09-06 (CON-3, SHI-14).
   */
  DELETION: 5,
  /**
   * Buzz's message edit (`KIND_STREAM_MESSAGE_EDIT`) — RFC 0.4 §7.2.1, CON-4.
   *
   * An edit never rewrites: `kind:9` and `kind:1111` are non-replaceable, so
   * this is a separate event naming its target and the reader folds the pair.
   * `edits.ts` holds that fold, deliberately outside `foldFolder` — see its
   * header for why the conformance contract forces it.
   *
   * **Channel-scoped**, unlike a reaction or a deletion: 40003 is in the
   * relay's `requires_h_channel_scope`, so an edit without an `h` is refused
   * with `accepted: false` while the kind is granted and the signature is fine.
   */
  MESSAGE_EDIT: 40003,
  /**
   * NIP-01 profile metadata — who a pubkey is.
   *
   * Not Ship's own kind and not in its manifest: it is the ecosystem's
   * one answer to "who wrote this", published by whichever app a key signs in
   * and read by all of them. See `profiles.ts`.
   */
  PROFILE: 0,
} as const

/**
 * Where a status sits in the work's lifecycle — **what it means**, as opposed
 * to what it is called or what colour it is drawn in.
 *
 * Added by PRO-2. Without it a consumer wanting to say "4 of 7 done" has to
 * guess from the label, and Peek did exactly that: a hardcoded set of English
 * words (`'in progress'`, `'doing'`, `'in review'`) matched against lowercased
 * labels, whose own comment admitted *"an app whose statuses are spelled
 * differently shows an empty section until its values are added here."* For a
 * layer that exists to make the third app cheap, that is a defect rather than
 * an editorial position — the third app ships, its words are not in the set,
 * and its panel comes up blank, which reads as "that app is broken".
 *
 * Ship is the expert on what a Ship status means, so Ship says it.
 *
 * | stage | means |
 * | --- | --- |
 * | `open` | outstanding, not started |
 * | `started` | somebody is on it now |
 * | `done` | finished, and it counts as progress |
 * | `dropped` | closed without being done — never outstanding, never progress |
 *
 * **`dropped` is the one that earns its place.** A cancelled ticket is neither
 * open nor done: counted as open it leaves a finished project stuck at 3/4 for
 * ever, and counted as done it claims work that was abandoned. Only the owning
 * app knows which of its statuses are that shape.
 *
 * This says nothing about what a consumer *does* with it. Drawing a counter, a
 * progress bar, or nothing at all is the consumer's call — an owner that could
 * specify that would be designing another app's UI, which is the objection
 * RFC 0.4 §13.1 uses to rule out iframes.
 */
export type Stage = 'open' | 'started' | 'done' | 'dropped'

/** A status value, what it means, and how to render it. */
export interface VocabEntry {
  value: string
  label: string
  /** A semantic name, not a hex code — the consumer picks the actual colour. */
  colour: 'neutral' | 'blue' | 'green' | 'muted'
  /**
   * Optional on the type because a manifest published before PRO-2 does not
   * carry it and cannot be made to — the same reason `emits.alsoRead` exists.
   * Every entry Ship declares sets it; a consumer must still handle its absence.
   */
  stage?: Stage
}

/**
 * The status vocabularies.
 *
 * These live here rather than being scattered through the UI because they are
 * about to be published: step 3 of the build order puts them in the NIP-89
 * manifest verbatim, so another app can render and validate Ship's
 * objects without knowing anything about Ship. Declared once, used for
 * rendering, for the status picker, and (at step 3) for cross-app validation.
 */
export const PROJECT_STATUSES: VocabEntry[] = [
  { value: 'planned', label: 'Planned', colour: 'neutral', stage: 'open' },
  { value: 'in_progress', label: 'In Progress', colour: 'blue', stage: 'started' },
  { value: 'completed', label: 'Completed', colour: 'green', stage: 'done' },
  { value: 'cancelled', label: 'Cancelled', colour: 'muted', stage: 'dropped' },
]

export const ISSUE_STATUSES: VocabEntry[] = [
  { value: 'todo', label: 'Todo', colour: 'neutral', stage: 'open' },
  { value: 'in_progress', label: 'In Progress', colour: 'blue', stage: 'started' },
  { value: 'done', label: 'Done', colour: 'green', stage: 'done' },
  { value: 'cancelled', label: 'Cancelled', colour: 'muted', stage: 'dropped' },
]

/**
 * The status an object has before anyone has said otherwise.
 *
 * A root Issue carries no status at all — that is the whole point of §1.3 — so
 * "no change events yet" has to mean something, and it means this.
 */
export const DEFAULT_PROJECT_STATUS = 'planned'
export const DEFAULT_ISSUE_STATUS = 'todo'

export function lookupStatus(vocab: VocabEntry[], value: string): VocabEntry {
  return (
    vocab.find((entry) => entry.value === value) ?? {
      // A value outside the vocabulary is displayed, not swallowed. Another app
      // may have written it: the manifest's `input` schema is the only thing
      // preventing that, and it is an honour system (RFC_UPDATES.md §3). If it
      // happens we would rather see it than silently show "Todo".
      value,
      label: value,
      colour: 'muted',
    }
  )
}
