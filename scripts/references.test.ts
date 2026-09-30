/**
 * Comments and mentions are two lists — SPEC §6.4, CON-7.
 *
 * The case this file exists for is the one §5.1 names as indefensible: a
 * twenty-message thread that name-drops an issue on message twenty-one used to
 * land *inside that issue's comments*, indistinguishable from something somebody
 * wrote about it. `conversationsAbout` returns the union and cannot tell them
 * apart, because `Conversation.about` is a union of tags and body text, unioned
 * again across every message in the thread.
 *
 *   npx tsx scripts/references.test.ts
 *
 * Offline. The events are built the way the two apps actually build them —
 * Ship's `a` tag, Peek's body-only reference — because the whole claim is that
 * the split falls out of what production already publishes.
 */
import { foldFolder } from '../src/nostr/fold'
import { conversationsAbout } from '../src/nostr/fold'
import { attachmentOf, commentsOn, commentsOnAny, mentionsOf, anchorIndex } from '../src/nostr/references'
import { findNaddrs, naddrToAddr } from '@estiva-app/protocol'
import type { SignedEvent } from '@estiva-app/protocol'

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures++
}

const FOLDER = 'ffffffff-0000-0000-0000-000000000000'
const ISSUE = `30851:${'a'.repeat(64)}:the-issue`
/** What Ship appends to a comment body, and what a person types in Peek. */
const POINTER =
  'nostr:naddr1qqjxzde5xfjnvdee943kzwrr956rswr995uxgd3s95unsvekvd3nsvtzv3jnyqg4dp68gup69uhkcmmrv9kxsmmnwsarxvpsxqpzpvankwem8vankwem8vankwem8vankwem8vankwem8vankwem8vanqvzqqqrcsvczkget'
const POINTED_AT = naddrToAddr(POINTER.slice('nostr:'.length))

const refs = (body: string) => findNaddrs(body).map((n) => naddrToAddr(n))

let seq = 0
function event(partial: Partial<SignedEvent> & { kind: number }): SignedEvent {
  seq += 1
  return {
    id: partial.id ?? `e${seq}`,
    pubkey: partial.pubkey ?? 'b'.repeat(64),
    created_at: partial.created_at ?? 1_700_000_000 + seq,
    kind: partial.kind,
    tags: [['h', FOLDER], ...(partial.tags ?? [])],
    content: partial.content ?? '',
    sig: 'x'.repeat(128),
  } as SignedEvent
}

/** Ship's own comment: a NIP-22 `1111` naming the issue as its root, in both cases. */
const shipComment = (id: string, body: string) =>
  event({
    id,
    kind: 1111,
    tags: [
      ['A', ISSUE],
      ['a', ISSUE],
      ['K', '30851'],
    ],
    // `postMessage` appends the pointer as its own paragraph as well as tagging it.
    content: `${body}\n\n${POINTER}`,
  })

/** Peek's message before RIC-11: the reference is in the body and there is no `a` tag at all. */
const peekMessage = (id: string, body: string, replyTo?: string) =>
  event({
    id,
    kind: 9,
    tags: replyTo ? [['e', replyTo, '', 'reply']] : [],
    content: body,
  })

// ── The thread that names an issue on its last message ──────────────────────

const late = [
  peekMessage('m1', 'Standup notes.'),
  ...Array.from({ length: 19 }, (_, i) => peekMessage(`m${i + 2}`, `chatter ${i}`, 'm1')),
  peekMessage('m21', `Related: ${POINTER}`, 'm1'),
]

{
  const state = foldFolder(late, refs)
  const anchors = anchorIndex(late)
  const thread = state.conversations.find((c) => c.id === 'm1')!

  check(
    'the union still holds the thread — §6.4: the WHOLE thread attaches',
    conversationsAbout(state.conversations, POINTED_AT).length === 1,
  )
  check(
    'but it is a mention, not a comment — §5.1',
    attachmentOf(thread, POINTED_AT, anchors) === 'mention',
  )
  check(
    '  …so it is absent from the object’s own discussion',
    commentsOn(state.conversations, POINTED_AT, anchors).length === 0,
  )
  check(
    '  …and present under Mentioned in',
    mentionsOf(state.conversations, POINTED_AT, anchors).length === 1,
  )
}

