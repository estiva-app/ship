import { describe, expect, it } from 'vitest'
import { workspaceLabel } from './config'

describe('build-time config', () => {
  it('names the workspace as a person would — host and port, no scheme', () => {
    expect(workspaceLabel('http://localhost:3000')).toBe('localhost:3000')
    expect(workspaceLabel('https://estiva.estiva.app')).toBe('estiva.estiva.app')
    expect(workspaceLabel('not a url')).toBe('not a url')
  })
})
