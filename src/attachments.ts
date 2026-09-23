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
import { BLOCK_DOCUMENT_FORMAT, imetaOf } from '@estiva-app/protocol'
import { editsByTarget } from './edits'
import { KIND } from './kinds'

/** Message id → its attachments, in the order the sender wrote them. */
export type AttachmentIndex = Record<string, Imeta[]>

/**
 * Read `imeta` off every message that carries one, then fold edits over it.
 *
 * A message's own set comes from the kinds the fold treats as messages. A
 * `kind:40003` edit MAY carry `imeta` too (RFC 0.4 §7.2.1, amended 2026-09-23,
 * CON-5): the set is that of the **latest edit carrying at least one**, in the
 * body fold's own order (`editsByTarget`, not a second ordering). An edit with
 * none leaves the set alone — every edit written before the amendment means
 * what it meant — and a set replaces, it never appends. An edit whose target
 * this reader cannot see is kept under the target's id, as `foldEdits` keeps it.
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
  for (const [target, list] of editsByTarget(events)) {
    for (let i = list.length - 1; i >= 0; i--) {
      const files = imetaOf(list[i])
      if (files.length === 0) continue
      out[target] = files
      break
    }
  }
  return out
}

/**
 * The files a block document places inline — SPEC §13.3's `attachment` block.
 *
 * The other half of {@link foldAttachments}. A message carries its files as
 * `imeta` **tags** because its body is text; a description carries them as
 * blocks, because a block document has somewhere to put them and an
 * addressable sub-unit to put them at. Same fields either way, so a reader that
 * draws one draws the other.
 *
 * ## Why this is read back out of the document
 *
 * §13.3 requires the event carrying the document to *also* name each blob in an
 * `imeta` tag, and this is what finds them. Deriving the tags from the document
 * rather than taking them from the caller is deliberate: ingest verifies tags
 * and never parses `content`, so a caller that forgot would publish a
 * description naming a blob the relay does not hold, and nothing would refuse
 * it. A description whose files and tags disagree is not expressible.
 *
 * Malformed blocks are skipped rather than half-read, exactly as `imetaOf`
 * skips a malformed tag: a block missing `url`, `m`, `x` or `size` is not an
 * attachment this can vouch for, and naming a blob on the strength of it would
 * take the whole event down.
 */
export function attachmentsInDocument(value: string, contentFormat?: string): Imeta[] {
  if (contentFormat !== BLOCK_DOCUMENT_FORMAT || !value) return []
  let document: unknown
  try {
    document = JSON.parse(value)
  } catch {
    // Not a document at all. The caller's problem, and not one to guess at.
    return []
  }
  const out: Imeta[] = []
  walk((document as { content?: unknown }).content, out)
  return out
}

/** Depth-first, because an attachment may sit inside a list or a quote. */
function walk(nodes: unknown, out: Imeta[]): void {
  if (!Array.isArray(nodes)) return
  for (const node of nodes) {
    const block = node as { type?: string; attrs?: Record<string, unknown>; content?: unknown }
    if (block.type === 'attachment') {
      const file = imetaFromAttrs(block.attrs)
      if (file) out.push(file)
    }
    walk(block.content, out)
  }
}

/**
 * `attrs` → `Imeta`, or `undefined` when a REQUIRED field is missing.
 *
 * Exported because the renderer needs the identical rule: a block this declines
 * to name in a tag is a block it must not draw as a file either, and two
 * near-identical checks would drift the first time one of them was relaxed.
 */
export function imetaFromAttrs(attrs: Record<string, unknown> | undefined): Imeta | undefined {
  if (!attrs) return undefined
  const { url, m, x, size, dim, thumb, alt, filename } = attrs
  if (typeof url !== 'string' || !url) return undefined
  if (typeof m !== 'string' || !m) return undefined
  if (typeof x !== 'string' || !x) return undefined
  if (typeof size !== 'number' || !Number.isFinite(size)) return undefined
  return {
    url,
    m,
    x,
    size,
    ...(typeof dim === 'string' && dim ? { dim } : {}),
    ...(typeof thumb === 'string' && thumb ? { thumb } : {}),
    ...(typeof alt === 'string' && alt ? { alt } : {}),
    ...(typeof filename === 'string' && filename ? { filename } : {}),
  }
}
