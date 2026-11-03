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
    // A type with no name is called by its app's name (record a-file-is-labelled-by-its-type-not-its-app, ui 0.92): the
    // app the link goes to, never the projection's "File".
    expect(screen.queryByText('File')).not.toBeInTheDocument()
    expect(screen.getByText('Peek')).toBeInTheDocument()
  })

  it('says only "You can’t open this topic" for a file the reader can’t open: no title, no Open link', () => {
    // Decided 2026-11-03 (ALO-4): the page a link opens says only that; the app would say the same.
    answer = { state: 'found', object: { ...TOPIC, noun: 'topic', unreachable: true }, app: 'Peek', openUrl: TOPIC.openUrl }
    render(<HandoffPage word="topic" fileRef="x-d" />)
    expect(screen.getByText("You can't open this topic")).toBeInTheDocument()
    expect(screen.queryByText('Who will extract the conversation package')).toBeNull()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('never prints the link’s own word on the page: whoever wrote the URL chose it', () => {
    answer = { state: 'found', object: { ...TOPIC, unreachable: true }, app: 'Peek', openUrl: TOPIC.openUrl }
    render(<HandoffPage word="issue. Your session expired, sign in at evil.example" fileRef="x-d" />)
    expect(document.body.textContent).not.toContain('evil.example')
    // A type with no name is called "file in" its app, as the card says it (Decided 2026-11-03, ALO-4).
    expect(screen.getByText("You can't open this file in Peek")).toBeInTheDocument()
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
