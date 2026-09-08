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
import { foldAttachments } from '../src/attachments'
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

console.log(`\n${passed} checks passed.\n`)
