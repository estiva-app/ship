/**
 * Attachments fold off `imeta` — CON-12, NIP-92.
 *
 * The fold itself is small; what it has to get right is which events may carry
 * an attachment and what happens to a tag the sender wrote badly. `imetaOf`
 * skips a malformed tag rather than half-reading it, which is what keeps a
 * missing `size` from rendering as a zero-byte file.
 */
import type { SignedEvent } from '@estiva-app/protocol'
import { imetaTag } from '@estiva-app/protocol'
import { attachmentsInDocument, foldAttachments } from '../src/attachments'
import { KIND } from '../src/kinds'

let passed = 0
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? '✅' : '❌'} ${label}`)
  if (!ok) process.exitCode = 1
  else passed++
}

const SHA = 'a'.repeat(64)
const OTHER = 'c'.repeat(64)

const meta = { url: `/media/${SHA}.jpg`, m: 'image/jpeg', x: SHA, size: 1234 }

let seq = 0
function message(opts: { kind?: number; tags?: string[][]; id?: string }): SignedEvent {
  return {
    id: opts.id ?? (seq++).toString(16).padStart(64, '0'),
    pubkey: 'b'.repeat(64),
    created_at: 1_700_000_000,
    kind: opts.kind ?? KIND.MESSAGE,
    tags: [['h', '11111111-1111-4111-8111-111111111111'], ...(opts.tags ?? [])],
    content: 'look at this',
    sig: '0'.repeat(128),
  } as SignedEvent
}

console.log('\nAttachments fold.\n')

check('no events means no entries', Object.keys(foldAttachments([])).length === 0)

{
  const e = message({ tags: [imetaTag(meta)] })
  const out = foldAttachments([e])
  check('a kind:9 with an imeta becomes one attachment', out[e.id]?.length === 1)
  check('the blob hash survives, since it is what a reader has to authorize', out[e.id]?.[0].x === SHA)
  check('the url survives, since it is where the bytes are', out[e.id]?.[0].url === meta.url)
}

{
  const e = message({ kind: KIND.COMMENT, tags: [imetaTag(meta)] })
  check('a kind:1111 comment carries attachments too', foldAttachments([e])[e.id]?.length === 1)
}

{
  const e = message({})
  check('a message with no imeta gets no entry at all', foldAttachments([e])[e.id] === undefined)
}

{
  const second = { ...meta, x: OTHER, url: `/media/${OTHER}.png`, m: 'image/png' }
  const e = message({ tags: [imetaTag(meta), imetaTag(second)] })
  const out = foldAttachments([e])
  check('several files on one message all come through', out[e.id]?.length === 2)
  // The sender chose an order and a reader has no better one; index order is
  // the only thing that reproduces what they saw when they attached them.
  check('in the order they were written', out[e.id]?.[1].x === OTHER)
}

{
  /*
    An edit replaces the body and nothing else (RFC 0.4 §7.2.1). There is no
    rule for what an `imeta` on one would mean, and inventing one here would
    let an edit silently add or drop a file — so a 40003 contributes nothing.
  */
  const e = message({ kind: KIND.MESSAGE_EDIT, tags: [['e', SHA], imetaTag(meta)] })
  check('an edit event never contributes an attachment', Object.keys(foldAttachments([e])).length === 0)
}

{
  const e = message({ kind: 7, tags: [imetaTag(meta)] })
  check('a reaction never contributes one either', Object.keys(foldAttachments([e])).length === 0)
}

{
  // Missing `size`. `imetaOf` skips it rather than defaulting to 0, because a
  // file that renders as "0 bytes" reads as a broken upload rather than a
  // sender who wrote a bad tag.
  const e = message({ tags: [['imeta', `url ${meta.url}`, 'm image/jpeg', `x ${SHA}`]] })
  check('a malformed imeta is skipped, not half-read', foldAttachments([e])[e.id] === undefined)
}

{
  const withFile = message({ tags: [imetaTag(meta)] })
  const without = message({})
  const out = foldAttachments([withFile, without])
  check('only the message that carried one is indexed', Object.keys(out).length === 1 && out[withFile.id] !== undefined)
}


/*
  The other model — a description's files, SPEC §13.3 and SHI-2.

  A message carries `imeta` tags because its body is text. A description carries
  `attachment` blocks, because a block document has somewhere to put them. Same
  fields, so a reader draws either with the same code — and these check that the
  block reader is as unforgiving about a malformed one as `imetaOf` is about a
  malformed tag.
*/
console.log('\nAttachments in a description.\n')

const BLOCKS = 'estiva-blocks-1'
const attachmentBlock = (attrs: Record<string, unknown>, id = 'b2') => ({ type: 'attachment', id, attrs })
const doc = (...blocks: unknown[]) => JSON.stringify({ type: 'doc', content: blocks })
const paragraph = { type: 'paragraph', id: 'b1', content: [{ type: 'text', text: 'see this' }] }
const FULL = { url: `/media/${SHA}.png`, m: 'image/png', x: SHA, size: 4096 }

{
  const files = attachmentsInDocument(doc(paragraph, attachmentBlock(FULL)), BLOCKS)
  check('a description names the file it places inline', files.length === 1 && files[0].x === SHA)
}

{
  const rich = { ...FULL, dim: '800x600', thumb: `/media/${SHA}.thumb.jpg`, filename: 'shot.png', alt: 'a screenshot' }
  const [file] = attachmentsInDocument(doc(attachmentBlock(rich)), BLOCKS)
  check('  …with the optional fields it had', file.dim === '800x600' && file.filename === 'shot.png' && file.alt === 'a screenshot')
}

{
  // Depth-first: an attachment inside a list or a quote is still an attachment,
  // and a reader that only looked at the top level would publish a document
  // naming a blob with no tag to verify it.
  const nested = { type: 'blockquote', id: 'q1', content: [attachmentBlock(FULL, 'b9')] }
  check('an attachment nested in another block is found', attachmentsInDocument(doc(nested), BLOCKS).length === 1)
}

{
  const two = doc(attachmentBlock(FULL, 'b2'), attachmentBlock({ ...FULL, x: OTHER, url: `/media/${OTHER}.png` }, 'b3'))
  check('several come back in document order', attachmentsInDocument(two, BLOCKS).map((f) => f.x).join() === `${SHA},${OTHER}`)
}

{
  // Each REQUIRED field, missing in turn. A block this cannot vouch for must
  // not become a tag: naming a blob the relay does not hold takes the whole
  // event down, so a half-read block is worse than a dropped one.
  for (const field of ['url', 'm', 'x', 'size']) {
    const broken = { ...FULL } as Record<string, unknown>
    delete broken[field]
    check(`  …a block with no ${field} is skipped, not half-read`, attachmentsInDocument(doc(attachmentBlock(broken)), BLOCKS).length === 0)
  }
  check('  …and a size that is not a number is skipped too', attachmentsInDocument(doc(attachmentBlock({ ...FULL, size: '4096' })), BLOCKS).length === 0)
}

{
  check('marker text carries no attachment blocks', attachmentsInDocument('just words', undefined) .length === 0)
  check('  …nor does a scalar field, which is what every other change carries', attachmentsInDocument('in_progress', undefined).length === 0)
  check('  …nor an empty value', attachmentsInDocument('', BLOCKS).length === 0)
  check('unparseable JSON is answered with nothing, not a throw', attachmentsInDocument('{oops', BLOCKS).length === 0)
}
console.log(`\n${passed} checks passed.\n`)