// ── Ship's own comment, which must not be demoted ───────────────────────────

{
  const events = [shipComment('c1', 'Blocked on the Stripe key.')]
  const state = foldFolder(events, refs)
  const anchors = anchorIndex(events)
  const thread = state.conversations.find((c) => c.id === 'c1')!

  check('a tagged root is the object’s own comment', attachmentOf(thread, ISSUE, anchors) === 'comment')
  check('  …and appears in the comments list', commentsOn(state.conversations, ISSUE, anchors).length === 1)
  check('  …and not also under mentions', mentionsOf(state.conversations, ISSUE, anchors).length === 0)

  /*
    The reason subtraction cannot do this job. `startConversation` puts the
    address in the `a` tag AND the pointer in the body, so "tags minus body
    references" is empty for every comment Ship has ever written — which would
    demote the primary list wholesale.
  */
  check(
    'the same address is in the body too, which is why the tags must be read separately',
    thread.root.body.includes('nostr:naddr1') && (anchors.c1 ?? []).includes(ISSUE),
  )
}

// ── A reference at the root of a Peek thread is still a mention ─────────────

{
  const events = [peekMessage('p1', `Kicking off: ${POINTER}`)]
  const state = foldFolder(events, refs)
  const anchors = anchorIndex(events)
  const thread = state.conversations.find((c) => c.id === 'p1')!
  check(
    'a body reference at a thread root is a mention — §6.4 says a comment is a TAG',
    attachmentOf(thread, POINTED_AT, anchors) === 'mention',
  )
}

// ── A tag on a reply does not make the thread a comment ─────────────────────

{
  const events = [
    peekMessage('r1', 'Unrelated discussion.'),
    event({ id: 'r2', kind: 1111, tags: [['A', ISSUE], ['e', 'r1', '', 'reply'], ['E', 'r1']], content: 'see also' }),
  ]
  const state = foldFolder(events, refs)
  const anchors = anchorIndex(events)
  const thread = state.conversations.find((c) => c.about.includes(ISSUE))
  check(
    'a tag on a reply attaches the thread, but only as a mention',
    !!thread && attachmentOf(thread, ISSUE, anchors) === 'mention',
  )
}

// ── A thread whose root nobody can see reads as a mention ───────────────────

{
  // The root `m1` is missing — truncated history. `foldConversations` stands the
  // earliest visible message in for it, and that stand-in's tags are not the
  // root's, so calling it a comment would be a guess about an unseen event.
  const events = [event({ id: 'orphan', kind: 1111, tags: [['A', ISSUE], ['e', 'gone', '', 'reply'], ['E', 'gone']], content: 'a reply with no parent' })]
  const state = foldFolder(events, refs)
  const anchors = anchorIndex(events)
  const thread = state.conversations[0]
  check(
    'a thread with no visible root falls to the secondary list, not the primary one',
    attachmentOf(thread, ISSUE, anchors) === 'mention',
  )
}

// ── An object nothing refers to ─────────────────────────────────────────────

{
  const events = [peekMessage('n1', 'no references here')]
  const state = foldFolder(events, refs)
  const anchors = anchorIndex(events)
  check('an unreferenced object attaches to nothing', attachmentOf(state.conversations[0], ISSUE, anchors) === null)
}

// ── §6.4's per-tag rule: which `a` is a comment and which a mention (CON-13) ─

{
  const FILE = `30840:${'c'.repeat(64)}:a-peek-file`
  /*
    Peek's comment on a bare file that names the issue — peek#272 carries every
    body naddr as `a`, and NIP-22's `A` says the thread is the file's. Read
    the `a` as a comment and the file's discussion lands inside the issue's.
  */
  const peekFileComment = event({
    id: 'pf1',
    kind: 1111,
    tags: [['A', FILE], ['K', '30840'], ['a', FILE], ['k', '30840'], ['a', ISSUE]],
    content: `Something ${POINTER}`,
  })
  const state = foldFolder([peekFileComment], (b) => (b.includes(POINTER) ? [ISSUE] : []))
  const anchors = anchorIndex([peekFileComment])
  const thread = state.conversations.find((c) => c.id === 'pf1')!
  check('a 1111 root is a comment on its `A`', attachmentOf(thread, FILE, anchors) === 'comment')
  check('  …and only a mention of any other `a` it carries', attachmentOf(thread, ISSUE, anchors) === 'mention')
  check('  …so it is absent from the issue’s own discussion', commentsOn(state.conversations, ISSUE, anchors).length === 0)
  check('  …and present under Mentioned in', mentionsOf(state.conversations, ISSUE, anchors).length === 1)
}

