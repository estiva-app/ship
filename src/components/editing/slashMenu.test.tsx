import { describe, expect, it } from 'vitest'
import { slashSections } from './slashMenu'

describe('the / menu', () => {
  it('hints the fence beside Code, which makes a block here (CON-32)', () => {
    const code = slashSections({})[0].commands.find((c) => c.key === 'format-code')!
    expect(code.row.shortcut).toBe('```')
  })
})
