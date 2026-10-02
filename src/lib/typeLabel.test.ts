import { describe, expect, it } from 'vitest'
import { thisObject, typeLabelOf } from './typeLabel'

describe('typeLabelOf', () => {
  it('names an object by its type, not its app (PRO-24)', () => {
    expect(typeLabelOf({ noun: 'topic', appName: 'Peek' })).toBe('Topic')
    expect(typeLabelOf({ noun: 'comment', appName: 'Peek' })).toBe('Comment')
  })

  it('falls back to the app name when the app declares no noun', () => {
    expect(typeLabelOf({ appName: 'Leaf' })).toBe('Leaf')
    expect(typeLabelOf({})).toBeUndefined()
  })
})

describe('thisObject', () => {
  it('says the type in a sentence, or the app, or neither', () => {
    expect(thisObject({ noun: 'topic', appName: 'Peek' })).toBe('this topic')
    expect(thisObject({ appName: 'Leaf' })).toBe('this Leaf object')
    expect(thisObject({})).toBe('this object')
  })
})
