/**
 * Attachments fold off `imeta` — CON-12, NIP-92.
 *
 * The fold itself is small; what it has to get right is which events may carry
 * an attachment and what happens to a tag the sender wrote badly. `imetaOf`
 * skips a malformed tag rather than half-reading it, which is what keeps a
 * missing `size` from rendering as a zero-byte file.
 */
import type { Relay, SignedEvent, UnsignedEvent } from '@estiva-app/protocol'
import { imetaTag } from '@estiva-app/protocol'
import { foldAttachments } from '@estiva-app/conversation'
import { attachmentsInDocument } from '../src/nostr/attachments'
import { KIND } from '../src/nostr/kinds'
import { Store } from '../src/nostr/store'
import type { Signer } from '../src/nostr/signer'

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

/*
  An edit MAY carry `imeta` (RFC 0.4 §7.2.1, amended 2026-09-23, CON-5). The
  set is the latest edit's that carries at least one, in the body fold's order;
  an edit with none leaves it alone; a set replaces, never appends.
*/
const THIRD = 'e'.repeat(64)
const metaOf = (x: string) => ({ ...meta, url: `/media/${x}.jpg`, x })
function editOf(target: string, at: number, files: string[], id?: string): SignedEvent {
  return {
    ...message({ kind: KIND.MESSAGE_EDIT, tags: [['e', target], ...files.map((x) => imetaTag(metaOf(x)))], id }),
    created_at: at,
  } as SignedEvent
}

{
  const root = message({ tags: [imetaTag(meta)] })
  const out = foldAttachments([root, editOf(root.id, 1_700_000_100, [OTHER, THIRD])])
  check('a later edit with imeta replaces the set', out[root.id]?.map((f) => f.x).join() === `${OTHER},${THIRD}`)
  check('  …and does not append to it', out[root.id]?.length === 2)
}

{
  const root = message({ tags: [imetaTag(meta)] })
  const out = foldAttachments([root, editOf(root.id, 1_700_000_100, [])])
  check('an edit without imeta leaves the set as it was', out[root.id]?.length === 1 && out[root.id]?.[0].x === SHA)
}

{
  const root = message({ tags: [imetaTag(meta)] })
  // Out of order on purpose, and the latest carries none: it must not clear.
  const out = foldAttachments([
    editOf(root.id, 1_700_000_300, []),
    editOf(root.id, 1_700_000_200, [THIRD]),
    root,
    editOf(root.id, 1_700_000_100, [OTHER]),
  ])
  check('the latest edit carrying imeta wins over an earlier one', out[root.id]?.length === 1 && out[root.id]?.[0].x === THIRD)
}

{
  const root = message({})
  const out = foldAttachments([root, editOf(root.id, 1_700_000_100, [OTHER])])
  check('an edit can give a message with no files its first one', out[root.id]?.[0].x === OTHER)
}

{
  // Same second, so id decides — the body fold's tiebreak, not a second rule.
  const root = message({})
  const out = foldAttachments([
    editOf(root.id, 1_700_000_100, [THIRD], 'f'.repeat(64)),
    editOf(root.id, 1_700_000_100, [OTHER], '1'.repeat(64)),
  ])
  check('a same-second tie breaks on event id, as the body fold does', out[root.id]?.[0].x === THIRD)
}

{
  const e = editOf('d'.repeat(64), 1_700_000_100, [OTHER])
  check('an edit for an unseen target is kept under the target id', foldAttachments([e])['d'.repeat(64)]?.[0].x === OTHER)
  check('  …and never under its own id', foldAttachments([e])[e.id] === undefined)
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
// ── An edit's files, as Ship signs them (PEEKM-4) ──────────────────────────────
//
// A file added or taken off while editing rides the edit as the whole `imeta`
// set, which the fold above reads; an edit that left the files alone carries
// none, so the set stays.
{
  const sent: UnsignedEvent[] = []
  const relay = { publish: async (event: SignedEvent) => (sent.push(event), { ok: true }) } as unknown as Relay
  const signer = { pubkey: 'ab'.repeat(32), sign: async (unsigned: UnsignedEvent) => ({ ...unsigned, id: 'x', sig: 'y' }) } as unknown as Signer
  const store = new Store(relay, signer)
  const FOLDER = '11111111-1111-4111-8111-111111111111'
  const imetas = (event: UnsignedEvent) => event.tags.filter((t) => t[0] === 'imeta')

  await store.editMessage({ folder: FOLDER, messageEventId: 'd'.repeat(64), body: 'with two files', files: [meta, metaOf(OTHER)] })
  check('an edit that changed the files is a kind:40003 carrying the whole set as imeta', sent[0].kind === 40003 && imetas(sent[0]).length === 2)
  check('  …each tag naming its blob', imetas(sent[0]).map((t) => t.find((part) => part.startsWith('x '))).join() === `x ${SHA},x ${OTHER}`)
  check('  …and the result folds to that set', foldAttachments([{ ...sent[0], id: 'f'.repeat(64), created_at: 2 } as SignedEvent])['d'.repeat(64)]?.length === 2)

  await store.editMessage({ folder: FOLDER, messageEventId: 'd'.repeat(64), body: 'words only' })
  check('an edit that left the files alone carries no imeta', sent[1].kind === 40003 && imetas(sent[1]).length === 0)
}

console.log(`\n${passed} checks passed.\n`)