{
  /*
    A `kind:9` is chat, and lists under no object as a comment (SPEC §6.4,
    C10). Peek's topic message since RIC-11 tags what the body names, which is
    a mention. Ship's pre-REW-10 comment tagged the issue and said nothing
    about it in the body; it read as a comment until CON-20 republished every
    one as a `kind:1111`, and since CON-5 it is a mention like any other `a`.
  */
  const topicMention = event({ id: 'k1', kind: 9, tags: [['a', POINTED_AT]], content: `About ${POINTER}` })
  const legacyComment = event({ id: 'k2', kind: 9, tags: [['a', ISSUE]], content: 'Reopening: the fix did not land.' })
  const events = [topicMention, legacyComment]
  const state = foldFolder(events, refs)
  const anchors = anchorIndex(events)
  const mention = state.conversations.find((c) => c.id === 'k1')!
  const legacy = state.conversations.find((c) => c.id === 'k2')!
  check('a kind:9 `a` the body also names is a mention', attachmentOf(mention, POINTED_AT, anchors) === 'mention')
  check('a kind:9 `a` the body does not name is no comment either — CON-20 migrated them', attachmentOf(legacy, ISSUE, anchors) === 'mention')
}

{
  // Malformed: a 1111 with no `A`. Its `a` is read as the `A` rather than dropping the thread.
  const events = [event({ id: 'noA', kind: 1111, tags: [['a', ISSUE]], content: 'no root tag' })]
  const state = foldFolder(events, refs)
  const anchors = anchorIndex(events)
  check('a 1111 with no `A` is a comment on its `a`', attachmentOf(state.conversations[0], ISSUE, anchors) === 'comment')
}

// ── The sub-file roll-up: a project's Activity is its issues' comments ──────

{
  const OTHER_ISSUE = `30851:${'a'.repeat(64)}:the-other-issue`
  const UNRELATED = `30851:${'a'.repeat(64)}:not-in-this-project`
  const events = [
    shipComment('s1', 'On the first issue.'),
    event({ id: 's2', kind: 1111, tags: [['A', OTHER_ISSUE], ['a', OTHER_ISSUE]], content: 'On the second.' }),
    event({ id: 's3', kind: 1111, tags: [['A', UNRELATED], ['a', UNRELATED]], content: 'On somebody else’s issue.' }),
    // A thread that merely *names* one of the project's issues, mid-conversation.
    peekMessage('s4', 'Unrelated chatter.'),
    peekMessage('s5', `Related: ${POINTER}`, 's4'),
  ]
  const state = foldFolder(events, refs)
  const anchors = anchorIndex(events)
  const mine = new Set([ISSUE, OTHER_ISSUE])

  const rolled = commentsOnAny(state.conversations, mine, anchors)
  check('a project rolls up the comments on its own issues', rolled.length === 2, `${rolled.length}`)
  check(
    '  …each paired with the issue it is about, so the row can name it',
    rolled.every((r) => mine.has(r.about)) && new Set(rolled.map((r) => r.about)).size === 2,
  )
  check("  …and not another project's issue", !rolled.some((r) => r.about === UNRELATED))

  /*
    The §5.1 merge would come back through this door otherwise. A thread that
    name-drops an issue is not that issue's comment, so it must not be rolled up
    into its project's Activity as one either — it is a mention of the issue,
    which is the issue's own Activity row and not the project's sub-file row.
  */
  check(
    '  …and never a thread that merely mentions one of them',
    !rolled.some((r) => r.conversation.id === 's4'),
  )
}

console.log(
  failures === 0
    ? '\nComments and mentions stay apart.'
    : `\n${failures} failed — the two strengths of §6.4 are being merged.`,
)
process.exit(failures === 0 ? 0 : 1)
