import { describe, expect, it } from 'vitest'
import { ID_CONFIG, RELAY_URL, workspaceLabel } from './config'

describe('build-time config', () => {
  it('defaults to the local relay, exactly — the smoke test intercepts this origin', () => {
    expect(RELAY_URL).toBe('http://localhost:3000')
  })

  it('offers no sign-in when ID_BASE is empty: anonymous-only is a real mode', () => {
    expect(ID_CONFIG).toBeNull()
  })

  it('names the workspace as a person would — host and port, no scheme', () => {
    expect(workspaceLabel('http://localhost:3000')).toBe('localhost:3000')
    expect(workspaceLabel('https://estiva.estiva.app')).toBe('estiva.estiva.app')
    expect(workspaceLabel('not a url')).toBe('not a url')
  })
})
