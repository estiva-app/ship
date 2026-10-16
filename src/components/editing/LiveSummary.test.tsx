/**
 * A writer's page draws a reading header first and swaps in the editors when
 * their chunk arrives. The summary in that first header must not take typing:
 * the swap would drop it (SUM-4 review). It waits — drawn as the field will be,
 * not clickable — and becomes the field once the editors are there.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

describe('the summary before the editors arrive', () => {
  it('is not clickable until the editors are there, then it is', async () => {
    // A fresh module, so its lazy editors have not loaded in an earlier test.
    vi.resetModules()
    const { LiveHeader } = await import('./LiveHeader')
    render(
      <LiveHeader
        title="Relay Migration"
        titlePlaceholder="Untitled"
        onRename={vi.fn(() => true)}
        summary="Every read and write on the relay."
        onSummarize={vi.fn(async () => true as const)}
        description="The plan."
        format="marker"
        onDescribe={vi.fn(() => true)}
      />,
    )
    expect(screen.queryByText('Every read and write on the relay.')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit summary' })).toBeNull()
    await screen.findByRole('textbox', { name: 'Description' })
    expect(screen.queryByRole('button', { name: 'Edit summary' })?.textContent).toBe('Every read and write on the relay.')
  })
})
