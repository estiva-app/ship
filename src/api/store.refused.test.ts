// @vitest-environment jsdom
/**
 * A write the relay refuses reaches the error reports by its reason code alone (PROD-5): "refused: archived",
 * never the relay's sentence, which can quote a title, nor anything that was written.
 */
import { afterEach, expect, it, vi } from 'vitest'

const heard = vi.hoisted(() => [] as string[])
vi.mock('../lib/failureReports', () => ({ heardRefusal: (code: string) => heard.push(code) }))
vi.mock('../config', () => ({
  ID_CONFIG: { base: 'https://id.estiva.app', clientId: 'estiva-ship' },
  RELAY_URL: 'wss://estiva.estiva.app',
  workspaceLabel: () => 'estiva.estiva.app',
}))

afterEach(() => {
  heard.length = 0
  vi.unstubAllGlobals()
})

const answering = (status: number, body: unknown) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))

const written = { id: 'e'.repeat(64), pubkey: 'a'.repeat(64), sig: 's'.repeat(128), kind: 1111, created_at: 1, tags: [], content: 'Board offsite plan' }

it('a write the relay refuses is heard by its reason code, without the relay’s sentence or what was written', async () => {
  answering(200, { accepted: false, message: 'restricted: archived: “Board offsite plan” is archived' })
  const { relay } = await import('./store')
  const result = await relay.publish(written)
  expect(result.ok).toBe(false)
  expect(heard).toEqual(['archived'])
})

it('a write the relay takes is not heard', async () => {
  answering(200, { accepted: true, message: '' })
  const { relay } = await import('./store')
  expect((await relay.publish(written)).ok).toBe(true)
  expect(heard).toEqual([])
})
