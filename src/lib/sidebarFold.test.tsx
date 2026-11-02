import { afterEach, describe, expect, it } from 'vitest'
import { isFilePage } from './sidebarFold'

/**
 * Katerina, 30 October: a file opened from a link shows where it lives, so a folded sidebar unfolds for it, and a
 * list keeps it folded. The fold itself, remembered and unfolded once per page load, is the package's, tested there
 * (ui 0.99.0); which pages are a file is Ship's.
 */
describe('which of Ship’s pages a link unfolds the sidebar for', () => {
  afterEach(() => window.history.replaceState(null, '', '/'))
  const at = (path: string) => {
    window.history.replaceState(null, '', path)
    return isFilePage()
  }

  it('unfolds it for an issue, a project and another app’s file', () => {
    expect(at('/issue/fix-the-login-6f1c2b9e-0000-4000-8000-000000000001')).toBe(true)
    expect(at('/project/launch-6f1c2b9e-0000-4000-8000-000000000002')).toBe(true)
    expect(at('/document/plan-6f1c2b9e-0000-4000-8000-000000000003')).toBe(true)
  })

  it('keeps it folded on the Issues list and the Projects list', () => {
    expect(at('/')).toBe(false)
    expect(at('/projects')).toBe(false)
  })
})
