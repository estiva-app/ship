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
   * NIP-09 deletion request.
   *
   * A request rather than a delete, and honoured only for the pubkey that
   * signed the original. Buzz accepts it and stops returning the target.
   */
  DELETION: 5,
  /**
   * NIP-01 profile metadata — who a pubkey is.
   *
   * Not Ship's own kind and not in its manifest: it is the ecosystem's
   * one answer to "who wrote this", published by whichever app a key signs in
   * and read by all of them. See `profiles.ts`.
   */
  PROFILE: 0,
} as const

/** A status value plus how to render it. */
export interface VocabEntry {
  value: string
  label: string
  /** A semantic name, not a hex code — the consumer picks the actual colour. */
  colour: 'neutral' | 'blue' | 'green' | 'muted'
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
  { value: 'planned', label: 'Planned', colour: 'neutral' },
  { value: 'in_progress', label: 'In Progress', colour: 'blue' },
  { value: 'completed', label: 'Completed', colour: 'green' },
  { value: 'cancelled', label: 'Cancelled', colour: 'muted' },
]

export const ISSUE_STATUSES: VocabEntry[] = [
  { value: 'todo', label: 'Todo', colour: 'neutral' },
  { value: 'in_progress', label: 'In Progress', colour: 'blue' },
  { value: 'done', label: 'Done', colour: 'green' },
  { value: 'cancelled', label: 'Cancelled', colour: 'muted' },
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
