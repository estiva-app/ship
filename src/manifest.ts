/**
 * Linear-lite's NIP-89 manifest — build-order step 3.
 *
 * This is the part that is genuinely new protocol, and the reason the app
 * exists (RFC_UPDATES.md §3). NIP-89's `kind:31990` already says how to *open*
 * an object in its owning app; it says nothing about how to **render** one
 * inline, or what another app may **do** to it. This adds both.
 *
 * The principle it encodes: **the owner defines the projection.** Linear-lite
 * decides which fields of a Linear-lite issue matter; the consumer decides how
 * they look. That inverts normal integration, where every consumer picks fields
 * itself and each gets it wrong differently.
 *
 * ## Two additions to the shape in LINEAR_LITE_SPEC.md §2
 *
 * Both surfaced from writing a consumer rather than from reading the spec.
 *
 * **1. `fold` slots.** §2 declares the issue's status slot as
 * `{"tag": "status"}` — but §1.2 is explicit that the Issue root carries no
 * status tag, because status has to be settable by someone who is not the
 * author. A consumer following that literally renders an empty status forever.
 * So a slot may name a *folded field* instead of a tag.
 *
 * **2. `records`.** If status comes from folding change events, a consumer
 * cannot fold without knowing which kind carries changes and how to order them.
 * Leaving that to convention means every consumer invents its own rule and they
 * disagree the first time two changes land in one second — which is the common
 * case, not the rare one (FRICTION.md A6). So the fold rule is declared, not
 * assumed.
 */
import { toNostrSeconds, type NostrTag, type UnsignedEvent } from '../lib/nostr/events'
import {
  DEFAULT_ISSUE_STATUS,
  DEFAULT_PROJECT_STATUS,
  ISSUE_STATUSES,
  KIND,
  PROJECT_STATUSES,
} from './kinds'

/** Where a slot's value comes from. Exactly one of these is set. */
export type SlotSource =
  /** A tag on the root event, by name. */
  | { tag: string; map?: string; as?: 'pubkey'; label?: string; truncate?: number }
  /** A top-level event field — in practice only `content`. */
  | { field: 'content'; truncate?: number; label?: string }
  /**
   * A field produced by folding change events, not present on the root.
   * `default` is what to show when nobody has set it yet.
   */
  | { fold: string; map?: string; as?: 'pubkey'; label?: string; default?: string }

export interface Projection {
  /** One of the predefined widget types. The consumer owns the layout. */
  widget: 'card' | 'row' | 'table' | 'stat'
  slots: Record<string, SlotSource | SlotSource[]>
}

/** The manifest's `content`, parsed. */
export interface ManifestContent {
  name: string
  about: string
  records: {
    /** The kind carrying field changes. */
    changeKind: number
    /** Tag names on a change event: what it targets, and the assignment. */
    targetTag: string
    fieldTag: string
    valueTag: string
    /**
     * How to order changes before applying them, most significant first.
     * `ts` is epoch-ms and MUST be ignored unless it agrees with `created_at`
     * to the second — see `orderingTrust`.
     */
    order: string[]
    rule: 'last-write-wins-per-field'
    orderingTrust: string
  }
  projections: Record<string, Projection>
  vocabularies: Record<string, { value: string; label: string; colour: string }[]>
  actions: unknown[]
}

export const MANIFEST_D_TAG = 'linear-lite'

