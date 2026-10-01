import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Handoff } from '@/api/handoff'
import type { ForeignObject } from '@/api/foreign'

let answer: Handoff | 'failed' | undefined
vi.mock('@/api/handoff', () => ({ useHandoff: () => answer }))

const { HandoffPage } = await import('./HandoffPage')

const TOPIC: ForeignObject = {
  ref: '30840:pk:d',
  eventId: 'e'.repeat(64),
  kind: 30840,
  widget: 'card',
  appName: 'Peek',
  openUrl: 'https://peek.estiva.app/o/naddr1topic',
  slots: { title: { value: 'Who will extract the conversation package' } },
  meta: [],
  comments: [],
  actions: [],
  viaRecommendation: true,
}

describe('HandoffPage', () => {
  it('draws another app’s file and the link that opens it there', () => {
    // The projection names the app "File" for a bare topic; the owner's name is what the link says.
    answer = { state: 'found', object: { ...TOPIC, appName: 'File' }, app: 'Peek', openUrl: 'https://peek.estiva.app/o/naddr1topic' }
    render(<HandoffPage word="topic" fileRef="x-d" />)
    expect(screen.getByText('Who will extract the conversation package')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in Peek' })).toHaveAttribute('href', 'https://peek.estiva.app/o/naddr1topic')
  })

  it('says nothing was found, and why that may be, rather than a blank page', () => {
    answer = { state: 'missing' }
    render(<HandoffPage word="topic" fileRef="x-d" />)
    expect(screen.getByText(/Nothing found at this link/)).toBeInTheDocument()
  })

  it('says a read that failed failed', () => {
    answer = 'failed'
    render(<HandoffPage word="topic" fileRef="x-d" />)
    expect(screen.getByText(/could not be read/)).toBeInTheDocument()
  })
})
