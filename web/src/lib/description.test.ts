/**
 * The seam between what is stored and what is edited — SPEC §13.
 *
 * The conversion itself is `@estiva-app/protocol`'s and is tested there against
 * 152 real bodies. What is Ship's, and what is here, is **when** it converts:
 * which saves write a document, which bodies are left exactly as they are, and
 * whether an edit keeps the ids a comment is anchored to.
 */
import { describe, it, expect } from 'vitest'
import { parseBlockDocument, type ContentFormat } from '@estiva-app/protocol'
import { descriptionForEditing, descriptionForPublishing } from './description'

const idsOf = (json: string) => parseBlockDocument(json).content.map((b) => b.id)

describe('what a save publishes', () => {
  it('writes a block document and declares it', () => {
    const { value, contentFormat } = descriptionForPublishing('# Title\n\npara', '', 'marker')
    expect(contentFormat).toBe('estiva-blocks-1')
    const doc = parseBlockDocument(value)
    expect(doc.content.map((b) => b.type)).toEqual(['heading', 'paragraph'])
    expect(doc.content.every((b) => b.id.length >= 8)).toBe(true)
  })

  it('keeps the ids a comment is anchored to, across an edit', () => {
    const first = descriptionForPublishing('# Title\n\nfirst\n\nsecond', '', 'marker')
    const second = descriptionForPublishing('# Title\n\nfirst, edited\n\nsecond', first.value, 'blocks')
    expect(idsOf(second.value)).toEqual(idsOf(first.value))
  })

  it('declares nothing for an empty description, and writes empty text', () => {
    expect(descriptionForPublishing('   ', 'anything', 'marker')).toEqual({ value: '' })
  })

  it('mints fresh ids rather than refusing the edit when the stored body is mis-tagged', () => {
    // Tagged `blocks`, not a document. Losing anchors on an already-broken body
    // beats losing the edit.
    const { value, contentFormat } = descriptionForPublishing('para', 'not a document', 'blocks')
    expect(contentFormat).toBe('estiva-blocks-1')
    expect(idsOf(value)).toHaveLength(1)
  })
})

describe('what the editor opens with', () => {
  it('leaves a legacy marker body exactly as it is', () => {
    const legacy = '# Title\n\na **bold** word'
    expect(descriptionForEditing(legacy, 'marker')).toBe(legacy)
  })

  it('leaves a body that merely looks like JSON alone — §13.4', () => {
    // No tag means marker text, however much the body resembles a document.
    const looksLikeOne = '{"type":"doc","content":[]}'
    expect(descriptionForEditing(looksLikeOne, 'marker')).toBe(looksLikeOne)
  })

  it('turns a stored document back into the text that produced it', () => {
    const text = '# Title\n\n- a\n- b\n\nplain'
    const { value } = descriptionForPublishing(text, '', 'marker')
    expect(descriptionForEditing(value, 'blocks')).toBe(text)
  })

  it('shows what is actually stored when a body is mis-tagged', () => {
    expect(descriptionForEditing('not a document', 'blocks')).toBe('not a document')
  })

  it('round-trips: editing and saving without changing anything moves no id', () => {
    const { value } = descriptionForPublishing('# T\n\none\n\ntwo', '', 'marker')
    const reopened = descriptionForEditing(value, 'blocks')
    const resaved = descriptionForPublishing(reopened, value, 'blocks')
    expect(idsOf(resaved.value)).toEqual(idsOf(value))
  })
})

describe('every other field is untouched', () => {
  it('is only ever called for a description', () => {
    // Guard against the obvious mistake: a folded `status` arrives through the
    // same `value` tag, and tagging it would claim a content model for `todo`.
    const scalar: ContentFormat = 'marker'
    expect(descriptionForEditing('todo', scalar)).toBe('todo')
  })
})
