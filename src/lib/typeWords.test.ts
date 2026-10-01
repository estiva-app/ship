import { describe, expect, it } from 'vitest'
import { fileShapesOf, typeWordOf, wordCollisions } from './typeWords'

const SHIP = {
  tags: [
    ['urls', 'https://ship.estiva.app/project/<slug>-<d>', '30850'],
    ['urls', 'https://ship.estiva.app/issue/<slug>-<d>', '30851'],
    ['urls', 'https://ship.estiva.app/#/issue/<d>', '30851'],
  ],
}
const PEEK = {
  name: 'Peek',
  tags: [
    ['urls', 'https://peek.estiva.app/topic/<slug>-<d>', '30840'],
    ['urls', 'https://peek.estiva.app/topic/<slug>-<d>?thread=<id>', '1111'],
    ['urls', 'https://peek.estiva.app/message/<id>', '9'],
  ],
}

describe('typeWordOf', () => {
  it('reads the word off a path shape and off an old hash shape alike', () => {
    expect(typeWordOf('https://ship.estiva.app/issue/<slug>-<d>')).toBe('issue')
    expect(typeWordOf('https://ship.estiva.app/#/issue/<d>')).toBe('issue')
  })

  it('declares no word when the first segment is a placeholder', () => {
    expect(typeWordOf('https://x.example/<d>')).toBe(null)
  })
})

describe('fileShapesOf', () => {
  it('leaves out a thread shape, whose kind comes from its query', () => {
    expect(fileShapesOf(PEEK).map((s) => [s.word, s.kind])).toEqual([
      ['topic', 30840],
      ['message', 9],
    ])
  })

  it('reads a shape with no kind as each kind the manifest handles', () => {
    const manifest = { tags: [['k', '30023'], ['urls', 'https://leaf.example/doc/<slug>-<d>']] }
    expect(fileShapesOf(manifest)).toEqual([{ word: 'doc', kind: 30023, pattern: 'https://leaf.example/doc/<slug>-<d>' }])
  })
})

describe('wordCollisions — §7.7 rule 1', () => {
  it('finds none between the manifests on production', () => {
    expect(wordCollisions(SHIP, [PEEK])).toEqual([])
  })

  it('refuses a word another manifest declares for a different kind', () => {
    const colliding = { tags: [...SHIP.tags, ['urls', 'https://ship.estiva.app/topic/<slug>-<d>', '30851']] }
    expect(wordCollisions(colliding, [PEEK])).toEqual([
      '"topic" is kind 30851 here and kind 30840 in Peek (https://peek.estiva.app/topic/<slug>-<d>)',
    ])
  })

  it('allows the same word for the same kind — a second app handling it', () => {
    const handling = { tags: [...SHIP.tags, ['urls', 'https://ship.estiva.app/topic/<slug>-<d>', '30840']] }
    expect(wordCollisions(handling, [PEEK])).toEqual([])
  })
})
