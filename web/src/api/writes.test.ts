import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./store', () => ({
  store: {
    createProject: vi.fn(),
    createIssue: vi.fn(),
    setField: vi.fn(),
    archiveProject: vi.fn(),
    deleteProject: vi.fn(),
    linkProjectFolder: vi.fn(),
    postMessage: vi.fn(),
  },
}))
vi.mock('./clock', () => ({ clockProblem: vi.fn() }))

import { clockProblem } from './clock'
import { store } from './store'
import { archiveProject, createIssue, createProject, deleteProject, explainRejection, pairProjectFolder, reply, setIssueField, setProjectField, startConversation } from './writes'

const s = store as unknown as Record<string, ReturnType<typeof vi.fn>>
const PK = 'ab'.repeat(32)
const PROJECT = { addr: `30850:${PK}:1`, id: '1', author: PK, createdAt: 1, title: 'Relay Migration', description: '', contentFolder: 'content-folder', originFolder: 'origin-folder', status: 'planned', archived: false, fields: {} }
const ISSUE = { addr: `30851:${PK}:2`, id: '2', author: PK, createdAt: 1, title: 'I', description: '', folder: 'issue-folder', projectAddr: PROJECT.addr, ref: 'REL-2', status: 'todo', fields: {} }

beforeEach(() => {
  vi.mocked(clockProblem).mockResolvedValue(null)
  for (const fn of Object.values(s)) fn.mockReset()
})

describe('the clock is checked before anything is signed', () => {
  it('refuses every write with the clock sentence, and calls nothing', async () => {
    vi.mocked(clockProblem).mockResolvedValue('clock is off')
    expect(await setIssueField(ISSUE, 'status', 'done', 'Status → done')).toEqual({ ok: false, reason: 'clock is off' })
    expect(await createProject({ title: 'X', description: '' })).toEqual({ ok: false, reason: 'clock is off' })
    expect(await createIssue(PROJECT, [], { title: 'X', description: '' })).toEqual({ ok: false, reason: 'clock is off' })
    expect(await pairProjectFolder(PROJECT, 'f')).toEqual({ ok: false, reason: 'clock is off' })
    expect(s.setField).not.toHaveBeenCalled()
    expect(s.createProject).not.toHaveBeenCalled()
    expect(s.createIssue).not.toHaveBeenCalled()
    expect(s.linkProjectFolder).not.toHaveBeenCalled()
  })
})

describe('accepted is authoritative — only ok is read', () => {
  it('a rejection the relay answered with 200 is a failure with its reason', async () => {
    s.setField.mockResolvedValue({ ok: false, reason: 'not a channel member' })
    expect(await setIssueField(ISSUE, 'status', 'done', 'Status → done')).toEqual({ ok: false, reason: 'not a channel member' })
  })

  it('a thrown request is a failure with its message, never a success', async () => {
    s.setField.mockRejectedValue(new Error('network down'))
    expect(await setIssueField(ISSUE, 'assignee', 'k', 'Assign')).toEqual({ ok: false, reason: 'network down' })
  })

  it('a duplicate the relay already held is fine', async () => {
    s.setField.mockResolvedValue({ ok: true, duplicate: true })
    expect(await setIssueField(ISSUE, 'status', 'done', 'x')).toEqual({ ok: true })
  })
})

