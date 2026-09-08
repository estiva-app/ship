/**
 * Attachments — NIP-92 `imeta`, CON-12.
 *
 * A file on a message is a blob on the relay plus one `imeta` tag naming it.
 * The tag is the whole of what travels: `url`, `m`, `x` (the sha256) and
 * `size`, with `dim`, `alt`, `thumb` and `filename` where the sender had them.
 *
 * ## Why this is not in `foldFolder`
 *
 * The same reason as `edits.ts`. `foldFolder` is a contract between this repo
 * and `estiva-agent`, held by `scripts/conformance.test.ts`, which compares the
 * recorded state walking the **union of keys** — so a `files` field on
 * `Message` turns both repos red at once. An attachment has to be visible as an
 * attachment, which means a field, which means it cannot live there.
 *
 * So this reads the raw events beside the fold, exactly as `edits.ts` and
 * `references.ts` do, and the page looks a message's files up by id.
 *
 * ## What SHI-1 asked for
 *
 * Katerina: *"Screenshots and reference widgets aren't rendered in conversation
 * or replies."* The reference half was fixed when `Conversations` learned to
 * draw a `nostr:` pointer as the object it names. The screenshot half could not
 * be fixed here at all until peek#177 — Peek's outbox published `content` and
 * nothing else, so an attachment stayed in Convex storage and no other reader
 * had an image to draw. It publishes `imeta` now, and this reads it.
 *
 * Parsing lives in `@estiva-app/protocol` (`imetaOf`), not here: the tag is a
 * wire format two apps read, and the relay refuses a malformed one, so a second
 * parser is a second set of refusals to get wrong.
 */
import type { Imeta, SignedEvent } from '@estiva-app/protocol'
import { imetaOf } from '@estiva-app/protocol'
import { KIND } from './kinds'

/** Message id → its attachments, in the order the sender wrote them. */
export type AttachmentIndex = Record<string, Imeta[]>

/**
 * Read `imeta` off every message that carries one.
 *
 * Only the kinds the fold treats as messages. A `kind:40003` edit replaces the
 * body and nothing else (RFC 0.4 §7.2.1), so an `imeta` on one would be a
 * claim this reader has no rule for — attachments stay whatever the original
 * message said they were.
 *
 * Pure and event-shaped, so it runs in a test with no app around it, and so it
 * can move into `@estiva-app/conversation` (CON-5) rather than be rewritten.
 */
export function foldAttachments(events: readonly SignedEvent[]): AttachmentIndex {
  const out: AttachmentIndex = {}
  for (const event of events) {
    if (event.kind !== KIND.MESSAGE && event.kind !== KIND.COMMENT) continue
    const files = imetaOf(event)
    if (files.length > 0) out[event.id] = files
  }
  return out
}
