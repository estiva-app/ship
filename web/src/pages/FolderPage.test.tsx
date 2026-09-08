/**
 * The folder view — RFC 0.4 §4 and §5.
 *
 * The claim worth pinning is not that Ship can draw a project. It is that Ship
 * draws a Folder's contents **without knowing what they are**: a Ship project,
 * a Peek topic and a record from an app nobody here has heard of come out as
 * peers, each through its owner's declared widget.
 *
 * So the fixtures below include a kind neither app designed for. If this file
 * only ever tested 30850 and 39000 it would be testing an integration.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FolderPage } from './FolderPage'

/*
  `pickWidget` comes straight from the runtime rather than through the real
  `@/api/foreign`, which re-exports it beside the relay client. The widget
  chain is load-bearing here — one test below turns on it — so it has to be the
  real implementation; the transport does not.
*/
const readFolder = vi.fn()
vi.mock('@/api/foreign', async () => ({
  pickWidget: (await vi.importActual<typeof import('@estiva-app/interop')>('@estiva-app/interop')).pickWidget,
  readFolder: (id: string) => readFolder(id),
}))

const file = (over: Partial<Record<string, unknown>> = {}) => ({
  ref: 'r',
  address: 'a',
  eventId: 'e',
  kind: 30850,
  widget: 'card',
  appName: 'Estiva Ship',
  slots: { title: { value: 'A project' } },
  meta: [],
  comments: [],
  actions: [],
  viaRecommendation: true,
  ...over,
})

const folder = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'f1',
  name: 'Onboarding',
  hasState: true,
  source: 'state',
  files: [file()],
  ...over,
})

describe('FolderPage', () => {
  it('a folder that cannot be read says so', async () => {
    /*
      Rejects on a later tick rather than at creation.

      An already-rejected promise settles before React runs the effect that
      awaits it, and the runner reports that as an unhandled rejection — failing
      the test even though the page handles it correctly. A fact about the
      runner, not about this component: it behaves identically either way in a
      browser.
    */
    readFolder.mockImplementation(
      () => new Promise((_resolve, reject) => setTimeout(() => reject(new Error('nope')), 0)),
    )
    render(<FolderPage id="f1" />)
    await waitFor(() => expect(screen.getByText('This folder could not be read.')).toBeInTheDocument())
  })

  it('lists a Ship project and a Peek topic as peers, each named by its own app', async () => {
    readFolder.mockResolvedValue(
      folder({
        files: [
          file({ ref: 'p', kind: 30850, appName: 'Estiva Ship', slots: { title: { value: 'Onboarding work' } } }),
          file({ ref: 't', kind: 39000, appName: 'Peek', slots: { title: { value: 'Design review' } } }),
        ],
      }),
    )
    render(<FolderPage id="f1" />)
    await waitFor(() => expect(screen.getByText('Onboarding work')).toBeInTheDocument())
    expect(screen.getByText('Design review')).toBeInTheDocument()
    // Peers: two rows at the same level, neither reached by expanding the other.
    expect(document.querySelectorAll('[data-foreign-object]')).toHaveLength(2)
    expect(screen.getByText('2 files')).toBeInTheDocument()
  })

  it('draws a kind neither app designed for, through the fallback chain', async () => {
    // `tideboard` is a widget this consumer has never heard of. RFC 0.4 §13.3
    // closes every chain in card/row/table/stat, so there is always something
    // left to draw — and drawing nothing is the failure PEE-10 named.
    readFolder.mockResolvedValue(
      folder({
        files: [
          file({ ref: 'x', kind: 30911, appName: 'Tide table', widget: ['tideboard', 'card'], slots: { title: { value: 'Spring tides' } } }),
        ],
      }),
    )
    render(<FolderPage id="f1" />)
    await waitFor(() => expect(screen.getByText('Spring tides')).toBeInTheDocument())
    expect(document.querySelector('[data-widget="card"]')).toBeTruthy()
  })

  it('says so when the list came from channel containment rather than folder state', async () => {
    // The visible symptom of the approximation is a short list; without this
    // line nothing on screen would say why a topic is missing.
    readFolder.mockResolvedValue(folder({ hasState: false, source: 'channel' }))
    render(<FolderPage id="f1" />)
    await waitFor(() => expect(screen.getByText(/no folder state yet/)).toBeInTheDocument())
  })

  it('an empty folder says so rather than rendering nothing', async () => {
    readFolder.mockResolvedValue(folder({ files: [] }))
    render(<FolderPage id="f1" />)
    await waitFor(() => expect(screen.getByText('Nothing in this folder yet.')).toBeInTheDocument())
  })
})
