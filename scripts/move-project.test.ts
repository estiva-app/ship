/**
 * Moving a project between top-level Folders — FOL-7, TEA-3.
 *
 *   npx tsx scripts/move-project.test.ts
 *
 * Offline, against a fake relay that records what it was sent and refuses
 * what a case tells it to. The claims: a move is one `kind:1852 move` into the
 * target per source, naming the source in `from`, and nothing else — never a
 * `kind:1851`, so the conversation's Folder cannot change; a Folder without
 * state is refused before anything is sent; a refused move sends nothing more
 * and is read in the app's terms, never the relay's text; a project in two
 * Folders leaves both but the target.
 */
import type { PublishResult, Relay, SignedEvent, UnsignedEvent } from '@estiva-app/protocol'
import { Store } from '../src/nostr/store'
import type { Signer } from '../src/nostr/signer'

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures++
}

const ME = 'ab'.repeat(32)
const PROJECT = `30850:${ME}:p`
const A = { id: '11111111-1111-4111-8111-111111111111', hasState: true }
const B = { id: '22222222-2222-4222-8222-222222222222', hasState: true }
const C = { id: '33333333-3333-4333-8333-333333333333', hasState: true }

let sent: UnsignedEvent[] = []
/** Which move to refuse: the one out of Folder `from`, with the relay's `reason`. */
let refuse: { from: string; reason: string } | undefined

const tag = (event: UnsignedEvent, name: string) => event.tags.find((t) => t[0] === name)?.[1]
const relay = {
  async publish(event: SignedEvent): Promise<PublishResult> {
    sent.push(event)
    if (refuse && tag(event, 'from') === refuse.from) return { ok: false, reason: refuse.reason } as PublishResult
    return { ok: true } as PublishResult
  },
} as unknown as Relay
const signer = { pubkey: ME, sign: async (unsigned: UnsignedEvent) => ({ ...unsigned, id: 'x', sig: 'y' }) } as unknown as Signer
const store = new Store(relay, signer)

const shape = () =>
  sent.map((event) => `${event.kind} ${tag(event, 'op')} ${tag(event, 'h')?.slice(0, 1)}${tag(event, 'from') ? `<${tag(event, 'from')!.slice(0, 1)}` : ''} ${tag(event, 'a') === PROJECT ? 'project' : tag(event, 'a')}`)
function reset(refusal?: { from: string; reason: string }) {
  sent = []
  refuse = refusal
}

// 1. The ordinary move.
reset()
let result = await store.moveProject({ project: PROJECT, from: [A], to: B })
check('a move is one move into the target, naming the source', JSON.stringify(shape()) === JSON.stringify(['1852 move 2<1 project']), shape().join(' | '))
check('…and it was accepted', result.moveRefused === undefined && result.refused === undefined)
check('no kind:1851 — the conversation keeps its Folder', sent.every((event) => event.kind === 1852))

// 2. and 3. A Folder without state: refused, nothing sent.
reset()
result = await store.moveProject({ project: PROJECT, from: [A], to: { ...B, hasState: false } })
check('into a Folder with no state is refused before anything is sent', result.refused === 'target-has-no-state' && sent.length === 0)
reset()
result = await store.moveProject({ project: PROJECT, from: [{ ...A, hasState: false }], to: B })
check('out of a Folder with no state is refused before anything is sent', result.refused === 'source-has-no-state' && sent.length === 0)

// 4. The move refused: nothing moved, read in the app's terms.
reset({ from: A.id, reason: 'invalid: team 11111111 is archived' })
result = await store.moveProject({ project: PROJECT, from: [A], to: B })
check('a refused move is read: an archived team, nothing moved', result.moveRefused?.why === 'team-archived' && result.moveRefused.nothingMoved && sent.length === 1)

// 5. Listed in two after a half move: moving into one of them leaves the other.
reset()
result = await store.moveProject({ project: PROJECT, from: [A, B], to: B })
check('in A and B, moved to B: one move from A', JSON.stringify(shape()) === JSON.stringify(['1852 move 2<1 project']), shape().join(' | '))
reset()
result = await store.moveProject({ project: PROJECT, from: [A, C], to: B })
check('in A and C, moved to B: one move from each, in order', JSON.stringify(shape()) === JSON.stringify(['1852 move 2<1 project', '1852 move 2<3 project']), shape().join(' | '))
reset({ from: C.id, reason: 'invalid: 33333333 does not list it' })
result = await store.moveProject({ project: PROJECT, from: [A, C], to: B })
check('…the second refused: C still lists it, and the first stands', result.moveRefused?.why === 'changed-meanwhile' && !result.moveRefused.nothingMoved && JSON.stringify(result.moveRefused.notMovedFrom) === JSON.stringify([C.id]))
reset({ from: A.id, reason: "invalid: only the team's members may move it" })
result = await store.moveProject({ project: PROJECT, from: [A, C], to: B })
check('…the first refused: nothing more is sent', result.moveRefused?.why === 'not-a-member' && result.moveRefused.nothingMoved && sent.length === 1)

// 6. and 7. In no Folder; already only in the target.
reset()
result = await store.moveProject({ project: PROJECT, from: [], to: B })
check('a project no Folder lists is only added', JSON.stringify(shape()) === JSON.stringify(['1852 add 2 project']), shape().join(' | '))
reset()
result = await store.moveProject({ project: PROJECT, from: [B], to: B })
check('a move to where it already is, and only there, sends nothing', sent.length === 0 && result.refused === undefined)

// 8. Listed in two, a different topic under it in each (SHI-37): each move names what its source lists.
const T1 = `30840:${ME}:t1`
const T2 = `30840:${ME}:t2`
const listings = new Map([
  [A.id, [{ ref: PROJECT, address: PROJECT }, { ref: T1, address: T1, parentRef: PROJECT }]],
  [C.id, [{ ref: PROJECT, address: PROJECT }, { ref: T2, address: T2, parentRef: PROJECT }]],
])
const named = (event: UnsignedEvent) => event.tags.filter((t) => t[0] === 'a').map((t) => t[1])
reset()
result = await store.moveProject({ project: PROJECT, from: [A, C], to: B, listings })
check('in A and C with a topic each: a move from each, naming what that Folder lists', JSON.stringify(sent.map(named)) === JSON.stringify([[PROJECT, T1], [PROJECT, T2]]), sent.map(named).join(' | '))

// 9. Held by its own Folder by containment, a topic under it listed there (`placedIn`'s fallback): MoveProject names the project
//    in each source, so the two move together rather than the topic alone.
reset()
result = await store.moveProject({ project: PROJECT, from: [{ ...A, addresses: [PROJECT] }], to: B, listings: new Map([[A.id, [{ ref: T1, address: T1, parentRef: PROJECT }]]]) })
check('a project its Folder holds by containment moves with the topic listed under it', JSON.stringify(sent.map(named)) === JSON.stringify([[PROJECT, T1]]), sent.map(named).join(' | '))

if (failures) {
  console.log(`\n${failures} failed`)
  process.exit(1)
}
console.log('\nall passed')