export function manifestContent(): ManifestContent {
  return {
    name: 'Linear-lite',
    about: 'Projects and issues',

    // ── How to read a Linear-lite record ──────────────────────────────────
    // Without this a consumer can fetch an Issue and still not know its
    // status, because the status is not on the Issue.
    records: {
      changeKind: KIND.CHANGE,
      targetTag: 'a',
      fieldTag: 'field',
      valueTag: 'value',
      order: ['ts', 'created_at', 'id'],
      rule: 'last-write-wins-per-field',
      orderingTrust:
        'Honour `ts` (epoch ms) only when Math.floor(ts/1000) is within 1s of created_at; ' +
        'otherwise use created_at*1000. Ties broken by lowest event id. ' +
        'The relay validates created_at, so a ts pinned inside that second inherits that check ' +
        'and cannot move an event outside it.',
    },

    // ── How MY objects look in YOUR app ───────────────────────────────────
    projections: {
      [KIND.PROJECT]: {
        widget: 'card',
        slots: {
          title: { tag: 'title' },
          subtitle: { field: 'content', truncate: 120 },
          status: { fold: 'status', map: 'statuses', default: DEFAULT_PROJECT_STATUS },
          meta: [{ label: 'Lead', tag: 'lead', as: 'pubkey' }],
        },
      },
      [KIND.ISSUE]: {
        widget: 'row',
        slots: {
          title: { tag: 'title' },
          subtitle: { field: 'content', truncate: 120 },
          status: { fold: 'status', map: 'issueStatuses', default: DEFAULT_ISSUE_STATUS },
          meta: [
            { tag: 'ref' },
            { label: 'Assignee', fold: 'assignee', as: 'pubkey' },
          ],
        },
      },
    },

    // ── Vocabularies, so a consumer can render and validate ───────────────
    // Declared once and used for both. These are the same arrays the
    // Linear-lite UI renders from — not a copy that can drift.
    vocabularies: {
      statuses: PROJECT_STATUSES,
      issueStatuses: ISSUE_STATUSES,
    },

    // ── What another app may DO ───────────────────────────────────────────
    // The consumer publishes the event itself; this says what to publish.
    // Note every action emits a CHANGE, never a rewrite — that is what lets
    // someone who is not the author act at all.
    actions: [
      {
        id: 'set-issue-status',
        label: 'Change status',
        appliesTo: String(KIND.ISSUE),
        emits: { kind: KIND.CHANGE, field: 'status' },
        input: { type: 'string', enum: 'issueStatuses' },
      },
      {
        id: 'assign-issue',
        label: 'Assign',
        appliesTo: String(KIND.ISSUE),
        emits: { kind: KIND.CHANGE, field: 'assignee' },
        input: { type: 'pubkey' },
      },
      {
        id: 'comment',
        label: 'Comment',
        // NIP-22, so this needs no Linear-lite-specific kind at all. Declared
        // anyway: a consumer should not have to guess that comments are
        // welcome, or which kind carries them.
        appliesTo: [String(KIND.PROJECT), String(KIND.ISSUE)],
        emits: { kind: KIND.COMMENT, scope: 'address' },
        input: { type: 'string' },
      },
      {
        id: 'add-issue',
        label: 'Add issue',
        appliesTo: String(KIND.PROJECT),
        emits: { kind: KIND.ISSUE, setTag: 'a', toAddressOf: 'self' },
        input: {
          type: 'object',
          properties: { title: { type: 'string' } },
          required: ['title'],
        },
      },
    ],
  }
}

/**
 * kind:31990 handler information.
 *
 * `k` tags are NIP-89's own mechanism: they declare which kinds this app
 * handles, and they are what a consumer filters on to find this manifest
 * (`#k` = the kind of the object it is holding).
 *
 * No `h` tag: the relay stores 31990 globally. A manifest describes an
 * application, not a Folder's contents, and discovery has to work before the
 * reader is a member of anything.
 */
/**
 * kind:31989 handler recommendation — "for this kind, I use that app".
 *
 * Signed by **the user**, not by Linear-lite, and that is the point. A `#k`
 * query for kind 30851 returns every manifest claiming to handle issues, and
 * nothing in NIP-89 ranks them (LINEAR_LITE_SPEC.md §7.3 — which stopped being
 * hypothetical the moment a throwaway probe published a competing manifest by
 * accident). The recommendation is the tie-break.
 *
 * The trust anchor it gives a consumer is a real one rather than configuration:
 * *the person who authored the object told you which app renders it.* Peek
 * holds an issue authored by Ana, looks for Ana's recommendation for kind
 * 30851, and follows it. Nobody has to pin an address into Peek's config, and
 * a workspace that switches trackers switches by republishing, not by
 * redeploying.
 *
 * `d` is the kind being recommended for, so one event per kind. Both are
 * addressable, so re-publishing replaces rather than accumulating.
 */
export function buildRecommendation(
  pubkey: string,
  createdAtMs: number,
  args: {
    /** The kind this recommendation is about. */
    kind: number
    /** Address of the `31990` being recommended. */
    manifestAddr: string
    /** Where to find it. NIP-19/NIP-89 both carry relay hints. */
    relayHint?: string
  },
): UnsignedEvent {
  return {
    pubkey,
    created_at: toNostrSeconds(createdAtMs),
    kind: 31989,
    tags: [
      ['d', String(args.kind)],
      // NIP-89's `a` tag carries a relay hint and a platform marker.
      ['a', args.manifestAddr, args.relayHint ?? '', 'web'],
    ],
    content: '',
  }
}

export function buildManifest(pubkey: string, createdAtMs: number): UnsignedEvent {
  const tags: NostrTag[] = [
    ['d', MANIFEST_D_TAG],
    ['k', String(KIND.PROJECT)],
    ['k', String(KIND.ISSUE)],
  ]
  return {
    pubkey,
    created_at: toNostrSeconds(createdAtMs),
    kind: 31990,
    tags,
    content: JSON.stringify(manifestContent()),
  }
}
