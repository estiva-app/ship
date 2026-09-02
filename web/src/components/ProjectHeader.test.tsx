/**
 * The project description is drawn, not spelled out.
 *
 * This file exists because the first cut of RIC-6 wired `IssueView` and not
 * this one, every suite passed, and the surface holding the **longest** real
 * description in the workspace — 6,446 characters of headings, lists and code
 * spans — still rendered every marker as a character. Nothing failed; it was
 * only visible by opening the page.
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { ProjectHeader } from './ProjectHeader'

const show = (description: string, format: 'marker' | 'blocks' | 'unknown' = 'marker') =>
  render(
    <ProjectHeader
      title="Relay Migration"
      description={description}
      descriptionFormat={format}
      onRename={vi.fn(() => true)}
      onDescribe={vi.fn(() => true)}
    />,
  ).container

describe('ProjectHeader draws its description', () => {
  it('renders structure as elements', () => {
    const c = show('# Heading\n\n- one\n- two\n\nand `code`')
    expect(c.querySelector('.text-h3, .text-h4')).not.toBeNull()
    expect(c.querySelectorAll('li')).toHaveLength(2)
    expect(c.querySelector('code')?.textContent).toBe('code')
  })

  it('leaves no marker as a literal character', () => {
    const c = show('a **bold** word and a # not-heading')
    expect(c.textContent).toContain('bold')
    expect(c.textContent).not.toContain('**')
  })

  it('still shows the placeholder when there is no description', () => {
    expect(show('').textContent).toContain('Add a description…')
  })

  it('renders an unknown format as plain text rather than guessing', () => {
    const body = '{"type":"doc","content":[]}'
    expect(show(body, 'unknown').textContent).toContain(body)
  })

  it('does not interpret markup in a description', () => {
    const c = show('<b>not bold</b>')
    expect(c.querySelector('b')).toBeNull()
    expect(c.textContent).toContain('<b>not bold</b>')
  })
})
