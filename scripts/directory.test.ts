/**
 * The private directory client (PEEK-50).
 *
 * The properties worth pinning are all about what happens when the answer is
 * *partial*, because that is the normal case rather than the exception: most
 * keys on this relay belong to nobody Estiva ID has heard of.
 *
 *   npx tsx scripts/directory.test.ts
 */
import { lookupMembers, type Member } from '../lib/estiva-id/directory'

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures++
}

const CONFIG = { base: 'https://id.test', clientId: 'estiva-ship' }
const SESSION = { token: 'a-token', pubkey: 'ff'.repeat(32), expiresAt: Date.now() + 600_000 }

const key = (n: number) => n.toString(16).padStart(64, '0')

const member = (pubkey: string): Member => ({
  pubkey,
  displayName: 'Ada',
  email: 'ada@example.test',
  role: 'member',
  status: 'active',
})

/** Replace global fetch, capturing every request the client made. */
function stub(handler: (body: { pubkeys: string[] }) => unknown | Promise<unknown>) {
  const seen: { pubkeys: string[] }[] = []
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { pubkeys: string[] }
    seen.push(body)
    const result = await handler(body)
    if (result instanceof Response) return result
    return new Response(JSON.stringify(result), { status: 200 })
  }) as typeof fetch
  return seen
}

console.log('\nThe private directory client\n')

{
  const seen = stub((body) => ({ contacts: body.pubkeys.map(member) }))
  const found = await lookupMembers(CONFIG, SESSION, [key(1), key(2)])

  check('it asks for the pubkeys it was given', seen[0]?.pubkeys.length === 2)
  check('and returns them keyed by pubkey', found.get(key(1))?.email === 'ada@example.test')
}

{
  // The endpoint caps a request at 200. Chunked rather than truncated: a busy
  // project easily has more distinct authors than that, and dropping the tail
  // would give some people contact details and others none, for no visible
  // reason.
  const seen = stub((body) => ({ contacts: body.pubkeys.map(member) }))
  const many = Array.from({ length: 450 }, (_, i) => key(i + 1))
  const found = await lookupMembers(CONFIG, SESSION, many)

  check('it chunks past the endpoint cap', seen.length === 3, `${seen.length} requests`)
  check('and never asks for more than 200 at once', seen.every((r) => r.pubkeys.length <= 200))
  check('and returns everybody', found.size === 450, `${found.size}`)
}

{
  // Every anonymous Ship user is a key Estiva ID has never seen, so an absent
  // pubkey is the common case. It must not become a null entry that a view then
  // renders as a blank name.
  const seen = stub(() => ({ contacts: [] }))
  const found = await lookupMembers(CONFIG, SESSION, [key(7)])

  check('a pubkey belonging to nobody is simply absent', found.size === 0)
  check('and it was still asked about', seen.length === 1)
}

{
  // Contact details sit on top of a record that already loaded. A directory
  // that is down should cost the names, not the issue list.
  stub(() => new Response('nope', { status: 500 }))
  const found = await lookupMembers(CONFIG, SESSION, [key(1)])
  check('a refusal degrades to nothing, not an exception', found.size === 0)
}

{
  globalThis.fetch = (async () => {
    throw new TypeError('Failed to fetch')
  }) as typeof fetch
  const found = await lookupMembers(CONFIG, SESSION, [key(1)])
  check('and so does a blocked request', found.size === 0)
}

{
  const seen = stub((body) => ({ contacts: body.pubkeys.map(member) }))
  await lookupMembers(CONFIG, SESSION, [])
  check('an empty ask makes no request at all', seen.length === 0)
}

{
  const seen = stub((body) => ({ contacts: body.pubkeys.map(member) }))
  await lookupMembers(CONFIG, SESSION, [key(3), key(3), key(3)])
  check('duplicates are asked about once', seen[0]?.pubkeys.length === 1)
}

console.log(failures === 0 ? '\nDirectory client OK.\n' : `\n${failures} failed.\n`)
process.exit(failures === 0 ? 0 : 1)
