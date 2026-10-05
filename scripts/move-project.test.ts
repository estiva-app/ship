/**
 * Moving a project between top-level Folders — FOL-7.
 *
 *   npx tsx scripts/move-project.test.ts
 *
 * Offline, against a fake relay that records what it was sent and refuses
 * what a case tells it to. The claims: a move is `kind:1852` add to the
 * target then remove from the source and nothing else — never a `kind:1851`,
 * so the conversation's Folder cannot change; a Folder without state is
 * refused before anything is sent; a refused add sends nothing more; a
 * refused remove is reported per Folder; a project in two Folders leaves both
 * but the target.
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
/** Which command to refuse: `op` in Folder `h`. */
let refuse: { op: string; h: string } | undefined

const tag = (event: UnsignedEvent, name: string) => event.tags.find((t) => t[0] === name)?.[1]
const relay = {
  async publish(event: SignedEvent): Promise<PublishResult> {
    sent.push(event)
    if (refuse && tag(event, 'op') === refuse.op && tag(event, 'h') === refuse.h) return { ok: false, reason: 'restricted: not a channel member' } as PublishResult
    return { ok: true } as PublishResult
  },
} as unknown as Relay
const signer = { pubkey: ME, sign: async (unsigned: UnsignedEvent) => ({ ...unsigned, id: 'x', sig: 'y' }) } as unknown as Signer
const store = new Store(relay, signer)

const shape = () => sent.map((event) => `${event.kind} ${tag(event, 'op')} ${tag(event, 'h')?.slice(0, 1)} ${tag(event, 'a') === PROJECT ? 'project' : tag(event, 'a')}`)
function reset(refusal?: { op: string; h: string }) {
  sent = []
  refuse = refusal
}

// 1. The ordinary move.
reset()
let result = await store.moveProject({ project: PROJECT, from: [A], to: B })
check('a move is add to the target, then remove from the source', JSON.stringify(shape()) === JSON.stringify(['1852 add 2 project', '1852 remove 1 project']), shape().join(' | '))
check('…and both were accepted', result.added?.ok === true && result.removed.length === 1 && result.removed[0].result.ok && result.refused === undefined)
check('no kind:1851 — the conversation keeps its Folder', sent.every((event) => event.kind === 1852))

// 2. and 3. A Folder without state: refused, nothing sent.
reset()
result = await store.moveProject({ project: PROJECT, from: [A], to: { ...B, hasState: false } })
check('into a Folder with no state is refused before anything is sent', result.refused === 'target-has-no-state' && sent.length === 0)
reset()
result = await store.moveProject({ project: PROJECT, from: [{ ...A, hasState: false }], to: B })
check('out of a Folder with no state is refused before anything is sent', result.refused === 'source-has-no-state' && sent.length === 0)

// 4. The remove refused: it is in both.
reset({ op: 'remove', h: A.id })
result = await store.moveProject({ project: PROJECT, from: [A], to: B })
check('a refused remove is reported for that Folder, after an accepted add', result.added?.ok === true && result.removed.length === 1 && result.removed[0].folder === A.id && !result.removed[0].result.ok)

// 5. The add refused: nothing more.
reset({ op: 'add', h: B.id })
result = await store.moveProject({ project: PROJECT, from: [A], to: B })
check('a refused add sends no remove', result.added?.ok === false && sent.length === 1 && result.removed.length === 0)

// 6. Listed in two after a half move: moving into one of them leaves the other.
reset()
result = await store.moveProject({ project: PROJECT, from: [A, B], to: B })
check('in A and B, moved to B: one add to B, one remove from A', JSON.stringify(shape()) === JSON.stringify(['1852 add 2 project', '1852 remove 1 project']), shape().join(' | '))
reset()
result = await store.moveProject({ project: PROJECT, from: [A, C], to: B })
check('in A and C, moved to B: one add, then a remove from each', JSON.stringify(shape()) === JSON.stringify(['1852 add 2 project', '1852 remove 1 project', '1852 remove 3 project']), shape().join(' | '))

// 7. and 8. In no Folder; already only in the target.
reset()
result = await store.moveProject({ project: PROJECT, from: [], to: B })
check('a project no Folder lists is only added', JSON.stringify(shape()) === JSON.stringify(['1852 add 2 project']) && result.removed.length === 0, shape().join(' | '))
reset()
result = await store.moveProject({ project: PROJECT, from: [B], to: B })
check('a move to where it already is, and only there, sends nothing', sent.length === 0 && result.refused === undefined)

// 9. Listed in two, a different topic under it in each (SHI-37): one add naming all of it, so it lands whole or not at all.
const T1 = `30840:${ME}:t1`
const T2 = `30840:${ME}:t2`
const listings = new Map([
  [A.id, [{ ref: PROJECT, address: PROJECT }, { ref: T1, address: T1, parentRef: PROJECT }]],
  [C.id, [{ ref: PROJECT, address: PROJECT }, { ref: T2, address: T2, parentRef: PROJECT }]],
])
const named = (event: UnsignedEvent) => event.tags.filter((t) => t[0] === 'a').map((t) => t[1])
reset()
result = await store.moveProject({ project: PROJECT, from: [A, C], to: B, listings })
const adds = sent.filter((event) => tag(event, 'op') === 'add')
check('in A and C with a topic each: one add naming the project and both topics', adds.length === 1 && JSON.stringify(named(adds[0])) === JSON.stringify([PROJECT, T1, T2]), adds.map(named).join(' | '))
check('…then a remove from each, naming what that Folder lists', JSON.stringify(sent.slice(1).map(named)) === JSON.stringify([[PROJECT, T1], [PROJECT, T2]]))
reset({ op: 'add', h: B.id })
result = await store.moveProject({ project: PROJECT, from: [A, C], to: B, listings })
check('…and that add refused leaves nothing in the target and sends no remove', result.added?.ok === false && sent.length === 1 && result.removed.length === 0)

// 10. Held by its own Folder by containment, a topic under it listed there (`placedIn`'s fallback): MoveProject names the project
//     in each source, so the two move together rather than the topic alone.
reset()
result = await store.moveProject({ project: PROJECT, from: [{ ...A, addresses: [PROJECT] }], to: B, listings: new Map([[A.id, [{ ref: T1, address: T1, parentRef: PROJECT }]]]) })
check('a project its Folder holds by containment moves with the topic listed under it', JSON.stringify(sent.map(named)) === JSON.stringify([[PROJECT, T1], [PROJECT, T1]]), sent.map(named).join(' | '))

if (failures) {
  console.log(`\n${failures} failed`)
  process.exit(1)
}
console.log('\nall passed')
