/**
 * The file's fields between the summary and the description, and the title at a document's heading size, 26px
 * (ONE-6, step 4b; Katerina, 1 November: as Leaf draws a Ship file): in the moment before the editors arrive and
 * after they have, so nothing moves when they land.
 *
 * Its own file because the first test must run before the editors' chunk has loaded: once a file has loaded it, a
 * render never shows the reading surface again.
 */
import { describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { stubLayout } from '@/test/inlineText'
import { LiveHeader } from './LiveHeader'

const SUMMARY = 'Columns come back in the order they were made.'
const follows = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

const header = () => (
  <LiveHeader
    title="Board columns out of order"
    titlePlaceholder="Untitled issue"
    onRename={vi.fn(() => true)}
    summary={SUMMARY}
    onSummarize={vi.fn(async () => true as const)}
    description="The board draws its columns in the wrong order."
    format="marker"
    onDescribe={vi.fn(() => true)}
    fields={<div data-testid="fields" />}
  />
)

describe('LiveHeader, the fields and the title (ONE-6, step 4b)', () => {
  stubLayout()

  it('before the editors arrive: the fields between the summary and the description, the title the h1 at 26px', () => {
    render(header())
    const description = document.querySelector('[data-description="reading"]')
    expect(description).not.toBeNull()
    const fields = screen.getByTestId('fields')
    expect(follows(screen.getByText(SUMMARY), fields)).toBe(true)
    expect(follows(fields, description!)).toBe(true)
    expect(screen.getByRole('heading', { level: 1 }).className).toMatch(/\btext-h1\b/)
    cleanup()
  })

  it('once they have: the same order, and the title being written is the h1 at 26px', async () => {
    render(header())
    const description = await screen.findByRole('textbox', { name: 'Description' }, { timeout: 5000 })
    const fields = screen.getByTestId('fields')
    expect(follows(screen.getByRole('textbox', { name: 'Summary' }), fields)).toBe(true)
    expect(follows(fields, description)).toBe(true)
    const title = screen.getByRole('textbox', { name: 'Title' })
    expect(title.closest('h1')).not.toBeNull()
    expect(title.closest('.text-h1')).not.toBeNull()
  })
})
