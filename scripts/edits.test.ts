/**
 * Edits fold to the latest one — CON-4, RFC 0.4 §7.2.1.
 *
 * The whole of the difficulty is ordering. Two edits published in the same
 * second have nothing to separate them in `created_at`, which is seconds, and
 * unlike a change event there is no per-field last-write-wins to limit the
 * damage: two edits of one message that disagree resolve to whichever the
 * reader happens to sort first. `ts` is what settles it, under §6.2's rule.
 */
import type { SignedEvent } from '@estiva-app/protocol'
import { foldEdits } from '../src/edits'
import { KIND } from '../src/kinds'

let passed = 0
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? '✅' : '❌'} ${label}`)
  if (!ok) process.exitCode = 1
  else passed++
}

const TARGET = 'a'.repeat(64)

let seq = 0
function edit(opts: { body: string; at: number; ts?: number; target?: string; id?: string }): SignedEvent {
  return {
    id: opts.id ?? `${(seq++).toString(16).padStart(64, '0')}`,
    pubkey: 'b'.repeat(64),
    created_at: opts.at,
    kind: KIND.MESSAGE_EDIT,
    tags: [
      ['h', '11111111-1111-4111-8111-111111111111'],
      ['e', opts.target ?? TARGET],
      ...(opts.ts === undefined ? [] : [['ts', String(opts.ts)]]),
    ] as string[][],
    content: opts.body,
    sig: '0'.repeat(128),
  } as SignedEvent
}

console.log('\nEdits fold.\n')

check('no edits means no entries', Object.keys(foldEdits([])).length === 0)

{
  const out = foldEdits([edit({ body: 'first', at: 1000 })])
  check('one edit becomes the current text', out[TARGET]?.body === 'first')
}

{
  // Out of order on purpose: input order must not decide the winner.
  const out = foldEdits([edit({ body: 'later', at: 2000 }), edit({ body: 'earlier', at: 1000 })])
  check('the latest edit wins, whatever order they arrive in', out[TARGET]?.body === 'later')
}

{
  /* The case `ts` exists for. Both in second 1000, so `created_at` cannot
     separate them; without `ts` the answer is whichever id sorts higher. */
  const out = foldEdits([
    edit({ body: 'ms 900', at: 1000, ts: 1_000_900, id: 'f'.repeat(64) }),
    edit({ body: 'ms 100', at: 1000, ts: 1_000_100, id: '0'.repeat(64) }),
  ])
  check('within one second, ts decides — not the event id', out[TARGET]?.body === 'ms 900')
}

{
  /*
    A `ts` disagreeing with `created_at` is IGNORED (SPEC §6.2). The relay
    bounds `created_at` and nothing bounds `ts`, so an unchecked one lets a
    skewed clock reorder somebody else's conversation.
  */
  const out = foldEdits([
    edit({ body: 'honest', at: 2000, id: '0'.repeat(64) }),
    edit({ body: 'lying ts', at: 1000, ts: 9_999_000, id: 'f'.repeat(64) }),
  ])
  check('a ts that disagrees with created_at is ignored, not trusted', out[TARGET]?.body === 'honest')
}

{
  // Falls back to one-second resolution rather than dropping the edit.
  const out = foldEdits([edit({ body: 'no ts', at: 1000 })])
  check('an edit with no ts still folds', out[TARGET]?.body === 'no ts')
  check('  …and reports its time in milliseconds', out[TARGET]?.at === 1_000_000)
}

{
  const out = foldEdits([
    edit({ body: 'tie a', at: 1000, id: '0'.repeat(64) }),
    edit({ body: 'tie b', at: 1000, id: 'f'.repeat(64) }),
  ])
  check('a genuine tie breaks on event id, stably', out[TARGET]?.body === 'tie b')
}

{
  const other = 'c'.repeat(64)
  const out = foldEdits([edit({ body: 'mine', at: 1000 }), edit({ body: 'theirs', at: 1000, target: other })])
  check('two targets keep their own edits', out[TARGET]?.body === 'mine' && out[other]?.body === 'theirs')
}

{
  /* An edit whose target this reader cannot see is KEPT: the target may arrive
     in a later read, and dropping it would need a second publish to recover. */
  const out = foldEdits([edit({ body: 'orphan', at: 1000, target: 'd'.repeat(64) })])
  check('an edit for an unseen target is kept, not discarded', Object.keys(out).length === 1)
}

{
  const notAnEdit = { ...edit({ body: 'x', at: 1000 }), kind: KIND.MESSAGE }
  check('a message is not an edit', Object.keys(foldEdits([notAnEdit as SignedEvent])).length === 0)
}

{
  const noTarget = { ...edit({ body: 'x', at: 1000 }), tags: [['h', 'f']] as string[][] }
  check('an edit naming nothing is skipped rather than thrown on', Object.keys(foldEdits([noTarget as SignedEvent])).length === 0)
}

console.log(`\n${passed} checks passed.\n`)
