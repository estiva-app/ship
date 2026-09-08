/**
 * Estiva Ship's NIP-89 manifest — build-order step 3.
 *
 * This is the part that is genuinely new protocol, and the reason the app
 * exists (RFC_UPDATES.md §3). NIP-89's `kind:31990` already says how to *open*
 * an object in its owning app; it says nothing about how to **render** one
 * inline, or what another app may **do** to it. This adds both.
 *
 * The principle it encodes: **the owner defines the projection.** Ship
 * decides which fields of a Ship issue matter; the consumer decides how
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
 *
 * **3. A slot may be *both* `fold` and `tag`.** A project's lead starts life as
 * a tag on the root event and is then overridden by change events — exactly
 * what `fold.ts` does with `fields.lead?.value ?? tag(event, 'lead')`. Declaring
 * it as a tag alone was true only until somebody reassigned it, at which point
 * a consumer kept rendering the original author's choice forever; declaring it
 * as a fold alone loses the value the project was created with. Surfaced by
 * PEEK-24, where Peek offers the reassignment and then has to show the result.
 */
import { toNostrSeconds, type NostrTag, type UnsignedEvent } from '@estiva-app/protocol'
import {
  DEFAULT_ISSUE_STATUS,
  DEFAULT_PROJECT_STATUS,
  ISSUE_STATUSES,
  KIND,
  PROJECT_STATUSES,
} from './kinds'

/** Where a slot's value comes from. Exactly one of these is set. */
export type SlotSource =
  /**
   * A tag on the root event, or a list of them meaning **first that resolves**.
   *
   * A list exists because a tag can be renamed and the events already
   * published cannot be, so an app's history spans both spellings
   * permanently. Same reason as `emits.alsoRead`, one level down: the owning
   * app is the only party that knows what it used to write.
   *
   * Not a `SlotSource[]`, which means "render all of these as meta". This is
   * one slot with several places to look.
   */
  | { tag: string | string[]; map?: string; as?: 'pubkey'; label?: string; truncate?: number }
  /**
   * A top-level event field — in practice only `content`.
   *
   * **No `truncate` here, and that is deliberate (PRO-8).** `truncate` is a
   * plain-text operation, and Ship's `content` is a structured field: 76 of 89
   * descriptions on production carry markdown. Cutting one at 120 characters
   * yields raw markup, not a summary. RFC 0.4 §13.3 states the rule; removing
   * the option is what stops it being re-added by somebody who has not read it.
   *
   * `truncate` stays on the `tag` variant above, where a value is a plain
   * string by construction.
   */
  | { field: 'content'; label?: string }
  /**
   * A field produced by folding change events.
   *
   * `default` is what to show when nobody has set it yet. `tag` names a tag on
   * the root event to seed the field from — see addition 3 below.
   */
  | {
      fold: string
      /*
        `string[]` here for the same reason the tag-only variant above takes
        one, and it was missing: a slot may need both a fold *and* several tag
        spellings to seed it from. `title` on a project is exactly that — the
        field a rename writes, plus the two tag spellings REW-11 left behind.
        Narrower than the vocabulary it publishes (interop's `SlotSpec` has
        always allowed both), so this could declare something it could not type.
      */
      tag?: string | string[]
      /**
       * Seed the fold from the event's own body when no change has set it and
       * no seed tag resolves — the chain is fold, tag, content.
       *
       * Added by PRO-2, because a description is the one field an app puts in
       * `content` and neither of Ship's could be declared without it.
       * `fold.ts` read an issue's as `fields.description?.value ??
       * event.content` and a project's as that with a `description` tag in
       * between; a manifest could express neither. Same argument as the `tag`
       * seed above, one field along.
       *
       * The asymmetry is gone: both now read change, then tag, then content
       * (`recordDescription`), because `add-issue` takes a description and the
       * runtime delivers it on a tag.
       */
      field?: 'content'
      map?: string
      as?: 'pubkey'
      label?: string
      default?: string
    }
  /**
   * **Child objects, found by the tag on the child that names this one.**
   *
   * The `list` slot (RFC 0.4 §13.3), and the only source here that does not
   * read the root event. Every other variant answers "what does this event
   * say?"; this one answers "what points at it?", which is why it is named
   * `children` and `via` rather than reusing `tag`. A reader who confuses the
   * two writes a query in the wrong direction and gets an empty list rather
   * than an error.
   *
   * The inversion is forced by the data, not chosen. A project cannot carry a
   * tag listing its issues: a `kind:30850` is replaceable **only by its
   * author**, so every issue anyone else filed would need the project's author
   * to republish, and REW-11 established that republishing stamps a
   * `created_at` the relay will not backdate. The link therefore lives on the
   * child, where the child's own author can write it.
   *
   * `limit` is the producer saying how many children are worth fetching, not a
   * guarantee. **Recursion depth is the consumer's business and is not declared
   * here** — a child resolved through its own projection may declare a `list`
   * too, and the app at risk of the render loop is the one drawing it. §13.4's
   * honour-system rule cuts this way: a producer that could set the consumer's
   * recursion budget could hang it.
   */
  | { children: { kind: number; via: string; limit?: number }; label?: string }

