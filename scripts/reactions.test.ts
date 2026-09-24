/**
 * Reactions fold to counts — SPEC §6.6, CON-2.
 *
 *   npx tsx scripts/reactions.test.ts
 *
 * Offline. The interesting cases are the ones a relay produces and a naive fold
 * gets wrong: the same person reacting twice, a reaction whose target is not on
 * this page, an empty `content`, and the horizon cutting the wrong end.
 */
import { foldReactions, reactionTargets, REACTION_TARGET_LIMIT } from '../src/nostr/reactions'
import type { SignedEvent } from '@estiva-app/protocol'

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures++
}

const ANA = 'a'.repeat(64)
const RAVI = 'b'.repeat(64)
const ME = 'c'.repeat(64)

let seq = 0
const reaction = (target: string, emoji: string, pubkey: string, at = ++seq): SignedEvent =>
  ({
    id: `r${seq}`,
    pubkey,
    created_at: 1_700_000_000 + at,
    kind: 7,
    tags: [['e', target]],
    content: emoji,
    sig: 'x'.repeat(128),
  }) as SignedEvent

// ── Counting ────────────────────────────────────────────────────────────────

{
  const folded = foldReactions(
    [reaction('m1', '👍', ANA), reaction('m1', '👍', RAVI), reaction('m1', '🎉', ANA), reaction('m2', '👍', ANA)],
    ME,
  )
  check('groups by target', Object.keys(folded).sort().join() === 'm1,m2')
  check('  …and by emoji within a target', folded.m1.length === 2)
  check('  …counting distinct reactors', folded.m1.find((r) => r.emoji === '👍')?.count === 2)
  check(
    '  …most reacted first',
    folded.m1[0].emoji === '👍',
    folded.m1.map((r) => `${r.emoji}${r.count}`).join(' '),
  )
  check('  …recording who, in the order they reacted', folded.m1[0].by.join() === `${ANA},${RAVI}`)
}

// ── The cases a naive fold gets wrong ───────────────────────────────────────

{
  /*
    A double publish is one person, not two. Nothing stops a client publishing
    the same reaction twice — a retry, two tabs — and counting it twice would
    show "2" for one reactor with no way to notice.
  */
  const folded = foldReactions([reaction('m1', '👍', ANA), reaction('m1', '👍', ANA)], ME)
  check('the same pubkey reacting twice counts once', folded.m1[0].count === 1)
  check('  …and the first event is the one a retraction targets', folded.m1[0].mine === undefined)
}

{
  const folded = foldReactions([reaction('m1', '👍', ME), reaction('m1', '👍', ANA)], ME)
  check('the viewer’s own reaction carries the id that retracts it', !!folded.m1[0].mine)
  check('  …which is the reaction’s event, never the message', folded.m1[0].mine !== 'm1')
}

{
  const folded = foldReactions([reaction('m1', '', ANA)], ME)
  /* NIP-25's bare "like". There is no glyph the author chose, and inventing one
     would put a 👍 on screen nobody published. */
  check('an empty reaction is skipped rather than drawn as a guess', folded.m1 === undefined)
}

{
  const noTarget = { ...reaction('m1', '👍', ANA), tags: [] } as SignedEvent
  check('a reaction naming no target is dropped', Object.keys(foldReactions([noTarget], ME)).length === 0)
}

{
  const notAReaction = { ...reaction('m1', '👍', ANA), kind: 9 } as SignedEvent
  check('a non-reaction in the same response is ignored', Object.keys(foldReactions([notAReaction], ME)).length === 0)
}

{
  /* Ship reads both kinds permanently — a comment is a 1111 and a reply is a
     kind:9 — and a reaction targets an event id either way. Nothing in the fold
     looks at the target's kind, and this is what says so. */
  const folded = foldReactions([reaction('a-kind-9-reply', '👍', ANA), reaction('a-kind-1111-comment', '🎉', ANA)], ME)
  check('reactions land on kind:9 and kind:1111 targets alike', Object.keys(folded).length === 2)
}

// ── The horizon ─────────────────────────────────────────────────────────────

{
  const { targets, omitted } = reactionTargets(['m1', 'm2', 'm3'])
  check('a page under the horizon asks about all of it', targets.length === 3 && omitted === 0)
}

{
  const ids = Array.from({ length: REACTION_TARGET_LIMIT + 5 }, (_, i) => `m${i}`)
  const { targets, omitted } = reactionTargets(ids)
  check('a page over the horizon is capped', targets.length === REACTION_TARGET_LIMIT)
  check('  …and says how many it left out', omitted === 5)
  /*
    Cut from the OLDEST end. The caller passes messages oldest-first, and the
    recent end is where reactions are — truncating the other way would drop
    exactly the reactions somebody is looking at.
  */
  check('  …keeping the recent end of the conversation', targets[targets.length - 1] === `m${ids.length - 1}`)
  check('  …not the oldest', !targets.includes('m0'))
}

{
  const { targets } = reactionTargets(['m1', 'm1', 'm2'])
  check('a repeated id is asked about once', targets.length === 2)
}

console.log(failures === 0 ? '\nReactions fold.' : `\n${failures} failed.`)
process.exit(failures === 0 ? 0 : 1)
