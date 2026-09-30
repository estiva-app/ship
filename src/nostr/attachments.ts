/**
 * Attachments — NIP-92 `imeta`, CON-12.
 *
 * A file on a message is a blob on the relay plus one `imeta` tag naming it.
 * The tag is the whole of what travels: `url`, `m`, `x` (the sha256) and
 * `size`, with `dim`, `alt`, `thumb` and `filename` where the sender had them.
 *
 * A message's attachment set — its own `imeta`, replaced by the latest edit
 * carrying any — is `@estiva-app/conversation`'s `foldAttachments` (CON-5).
 * What stays here is Ship's block document, which only Ship writes.
 */
import type { Imeta } from '@estiva-app/protocol'
import { BLOCK_DOCUMENT_FORMAT } from '@estiva-app/protocol'

/**
 * The files a block document places inline — SPEC §13.3's `attachment` block.
 *
 * The other half of `foldAttachments`. A message carries its files as
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