export interface Projection {
  /**
   * One of the predefined widget types. The consumer owns the layout.
   *
   * **Narrower than the protocol allows, deliberately.** SPEC §7.5 lets a
   * manifest declare any widget name as an ordered chain terminating in one of
   * these — `["profile", "card"]` — and Ship has no use for one: a project is a
   * card and an issue is a row, both closed types. Keeping the union means the
   * compiler makes an unpublishable declaration unwritable here, which is a
   * stronger guarantee than the runtime check in `publish-manifest.ts` and the
   * reason that check reads as belt-and-braces for this app.
   *
   * Widen it to `string | string[]` the day Ship needs a chain; the publish
   * script already validates the wire shape either way.
   */
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
    /** A folded field whose value means "do not show this object". */
    hiddenWhen?: { field: string; equals: string }
  }
  projections: Record<string, Projection>
  /**
   * `stage` is what a status *means* (PRO-2) — see `Stage` in `kinds.ts`.
   * Optional here because a manifest published before PRO-2 has no `stage` and
   * cannot be given one, so a consumer must handle its absence.
   */
  vocabularies: Record<string, { value: string; label: string; colour: string; stage?: string }[]>
  actions: unknown[]
}

export const MANIFEST_D_TAG = 'estiva-ship'

export function manifestContent(): ManifestContent {
  return {
    name: 'Estiva Ship',
    about: 'Projects and issues',

    // ── How to read a Ship record ─────────────────────────────────────────
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
      /**
       * Archiving, said out loud.
       *
       * Archived is a *folded field*, not a deletion, so an archived project is
       * still perfectly readable — it comes back from every query and renders
       * fine. Ship drops it from its own lists; a consumer with no way to
       * know that shows it as though it were live, which is what PEEK-24 found:
       * a Peek topic whose Folder held three archived projects showed one of
       * them, chosen by nothing.
       *
       * A rule rather than a field name so it says what the value *means*.
       * Nothing here is specific to archiving — an app with a "hidden" or
       * "deleted" field declares its own, and a consumer honours it without
       * knowing what the word means.
       */
      hiddenWhen: { field: 'archived', equals: 'true' },
    },

    // ── How MY objects look in YOUR app ───────────────────────────────────
    projections: {
      [KIND.PROJECT]: {
        widget: 'card',
        slots: {
          // `name` first, `title` behind it. REW-11 renamed this tag on the
          // record, and a record published before that keeps `title` forever —
          // it is replaceable only by its author, and rewriting it would stamp
          // a `created_at` the relay will not backdate. Naming one spelling
          // renders half the workspace blank, and which half depends only on
          // which one you name. The issue below is untouched: REW-11 did not
          // rename anything there.
          /*
            And `fold: 'title'`, which was missing and is not cosmetic.
            Consumers default the folded field to the *first* tag name, so
            without this they folded `name` — a field nothing writes — and fell
            back to the root tag. A project renamed in Ship therefore showed its
            **original** name in every other app, for ever: 6 of 19 on
            production, 3 of them with no root `name` at all, which renders as
            "Untitled".
            Ship never noticed because its own fold reads the field directly and
            never consults this manifest. The smoke test could not notice
            either: nothing is renamed during a run, so the root tag is right.
          */
          title: { tag: ['name', 'title'], fold: 'title' },
          /*
           * No `subtitle`, on purpose — PRO-8.
           *
           * This slot used to be `{ field: 'content', truncate: 120 }`. Against
           * the descriptions production actually holds — 76 of 89 carrying
           * markdown structure, the longest 5,706 characters — that renders the
           * first 120 characters of *raw markup* as an object's subtitle. A
           * description beginning `# Goal` projected as the literal text
           * "# Goal" followed by a sentence fragment.
           *
           * RFC 0.4 §13.3 draws the line this crossed: `truncate` is a
           * plain-text operation and MUST NOT be applied to a structured field.
           * `subtitle` carries a plain-text summary; `body` carries structure.
           * An app whose description is structured owes the consumer the
           * summary rather than expecting it to flatten a grammar it does not
           * know.
           *
           * Declaring nothing is the honest interim state, and it is strictly
           * better than what shipped: a consumer that omits a slot renders a
           * named, resolvable object, because §13.3 makes `title` the required
           * one and obliges a consumer to ignore what it cannot use. A
           * consumer handed 120 characters of markup renders something wrong
           * and cannot tell that it is wrong.
           *
           * The slot comes back when Ship can derive a real summary, which
           * needs the `body` slot and the content-format decision behind it.
           */
          status: { fold: 'status', map: 'statuses', default: DEFAULT_PROJECT_STATUS },
          // Seeded by the root's `lead` tag, overridden by a change — the same
          // rule `fold.ts` applies, now stated where a consumer can read it.
          meta: [{ label: 'Lead', fold: 'lead', tag: 'lead', as: 'pubkey' }],
          /*
           * The issues in this project — PRO-2.
           *
           * "A project card with its issues underneath" is the layout most
           * cited as proof this mechanism works, and until now it was the one
           * layout the mechanism could not express: a consumer had to infer the
           * relation from the `add-issue` action's `toAddressOf: "self"`, which
           * is reading a *write* declaration to answer a *read* question. It
           * worked, and it was a guess. This says it outright.
           *
           * `via: 'a'` is the tag `buildIssue` writes (`src/events.ts`), and it
           * is optional there — an issue may name no project. Such an issue is
           * simply not in anyone's list, which is correct and is why the query
           * is by tag rather than by folder: a Folder holds the conversation,
           * the `a` tag holds the containment, and REW-11 made them different
           * questions when it made the project record global.
           */
          list: { children: { kind: KIND.ISSUE, via: 'a', limit: 200 } },
          /*
           * The description — PRO-2's third slot, unblocked by RIC-1.
           *
           * The chain is exactly `projectDescription()` in `fold.ts`: a change
           * event, else the `description` tag, else `.content`. Declaring any
           * shorter version renders something wrong — the tag alone loses every
           * edit, the fold alone renders blank for a project nobody has edited.
           *
           * **No `truncate`, and no `subtitle` yet.** SPEC §13.5 makes rendering
           * a body as plain text conformant, so a consumer can show this today;
           * what it cannot do is flatten marker text into a one-line summary
           * without a parser, and that parser is RIC-4. PRO-8's rule stands
           * until then: an app whose description is structured owes the
           * consumer the summary rather than expecting it to guess.
           */
          body: { fold: 'description', tag: 'description', field: 'content' },
        },
      },
      [KIND.ISSUE]: {
        widget: 'row',
        slots: {
          title: { tag: 'title' },
          // No `subtitle` — same reason as the project above (PRO-8). Peek's
          // current widget never rendered this one anyway: a `row` is a single
          // line by definition, so it reads `subtitle` only for a `card`. That
          // made the issue projection the quieter half of the same defect, not
          // an exempt one — the declaration was wrong for any consumer that
          // chose to use it, and a manifest describes the object rather than
          // one consumer's layout.
          status: { fold: 'status', map: 'issueStatuses', default: DEFAULT_ISSUE_STATUS },
          meta: [
            // Folded, seeded from the tag — see `fold.ts`. Declared this way so
            // a consumer reading the slot gets the assigned key rather than the
            // absence the root carries when somebody else created the issue.
            { fold: 'ref', tag: 'ref' },
            { label: 'Assignee', fold: 'assignee', as: 'pubkey' },
          ],
          // No `tag` seed here, unlike the project: `buildIssue` writes the
          // description straight to `.content` and an issue root carries no
          // `description` tag at all (`events.ts`). Declaring one would be a
          // spelling nothing has ever written.
/*
            `tag` added with `add-issue`'s description field: an issue filed by a
            foreign consumer carries the body on a `description` tag, and the
            chain without it renders blank for exactly the issues this app did
            not create. Now identical to the project's above.
          */
          body: { fold: 'description', tag: 'description', field: 'content' },
        },
      },
    },

    // ── Vocabularies, so a consumer can render and validate ───────────────
    // Declared once and used for both. These are the same arrays the
    // Ship UI renders from — not a copy that can drift.
    vocabularies: {
      statuses: PROJECT_STATUSES,
      issueStatuses: ISSUE_STATUSES,
    },

    // ── What another app may DO ───────────────────────────────────────────
    // The consumer publishes the event itself; this says what to publish.
    // Note every action emits a CHANGE, never a rewrite — that is what lets
    // someone who is not the author act at all.
    /*
      Every action carries `description` and `effect` (PRO-5, RFC 0.4 §13.4).

      `label` is a button caption — "Change status" tells a person which control
      to press and tells a caller choosing *between* actions nothing. The
      description is prose aimed at a machine, and each one here carries a fact
      the label cannot: that a status lives on the change stream rather than on
      the issue, that a project's lead is not an issue's assignee, that an
      issue's root event holds immutable facts only.

      **All six are `writes`, and none is `destructive` — because Ship offers no
      destructive action to anyone else.** Archiving and deleting a project are
      real operations with real UI, and neither is declared here, so no other
      app can invoke them. That is a decision rather than an oversight: delete
      is a NIP-09 request honoured only for the author, and archive is a folded
      field a consumer already honours through `hiddenWhen`. Worth stating
      because "no destructive actions" otherwise reads as an unexercised
      vocabulary rather than as an inventory.

      Nothing reads either field yet. They are here because adding a field costs
      a line and adding one after several apps have published manifests is a
      migration across every one of them, and a manifest is republished by its
      owner alone.
    */
    actions: [
      {
        id: 'set-issue-status',
        label: 'Change status',
        description:
          'Move an issue through its lifecycle by setting its status to one of the issueStatuses values. ' +
          'The status is not on the issue \u2014 it lives on the change stream \u2014 so this is the only way to move it, ' +
          'and every move stays attributable to whoever made it.',
        effect: 'writes',
        appliesTo: String(KIND.ISSUE),
        emits: { kind: KIND.CHANGE, field: 'status' },
        input: { type: 'string', enum: 'issueStatuses' },
      },
      {
        id: 'assign-issue',
        label: 'Assign',
        description:
          'Say who is doing an issue, by public key. An empty value clears the assignment. ' +
          'Distinct from a project lead, which is accountability for a whole project rather than for this one issue.',
        effect: 'writes',
        appliesTo: String(KIND.ISSUE),
        emits: { kind: KIND.CHANGE, field: 'assignee' },
        input: { type: 'pubkey' },
      },
      /**
       * The same two operations, on a project.
       *
       * Absent until PEEK-24 asked a consumer to render a project's properties
       * as controls rather than as text, and their absence was the whole answer
       * to why it could not: a consumer may only offer what the owner declares.
       * Nothing in Ship had to change to support them — `fold.ts` already
       * reads both fields off the change stream. They were simply never said out
       * loud, which is the failure mode this manifest exists to prevent.
       */
      {
        id: 'set-project-status',
        label: 'Change status',
        description:
          'Set a whole project\u2019s status to one of the statuses values \u2014 use when the project itself starts, ' +
          'finishes or is abandoned. Not for the state of the issues inside it, which each carry their own status.',
        effect: 'writes',
        appliesTo: String(KIND.PROJECT),
        emits: { kind: KIND.CHANGE, field: 'status' },
        input: { type: 'string', enum: 'statuses' },
      },
      {
        id: 'assign-project',
        label: 'Assign',
        description:
          'Say who is accountable for a project, by public key. An empty value clears it. ' +
          'The tag is `lead` rather than `assignee`; they are the same idea at two levels and not interchangeable.',
        effect: 'writes',
        appliesTo: String(KIND.PROJECT),
        emits: { kind: KIND.CHANGE, field: 'lead' },
        input: { type: 'pubkey' },
      },
      {
        id: 'comment',
        label: 'Comment',
        description:
          'Say something about a project or an issue that is not a change to one of its fields. ' +
          'The comment lands in the Folder both apps read, so it appears in the paired conversation as well as on the object.',
        effect: 'writes',
        /**
         * Emits NIP-22 `kind:1111`, and **also declares the `kind:9` it used
         * to**. Both halves matter and they are not the same statement.
         *
         * `kind` is what a consumer publishes. Ship moved to `1111` because
         * scoping a threaded comment to an *addressable* event is exactly what
         * lets two apps comment on the same object without either owning the
         * comment kind — and because it is the standard version of what Ship
         * was already doing with a bare `a` tag.
         *
         * `alsoRead` is what a consumer must still *fetch*. A `kind:9` message
         * is not replaceable at all, so every comment written before this stays
         * a `kind:9` permanently — there is no migration and there never will
         * be. Omitting `alsoRead` would not lose the new comments, it would
         * lose all the old ones, and it would do it silently: a thread that
         * begins in the middle. See `protocol/SPEC.md` §7.3.
         *
         * This manifest does not describe Ship so much as instruct Peek. Peek
         * publishes under `kind` and reads the union of both (`commentKindsOf`),
         * so this event and Ship's writer have to change together — flipping
         * one without the other makes Peek publish a kind Ship is not writing,
         * or query a kind that has no history.
         *
         * The conversation stays shared either way, which was the original
         * point of declaring `kind:9`: a project is a Folder, a Peek topic is
         * that Folder, and a comment lands in the container both apps read. A
         * `1111` carrying `h` is in that same container.
         */
        appliesTo: [String(KIND.PROJECT), String(KIND.ISSUE)],
        emits: { kind: KIND.COMMENT, scope: 'address', alsoRead: [KIND.MESSAGE] },
        input: { type: 'string' },
      },
      {
        id: 'add-issue',
        label: 'Add issue',
        description:
          'File a new issue under a project. Only a title is required; a description is optional and becomes the ' +
          'issue body. Status and assignee are not set here — they are their own actions afterwards, because only ' +
          'what the issue *is* belongs on the root event.',
        effect: 'writes',
        appliesTo: String(KIND.PROJECT),
        emits: { kind: KIND.ISSUE, setTag: 'a', toAddressOf: 'self' },
        /*
          A title alone was a worse capture than the context switch it replaced:
          the whole point of filing from a conversation is carrying what was said
          into the issue, and there was nowhere to put it.

          `description` is optional, so a title-only capture still works exactly
          as before. It is not `required`, and it must not be — a person who has
          a title and no more should not be blocked.

          **Adding it here alone would have published descriptions nothing
          renders.** The runtime writes each declared property to a tag of its
          own name, so this arrives as `["description", …]` with empty content,
          and both of Ship's readers wanted `.content`: `fold.ts` (now
          `recordDescription`) and the issue projection's `body` slot below,
          which needed the same `tag: 'description'` a project's already had.
          Three places, all of which had to agree.
        */
        input: {
          type: 'object',
          properties: { title: { type: 'string' }, description: { type: 'string' } },
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
 * Signed by **the user**, not by Ship, and that is the point. A `#k`
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

/**
 * Where Ship is served.
 *
 * Only ever used to build the `web` tag below. It is a *hint* for other apps,
 * not something this app reads — Ship never needs to know its own URL to
 * function, and hardcoding a port into the data layer would be a lie the first
 * time somebody deploys it anywhere else.
 */
export const DEFAULT_APP_URL = 'http://localhost:5190/ship/'

export function buildManifest(
  pubkey: string,
  createdAtMs: number,
  appUrl = DEFAULT_APP_URL,
): UnsignedEvent {
  const tags: NostrTag[] = [
    ['d', MANIFEST_D_TAG],
    ['k', String(KIND.PROJECT)],
    ['k', String(KIND.ISSUE)],
    /**
     * NIP-89's `web` tag: how to open one of these objects in the app that owns
     * it. `<bech32>` is substituted by the consumer with the entity it is
     * holding — here always an `naddr`, since both kinds are addressable.
     *
     * This is the return leg of the roundtrip, and until it existed the loop was
     * one-directional: Peek could render a Ship issue and change its
     * status, and the only way back to the issue itself was to alt-tab and hunt
     * for the row. A reference you cannot follow is a screenshot.
     *
     * It points at `/o/…` rather than a direct issue route on purpose — the
     * naddr does not carry the Folder, so the app has to resolve the object
     * before it knows which container, and therefore which URL, it belongs to.
     *
     * The hash came off with SHI-16, along with the rest of Ship's routes. A
     * consumer holding an old `#/o/<naddr>` link still resolves it: `parse`
     * reads both shapes, for the same reason `urls` declares both below.
     */
    ['web', `${appUrl.replace(/\/+$/, '')}/o/<bech32>`, 'naddr'],
    /*
      RFC 0.5 §7.5's `urls` — the inbound half.

      `web` is outbound: given an object, build a link that opens it. These are
      inbound: given a link somebody pasted, recover which object it names. They
      are different questions, which is why §7.5 makes them different fields,
      and an app that changes its routes still has to read the links it
      published under the old ones.

      The third element is the kind. §7.2 says the kind comes from the path
      segment — but `/issue/` means 30851 only *to Ship*, and a consumer has
      never heard of "issue". Naming it here is what lets an app that knows
      nothing about Ship resolve one of its links.

      The hash form is declared too, and deliberately. Every link Ship published
      before SHI-16 is `#/issue/<kind>:<pubkey>:<d>`, those are in other
      people's messages, and a consumer matching only the current shape would
      render them as plain links for ever.
    */
    ['urls', `${appUrl.replace(/\/+$/, '')}/project/<slug>-<d>`, String(KIND.PROJECT)],
    ['urls', `${appUrl.replace(/\/+$/, '')}/issue/<slug>-<d>`, String(KIND.ISSUE)],
    ['urls', `${appUrl.replace(/\/+$/, '')}/#/project/<d>`, String(KIND.PROJECT)],
    ['urls', `${appUrl.replace(/\/+$/, '')}/#/issue/<d>`, String(KIND.ISSUE)],
  ]
  return {
    pubkey,
    created_at: toNostrSeconds(createdAtMs),
    kind: 31990,
    tags,
    content: JSON.stringify(manifestContent()),
  }
}

/**
 * A slot's value, resolved the way a consumer resolves it.
 *
 * **Here rather than in `scripts/publish-manifest.ts`**, which is where it
 * lived, because that script calls `main()` at import and so nothing could test
 * it. It was wrong, and had been since PRO-11 (see the ordering note inside).
 * Next to the `SlotSource` type it interprets, it is `manifest-slots.test.ts`'s
 * subject instead.
 *
 * It stays a second implementation of what `@estiva-app/interop` already does,
 * which is the drift SHA-19 is about. The reason it exists at all is that the
 * publish check must be able to say "this declaration resolves against a real
 * object" without the consumer runtime agreeing that it does — a check that
 * shares an implementation with the thing it checks cannot catch that
 * implementation being wrong. That argument justifies the copy; it does not
 * justify the copy having *different* semantics, which is what this fixes.
 */
export function resolveSlotValue(
  slot: SlotSource,
  event: { tags: string[][]; content: string },
  folded: Record<string, { value: string }>,
): string | undefined {
  // A `children` slot is a query, not a value on this event. It is resolved
  // separately, against the relay, by `checkListSlot` — returning undefined
  // here would report the flagship slot as an empty optional and prove nothing.
  if ('children' in slot) return undefined

  /*
    **The fold first**, then the seed tag, then content, then the default.

    This used to branch on `'tag' in slot` before anything else, under a comment
    claiming it mirrored consumers "so the check and the rendering cannot
    disagree". It did not: a slot that is *both* fold and tag — `{fold: "ref",
    tag: "ref"}` has been declared here since PRO-11 — took the tag branch and
    returned the seed, or undefined, without ever reading the fold. The check
    reported the value the object was created with while every consumer rendered
    the current one, which is the disagreement the comment ruled out.

    Invisible because it was only ever wrong for a *changed* field, and this
    script builds a fresh object and changes one thing: the status, which is
    declared as a bare fold and so never entered the tag branch.
  */
  if ('fold' in slot) {
    const changed = folded[slot.fold]?.value
    if (changed !== undefined) return changed
  }
  if ('tag' in slot && slot.tag) {
    // `tag` may name several spellings, meaning first that resolves — a slot
    // whose tag was renamed has to reach records written under both. An empty
    // value is skipped rather than accepted: it is the absence of an answer,
    // and stopping there would report a blank slot with a good fallback behind
    // it.
    for (const name of Array.isArray(slot.tag) ? slot.tag : [slot.tag]) {
      const value = event.tags.find((t) => t[0] === name)?.[1]
      if (value !== undefined && value !== '') return value
    }
  }
  if ('field' in slot && slot.field && event.content !== '') return event.content
  return 'fold' in slot ? slot.default : undefined
}
