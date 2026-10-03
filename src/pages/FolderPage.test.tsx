/**
 * The folder view — RFC 0.4 §4 and §5, narrowed by RFC 0.5 §10.7.
 *
 * Two claims. The read is generic: a Ship project arrives through its owner's
 * declared widget the same way a stranger's record would, and drawing it
 * proves nothing about 30850 in particular. And the *tree* is Ship's own —
 * navigation is by kind — so a topic, or a kind nobody here has heard of, is
 * counted rather than listed, and a folder of only such files never reads as
 * empty.
 *
 * The fixtures still include a kind neither app designed for, and now it is
 * there to pin the *other* side: "not mine" has no list of kinds in it.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FolderPage } from './FolderPage'

// The rename's write and the sidebar's listing: what is under test is which Folder, which name and which `hasState` they get.
const renameFolder = vi.fn()
const reloadFolders = vi.fn(async () => {})
vi.mock('@/api', () => ({ renameFolder: (...args: unknown[]) => renameFolder(...args), me: 'a'.repeat(64) }))
vi.mock('@/api/useFolders', () => ({ reloadFolders: () => reloadFolders() }))
const say = vi.fn()

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
  // The viewer administers it, so it is offered the rename and Archive (MAN-17).
  admins: ['a'.repeat(64)],
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
    render(<FolderPage id="f1" say={say} />)
    await waitFor(() => expect(screen.getByText('This folder could not be read.')).toBeInTheDocument())
  })

  it('lists a project and an issue as peers, and counts a topic beside them rather than listing it', async () => {
    readFolder.mockResolvedValue(
      folder({
        files: [
          file({ ref: 'p', kind: 30850, appName: 'Estiva Ship', slots: { title: { value: 'Onboarding work' } } }),
          file({ ref: 't', kind: 30840, appName: 'File', slots: { title: { value: 'Design review' } } }),
          file({ ref: 'i', kind: 30851, appName: 'Estiva Ship', slots: { title: { value: 'Broken link' } } }),
        ],
      }),
    )
    render(<FolderPage id="f1" say={say} />)
    await waitFor(() => expect(screen.getByText('Onboarding work')).toBeInTheDocument())
    expect(screen.getByText('Broken link')).toBeInTheDocument()
    // Navigation is by kind (§10.7): the topic is not a peer in Ship's tree —
    // it is counted, and the count says where it is listed.
    expect(screen.queryByText('Design review')).not.toBeInTheDocument()
    expect(document.querySelectorAll('[data-foreign-object]')).toHaveLength(2)
    expect(screen.getByText('2 files · 1 other file, listed in Peek')).toBeInTheDocument()
  })

  it('a folder holding only other apps’ files says how many, and never reads as empty', async () => {
    // The case the ticket names: four topics and no projects. A blank list
    // here would be a lie, and "Nothing in this folder yet" a worse one.
    readFolder.mockResolvedValue(
      folder({
        files: [1, 2, 3, 4].map((n) => file({ ref: `t${n}`, kind: 30840, appName: 'File', slots: { title: { value: `Topic ${n}` } } })),
      }),
    )
    render(<FolderPage id="f1" say={say} />)
    await waitFor(() => expect(screen.getByText('No projects or issues here · 4 other files, listed in Peek')).toBeInTheDocument())
    expect(screen.queryByText('Nothing in this folder yet.')).not.toBeInTheDocument()
    expect(document.querySelectorAll('[data-foreign-object]')).toHaveLength(0)
  })

  it('a kind neither app designed for is "not mine" too — counted, not special-cased', async () => {
    // There is no list of kinds to hide. `tideboard` belongs to an app nobody
    // here has heard of, and it is treated exactly as a topic is.
    readFolder.mockResolvedValue(
      folder({
        files: [
          file({ ref: 'p', kind: 30850, appName: 'Estiva Ship', slots: { title: { value: 'Onboarding work' } } }),
          file({ ref: 'x', kind: 30911, appName: 'Tide table', widget: ['tideboard', 'card'], slots: { title: { value: 'Spring tides' } } }),
        ],
      }),
    )
    render(<FolderPage id="f1" say={say} />)
    await waitFor(() => expect(screen.getByText('Onboarding work')).toBeInTheDocument())
    expect(screen.queryByText('Spring tides')).not.toBeInTheDocument()
    expect(screen.getByText('1 file · 1 other file, listed in Peek')).toBeInTheDocument()
  })

  it('says so when the list came from channel containment rather than folder state', async () => {
    // The visible symptom of the approximation is a short list; without this
    // line nothing on screen would say why a topic is missing.
    readFolder.mockResolvedValue(folder({ hasState: false, source: 'channel' }))
    render(<FolderPage id="f1" say={say} />)
    await waitFor(() => expect(screen.getByText(/no folder state yet/)).toBeInTheDocument())
  })

  it('an empty folder says so rather than rendering nothing', async () => {
    readFolder.mockResolvedValue(folder({ files: [] }))
    render(<FolderPage id="f1" say={say} />)
    await waitFor(() => expect(screen.getByText('Nothing in this folder yet.')).toBeInTheDocument())
  })
})

describe('FolderPage renames its Folder (FOL-8)', () => {
  beforeEach(() => {
    renameFolder.mockReset()
    reloadFolders.mockClear()
    readFolder.mockReset()
    say.mockReset()
  })

  const rename = async (to: string) => {
    fireEvent.click(await screen.findByRole('button', { name: 'Edit folder name' }))
    const field = screen.getByRole('textbox', { name: 'Folder name' })
    fireEvent.change(field, { target: { value: to } })
    fireEvent.keyDown(field, { key: 'Enter' })
  }

  it('writes the new name, then shows what the relay holds', async () => {
    readFolder.mockResolvedValueOnce(folder()).mockResolvedValueOnce(folder({ name: 'Onboarding 2' }))
    renameFolder.mockResolvedValue({ ok: true })
    render(<FolderPage id="f1" say={say} />)
    expect(await screen.findByRole('heading', { name: 'Onboarding' })).toBeInTheDocument()
    await rename('Onboarding 2')
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Onboarding 2' })).toBeInTheDocument())
    // The channel's name is the title's only home (SPEC §3.2, MAN-17): nothing to read before the write.
    expect(renameFolder).toHaveBeenCalledWith({ id: 'f1' }, 'Onboarding 2')
    // Read again after it, for the name, and the sidebar's listing.
    expect(readFolder).toHaveBeenCalledTimes(2)
    expect(reloadFolders).toHaveBeenCalledTimes(1)
  })

  it('an accepted rename that cannot be read back says so rather than showing the old name as though nothing happened', async () => {
    readFolder
      .mockResolvedValueOnce(folder())
      .mockImplementationOnce(() => new Promise((_resolve, reject) => setTimeout(() => reject(new Error('rate-limited')), 0)))
    renameFolder.mockResolvedValue({ ok: true })
    render(<FolderPage id="f1" say={say} />)
    await rename('Onboarding 2')
    await waitFor(() => expect(say).toHaveBeenCalledWith('Renamed to Onboarding 2, but the folder could not be read back — reload to see it.', 'error'))
  })

  it('a refusal is said with its reason, the field stays open, and nothing is re-read', async () => {
    readFolder.mockResolvedValue(folder())
    renameFolder.mockResolvedValue({ ok: false, reason: 'restricted: not an admin' })
    render(<FolderPage id="f1" say={say} />)
    await rename('Nope')
    await waitFor(() => expect(say).toHaveBeenCalledWith('Rename rejected — restricted: not an admin', 'error'))
    expect(screen.getByRole('textbox', { name: 'Folder name' })).toBeInTheDocument()
    expect(reloadFolders).not.toHaveBeenCalled()
  })

  it('an empty name is refused before anything is sent', async () => {
    readFolder.mockResolvedValue(folder())
    render(<FolderPage id="f1" say={say} />)
    await rename('   ')
    await waitFor(() => expect(say).toHaveBeenCalledWith('A folder needs a name.', 'error'))
    expect(renameFolder).not.toHaveBeenCalled()
  })
})

// SPEC §3.2: every reader ignores an archive from anybody but the Folder's owners and admins (MAN-17).
describe('FolderPage offers Archive only to the Folder’s owners and admins', () => {
  const channel = `39000:${'f'.repeat(64)}:f1`

  it('not to a member', async () => {
    readFolder.mockResolvedValue(folder({ channel, admins: ['b'.repeat(64)] }))
    render(<FolderPage id="f1" say={say} />)
    expect(await screen.findByRole('heading', { name: 'Onboarding' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archive folder' })).not.toBeInTheDocument()
    // The relay refuses a member's rename too, so the title is not editable.
    expect(screen.queryByRole('button', { name: 'Edit folder name' })).not.toBeInTheDocument()
  })

  it('to an admin', async () => {
    readFolder.mockResolvedValue(folder({ channel, admins: ['a'.repeat(64)] }))
    render(<FolderPage id="f1" say={say} />)
    expect(await screen.findByRole('button', { name: 'Archive folder' })).toBeInTheDocument()
  })
})
