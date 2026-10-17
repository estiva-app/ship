// @vitest-environment jsdom
/**
 * Whose page it is, after a boot that entered on an expired token (AUT-4).
 *
 * When Estiva ID is slow to renew, the boot stops waiting after three seconds
 * and enters on what it holds. The page is still the person's: a write signs
 * as them, not as this browser's throwaway key, or private Folders read empty
 * and anything they make lands under a key nobody knows.
 */
import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('../config', () => ({
  ID_CONFIG: { base: 'https://id.estiva.app', clientId: 'estiva-ship' },
  RELAY_URL: 'wss://estiva.estiva.app',
  workspaceLabel: () => 'estiva.estiva.app',
}))

const PERSON = 'b3'.repeat(32)

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

it('signs as the person when the page opened on an expired token still being renewed', async () => {
  localStorage.setItem(
    'ship.estiva-id.token',
    JSON.stringify({ accessToken: 'at', pubkey: PERSON, expiresAt: Date.now() - 1_000, refreshToken: 'rt-1' }),
  )
  const { signer } = await import('./store')
  expect(signer.pubkey).toBe(PERSON)
})
