/**
 * Creating and renaming a Folder from Ship — FOL-8.
 *
 *   npx tsx scripts/folder-create-rename.test.ts
 *
 * Offline, against a fake relay that records what it was sent and refuses the
 * kind a case tells it to. The claims: a create is `kind:9007` then
 * `kind:1852 add` naming and listing nothing — Peek's
 * `createFolderAsViewer` — so it has state from birth; a refused channel sends
 * nothing more; a rename is `kind:9002` alone (SPEC §3.2, MAN-17): no
 * command carries a name. A delete
 * (SHI-27) is one `kind:9008` and nothing else.
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
const FOLDER = '11111111-1111-4111-8111-111111111111'

let sent: UnsignedEvent[] = []
/** Which kind to refuse. */
let refuse: number | undefined

const tag = (event: UnsignedEvent, name: string) => event.tags.find((t) => t[0] === name)?.[1]
const relay = {
  async publish(event: SignedEvent): Promise<PublishResult> {
    sent.push(event)
    if (event.kind === refuse) return { ok: false, reason: 'restricted: not an admin' } as PublishResult
    return { ok: true } as PublishResult
  },
} as unknown as Relay
const signer = { pubkey: ME, sign: async (unsigned: UnsignedEvent) => ({ ...unsigned, id: 'x', sig: 'y' }) } as unknown as Signer
const store = new Store(relay, signer)

const shape = () => sent.map((event) => `${event.kind} ${tag(event, 'op') ?? '-'} ${tag(event, 'name') ?? '-'}`)
function reset(refusal?: number) {
  sent = []
  refuse = refusal
}

// 1. Create: the channel, then its state, both on the new id.
reset()
const created = await store.createFolder('FOL-8 check')
check('a create is kind:9007 with the name, then kind:1852 add with none (MAN-17)', JSON.stringify(shape()) === JSON.stringify(['9007 - FOL-8 check', '1852 add -']), shape().join(' | '))
check('…both on the id it returns', sent.every((event) => tag(event, 'h') === created.id), sent.map((event) => tag(event, 'h')).join(' '))
check('…the command lists nothing', !sent[1]?.tags.some((t) => t[0] === 'a'))
check('…open, as Peek makes it: no visibility on the channel', !sent[0]?.tags.some((t) => t[0] === 'private' || t[0] === 'visibility'))
check('…and nothing was refused', created.refusedAt === undefined && created.result.ok)
check('a create mints a fresh uuid each time', created.id !== (await store.createFolder('again')).id)

// 2. A refused channel sends nothing more.
reset(9007)
const noChannel = await store.createFolder('FOL-8 check')
check('a refused channel is not followed by a command', sent.length === 1 && noChannel.refusedAt === 0, shape().join(' | '))
check('…and the reason is the relay’s', noChannel.result.reason === 'restricted: not an admin')

// 3. A refused command after an accepted channel says which.
reset(1852)
const unlisted = await store.createFolder('FOL-8 check')
check('a refused command is reported at index 1', unlisted.refusedAt === 1 && sent.length === 2)

// 4. Rename: the channel's name, the title's only home (SPEC §3.2, MAN-17) — never a command.
reset()
const renamed = await store.renameFolder({ folder: FOLDER, name: 'Renamed' })
check('a rename is kind:9002 alone, whatever the Folder holds', JSON.stringify(shape()) === JSON.stringify(['9002 - Renamed']), shape().join(' | '))
check('…on the Folder named', sent.every((event) => tag(event, 'h') === FOLDER))
check('…and nothing was refused', renamed.ok)

// 5. A refused rename says the relay's reason.
reset(9002)
const refusedRename = await store.renameFolder({ folder: FOLDER, name: 'Renamed' })
check('a refused kind:9002 comes back refused', sent.length === 1 && !refusedRename.ok && refusedRename.reason === 'restricted: not an admin')

// 7. Not a Folder id: refused before anything is signed.
reset()
let threw = false
try {
  await store.renameFolder({ folder: 'not-a-uuid', name: 'x' })
} catch {
  threw = true
}
check('a rename of something that is not a Folder id sends nothing', threw && sent.length === 0)

// 8. Delete (SHI-27): one kind:9008 on the Folder named, and the relay's refusal comes back as it was.
reset()
const deleted = await store.deleteFolder(FOLDER)
check('a delete is one kind:9008 on the Folder named', sent.length === 1 && sent[0]?.kind === 9008 && tag(sent[0], 'h') === FOLDER, shape().join(' | '))
check('…and nothing else rides on it', JSON.stringify(sent[0]?.tags) === JSON.stringify([['h', FOLDER]]))
check('…accepted', deleted.ok)
reset(9008)
const refusedDelete = await store.deleteFolder(FOLDER)
check('a refused delete reports the relay’s reason', !refusedDelete.ok && refusedDelete.reason === 'restricted: not an admin')
reset()
threw = false
try {
  await store.deleteFolder('not-a-uuid')
} catch {
  threw = true
}
check('a delete of something that is not a Folder id sends nothing', threw && sent.length === 0)

if (failures > 0) {
  console.log(`\n${failures} failed`)
  process.exit(1)
}
console.log('\nall passed')
