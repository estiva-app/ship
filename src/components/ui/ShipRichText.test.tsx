/**
 * What a reader sees, and what a reader must never see.
 *
 * The parsing is `@estiva-app/protocol`'s and is tested there against 152 real
 * published bodies. What is Ship's, and therefore what is here, is the mapping
 * to DOM — including the part that matters most: **markup in a body stays
 * text**, because on a shared relay the body was written by someone else.
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ShipRichText } from './ShipRichText'

const show = (value: string, format: 'marker' | 'blocks' | 'unknown' = 'marker') =>
  render(<ShipRichText value={value} format={format} />).container

describe('marker descriptions, which is all 157 of them today', () => {
  it('draws headings, lists, quotes and fences as elements', () => {
    const c = show('# Title\n\n- one\n- two\n\n> quoted\n\n```ts\nconst a = 1\n```')
    expect(c.querySelector('ul')?.querySelectorAll('li')).toHaveLength(2)
    expect(c.querySelector('blockquote')?.textContent).toBe('quoted')
    expect(c.querySelector('pre')?.textContent).toBe('const a = 1')
    expect(c.textContent).toContain('Title')
  })

  it('draws marks, and code as code', () => {
    const c = show('a **bold** and `npm test`')
    expect(c.querySelector('code')?.textContent).toBe('npm test')
    expect(c.textContent).toBe('a bold and npm test')
  })

  it('keeps a table literal, because §13.2 has no table in the message dialect', () => {
    const c = show('| a | b |')
    expect(c.textContent).toBe('| a | b |')
    expect(c.querySelector('table')).toBeNull()
  })
})

describe('the body is untrusted, and stays text', () => {
  it('renders HTML in a description as characters, not elements', () => {
    const c = show('<script>alert(1)</script> and <b>not bold</b>')
    expect(c.querySelector('script')).toBeNull()
    expect(c.querySelector('b')).toBeNull()
    expect(c.textContent).toBe('<script>alert(1)</script> and <b>not bold</b>')
  })

  it('does not interpret markup inside a fence either', () => {
    const c = show('```\n<img src=x onerror=1>\n```')
    expect(c.querySelector('img')).toBeNull()
    expect(c.querySelector('pre')?.textContent).toBe('<img src=x onerror=1>')
  })
})

describe('block documents', () => {
  const doc = JSON.stringify({
    type: 'doc',
    content: [
      { type: 'heading', id: 'h1', attrs: { level: 1 }, content: [{ type: 'text', text: 'Spec' }] },
      { type: 'paragraph', id: 'p1', content: [{ type: 'text', text: 'bold', marks: [{ type: 'bold' }] }] },
      { type: 'timeline', id: 'x1', content: [{ type: 'text', text: 'from a later version' }] },
    ],
  })

  it('puts the block id in the DOM, which is what an anchor will need', () => {
    const c = show(doc, 'blocks')
    expect(c.querySelector('[data-block-id="p1"]')).not.toBeNull()
    expect(c.querySelector('[data-block-id="h1"]')).not.toBeNull()
  })

  it('draws an unknown block type rather than dropping it', () => {
    const c = show(doc, 'blocks')
    expect(c.textContent).toContain('from a later version')
    expect(c.querySelector('[data-block-type="timeline"]')).not.toBeNull()
  })

  it('gives a marker body no block ids at all', () => {
    expect(show('# Title').querySelector('[data-block-id]')).toBeNull()
  })
})

describe('the formats a reader must not guess at', () => {
  it('draws an unknown format as its own plain text', () => {
    const c = show('{"type":"doc","content":[]}', 'unknown')
    expect(c.textContent).toBe('{"type":"doc","content":[]}')
  })

  it('draws a legacy {-leading body as marker text', () => {
    // §13.4's own example: the tag said marker, so it is marker, however much
    // the body looks like JSON.
    const c = show('{"a":1} and **bold**', 'marker')
    expect(c.textContent).toBe('{"a":1} and bold')
  })

  it('shows a mis-tagged body rather than an empty field', () => {
    expect(show('not a document', 'blocks').textContent).toBe('not a document')
  })

  it('renders nothing for an empty description', () => {
    expect(show('').textContent).toBe('')
  })
})

describe('tables — §13.3, the one block the protocol names without naming its parts', () => {
  const cell = (type: string, id: string, text: string) => ({ type, id, content: [{ type: 'paragraph', id: `${id}p`, content: [{ type: 'text', text }] }] })
  const doc = JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'table',
        id: 't1',
        content: [
          { type: 'tableRow', id: 'r1', content: [cell('tableHeader', 'h1', 'Stage'), cell('tableHeader', 'h2', 'Who')] },
          { type: 'tableRow', id: 'r2', content: [cell('tableCell', 'c1', 'Cut-over'), cell('tableCell', 'c2', 'Ada')] },
        ],
      },
    ],
  })

  it('draws a real table, with the first row of header cells as its head', () => {
    const c = show(doc, 'blocks')
    expect(c.querySelectorAll('thead th')).toHaveLength(2)
    expect(c.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(c.querySelector('tbody td')?.textContent).toBe('Cut-over')
  })

  it('keeps every id, because a comment can be anchored to a cell', () => {
    const c = show(doc, 'blocks')
    expect(c.querySelector('table')?.getAttribute('data-block-id')).toBe('t1')
    expect(c.querySelector('tbody tr')?.getAttribute('data-block-id')).toBe('r2')
    expect(c.querySelector('tbody td')?.getAttribute('data-block-id')).toBe('c1')
  })

  it('has no head when the first row is ordinary cells', () => {
    const rows = JSON.stringify({
      type: 'doc',
      content: [{ type: 'table', id: 't1', content: [{ type: 'tableRow', id: 'r1', content: [cell('tableCell', 'c1', 'only')] }] }],
    })
    const c = show(rows, 'blocks')
    expect(c.querySelector('thead')).toBeNull()
    expect(c.querySelectorAll('tbody tr')).toHaveLength(1)
  })

  it('falls back to the text when the nesting is not one it knows', () => {
    // §13.3's rule for anything unrecognised: render it, never drop it.
    const odd = JSON.stringify({
      type: 'doc',
      content: [{ type: 'table', id: 't1', content: [{ type: 'text', text: 'a table written some other way' }] }],
    })
    const c = show(odd, 'blocks')
    expect(c.querySelector('table')).toBeNull()
    expect(c.textContent).toContain('a table written some other way')
  })
})