describe('which Folder each write goes to', () => {
  it("an issue's field change goes to the issue's own Folder", async () => {
    s.setField.mockResolvedValue({ ok: true })
    await setIssueField(ISSUE, 'status', 'in_progress', 'Status → in_progress')
    expect(s.setField).toHaveBeenCalledWith({ folder: 'issue-folder', target: ISSUE.addr, field: 'status', value: 'in_progress', note: 'Status → in_progress' })
  })

  it("a project's record change, archive and delete go to the Folder the record names", async () => {
    s.setField.mockResolvedValue({ ok: true })
    s.archiveProject.mockResolvedValue({ ok: true })
    s.deleteProject.mockResolvedValue({ ok: true })
    await setProjectField(PROJECT, 'lead', 'k', 'Assign project')
    expect(s.setField).toHaveBeenCalledWith({ folder: 'origin-folder', target: PROJECT.addr, field: 'lead', value: 'k', note: 'Assign project' })
    await archiveProject(PROJECT, true)
    expect(s.archiveProject).toHaveBeenCalledWith({ recordFolder: 'origin-folder', project: PROJECT.addr, archived: true })
    await deleteProject(PROJECT)
    expect(s.deleteProject).toHaveBeenCalledWith({ recordFolder: 'origin-folder', project: PROJECT.addr })
  })

  it("a new issue goes to the project's content Folder with the next ref among what is visible", async () => {
    s.createIssue.mockResolvedValue({ result: { ok: true }, addr: '30851:me:new', id: 'new' })
    const result = await createIssue(PROJECT, [ISSUE, { ...ISSUE, ref: 'REL-7' }, { ...ISSUE, ref: 'DES-9' }], { title: 'New', description: 'd' })
    expect(s.createIssue).toHaveBeenCalledWith({ folder: 'content-folder', title: 'New', description: 'd', projectAddr: PROJECT.addr, ref: 'REL-8' })
    expect(result).toEqual({ ok: true, addr: '30851:me:new' })
  })
})

describe('conversations', () => {
  it('a new thread about an issue carries the nostr:naddr reference; about a project it does not', async () => {
    s.postMessage.mockResolvedValue({ ok: true })
    await startConversation({ folder: 'issue-folder', about: ISSUE.addr, withReference: true, body: 'hi' })
    expect(s.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ folder: 'issue-folder', body: 'hi', about: ISSUE.addr, aboutRef: expect.stringMatching(/^nostr:naddr1/) }))
    await startConversation({ folder: 'content-folder', about: PROJECT.addr, withReference: false, body: 'hi' })
    expect(s.postMessage).toHaveBeenLastCalledWith({ folder: 'content-folder', body: 'hi', about: PROJECT.addr, aboutRef: undefined })
  })

  it("a reply goes to the thread's own Folder, anchored to its root", async () => {
    s.postMessage.mockResolvedValue({ ok: true })
    const conversation = { id: 'root-id', root: { id: 'root-id', author: 'a', createdAt: 1, body: 'x', folder: 'thread-folder', about: [] }, replies: [], about: [], createdAt: 1, lastAt: 1 }
    await reply(conversation, 'fallback', 'yes')
    expect(s.postMessage).toHaveBeenCalledWith({ folder: 'thread-folder', body: 'yes', replyTo: { rootId: 'root-id', parentId: 'root-id' } })
    await reply({ ...conversation, root: { ...conversation.root, folder: '' } }, 'fallback', 'yes')
    expect(s.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ folder: 'fallback' }))
  })
})

describe('pairing and its explanation', () => {
  it('names the likely cause when the relay does not know the Folder', async () => {
    s.linkProjectFolder.mockResolvedValue({ ok: false, reason: 'not a channel member' })
    const result = await pairProjectFolder(PROJECT, '11111111-2222-4333-8444-555555555555')
    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ reason: expect.stringContaining('has not been published yet') })
    expect(explainRejection('something else', 'f')).toBe('something else')
  })

  it('reports the announcement separately from the link', async () => {
    s.linkProjectFolder.mockResolvedValue({ ok: true, announced: false, announceReason: 'refused' })
    expect(await pairProjectFolder(PROJECT, 'f')).toEqual({ ok: true, announced: false, announceReason: 'refused' })
  })

  it('a project created in a pasted Folder gets the same explanation on rejection', async () => {
    s.createProject.mockResolvedValue({ result: { ok: false, reason: 'not a channel member' }, addr: 'a', id: 'i', folder: 'f' })
    const result = await createProject({ title: 'X', description: '', folder: '11111111-2222-4333-8444-555555555555' })
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('has not been published yet') })
  })
})
