/**
 * The four states, drawn — SPEC §13.6.
 *
 * The one that matters is that **detached does not look like unanchored**. They
 * mean opposite things and render identically if nobody stops them, so the
 * assertions here are mostly about what each state says rather than that it
 * renders at all.
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import {
  blockIds,
  markerTextToBlockDocument,
  resolveBlockAnchor,
  serializeBlockDocument,
} from '@estiva-app/protocol'
import { BlockAnchorNote } from './BlockAnchorNote'

const document = markerTextToBlockDocument('# Title\n\nthe paragraph in question\n\nanother')
const body = serializeBlockDocument(document)
const [, paragraphId] = blockIds(document)

const show = (anchor: Parameters<typeof BlockAnchorNote>[0]['anchor']) =>
  render(<BlockAnchorNote anchor={anchor} />).container

describe('BlockAnchorNote', () => {
  it('draws nothing for a comment about the whole object', () => {
    expect(show(resolveBlockAnchor(undefined, body, 'blocks')).textContent).toBe('')
    expect(show(undefined).textContent).toBe('')
  })

  it('quotes what a resolved anchor points at', () => {
    const c = show(resolveBlockAnchor(paragraphId, body, 'blocks'))
    expect(c.querySelector('[data-anchor="resolved"]')).not.toBeNull()
    expect(c.textContent).toContain('the paragraph in question')
  })

  it('says a detached anchor is detached, rather than saying nothing', () => {
    // The defect §13.6 exists to prevent. Rendering nothing here turns "about a
    // deleted paragraph" into "about the issue", silently.
    const edited = serializeBlockDocument(
      markerTextToBlockDocument('# Title\n\nanother', document),
    )
    const c = show(resolveBlockAnchor(paragraphId, edited, 'blocks'))
    expect(c.querySelector('[data-anchor="detached"]')).not.toBeNull()
    expect(c.textContent).toContain('deleted')
    expect(c.textContent).not.toBe('')
  })

  it('words unaddressable differently, because nothing was deleted', () => {
    // Marker text never had parts (§13.1). Telling somebody a paragraph was
    // removed when none existed is wrong twice.
    const c = show(resolveBlockAnchor(paragraphId, 'plain description', 'marker'))
    expect(c.querySelector('[data-anchor="unaddressable"]')).not.toBeNull()
    expect(c.textContent).not.toContain('deleted')
    expect(c.textContent).toContain('no longer written in parts')
  })

  it('never renders the two failures identically', () => {
    const edited = serializeBlockDocument(markerTextToBlockDocument('# Title', document))
    const detached = show(resolveBlockAnchor(paragraphId, edited, 'blocks')).textContent
    const unaddressable = show(resolveBlockAnchor(paragraphId, 'plain', 'marker')).textContent
    expect(detached).not.toBe(unaddressable)
    expect(detached).not.toBe('')
    expect(unaddressable).not.toBe('')
  })
})
