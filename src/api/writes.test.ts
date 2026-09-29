import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./store', () => ({
  store: {
    createProject: vi.fn(),
    createIssue: vi.fn(),
    setField: vi.fn(),
    archiveProject: vi.fn(),
    deleteProject: vi.fn(),
    moveProject: vi.fn(),
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    linkProjectFolder: vi.fn(),
    postMessage: vi.fn(),
  },
}))
vi.mock('./clock', () => ({ clockProblem: vi.fn() }))
vi.mock('./foreign', () => ({ readFolders: vi.fn() }))

import { clockProblem } from './clock'
import { readFolders } from './foreign'
import { store } from './store'
import { archiveProject, createFolder, createIssue, createProject, deleteProject, moveProject, renameFolder, reply, setIssueField, setProjectField, startConversation } from './writes'

const s = store as unknown as Record<string, ReturnType<typeof vi.fn>>
const PK = 'ab'.repeat(32)
const PROJECT = { addr: `30850:${PK}:1`, id: '1', author: PK, createdAt: 1, title: 'Relay Migration', description: '', descriptionFormat: 'marker' as const, contentFolder: 'content-folder', originFolder: 'origin-folder', status: 'planned', archived: false, fields: {} }
const TEAM = { folder: '3167adea-877f-43c4-96fb-517a2b2d5d24', hasState: true }
const ISSUE = { addr: `30851:${PK}:2`, id: '2', author: PK, createdAt: 1, title: 'I', description: '', descriptionFormat: 'marker' as const, folder: 'issue-folder', projectAddr: PROJECT.addr, ref: 'REL-2', status: 'todo', fields: {} }

beforeEach(() => {
  vi.mocked(clockProblem).mockResolvedValue(null)
  for (const fn of Object.values(s)) fn.mockReset()
  vi.mocked(readFolders).mockReset().mockResolvedValue([])
})

describe('the clock is checked before anything is signed', () => {
  it('refuses every write with the clock sentence, and calls nothing', async () => {
    vi.mocked(clockProblem).mockResolvedValue('clock is off')
    expect(await setIssueField(ISSUE, 'status', 'done', 'Status → done')).toEqual({ ok: false, reason: 'clock is off' })
    expect(await createProject({ title: 'X', description: '', team: TEAM })).toEqual({ ok: false, reason: 'clock is off' })
    expect(await createIssue(PROJECT, [], { title: 'X', description: '' })).toEqual({ ok: false, reason: 'clock is off' })
    expect(s.setField).not.toHaveBeenCalled()
    expect(s.createProject).not.toHaveBeenCalled()
    expect(s.createIssue).not.toHaveBeenCalled()
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
    s.deleteProject.mockResolvedValue({ result: { ok: true } })
    await setProjectField(PROJECT, 'lead', 'k', 'Assign project')
    expect(s.setField).toHaveBeenCalledWith({ folder: 'origin-folder', target: PROJECT.addr, field: 'lead', value: 'k', note: 'Assign project' })
    await archiveProject(PROJECT, true)
    expect(s.archiveProject).toHaveBeenCalledWith({ recordFolder: 'origin-folder', project: PROJECT.addr, archived: true })
    await deleteProject(PROJECT, [{ id: 'content-folder', hasState: true }])
    expect(s.deleteProject).toHaveBeenCalledWith({ recordFolder: 'origin-folder', project: PROJECT.addr, folders: [{ folder: 'content-folder', hasState: true }] })
  })
})

describe('deleting a project unlists it from its team (FOL-48)', () => {
  it("takes hasState from the caller's Folder read, without reading again", async () => {
    s.deleteProject.mockResolvedValue({ result: { ok: true }, unlisted: { ok: true } })
    expect(await deleteProject(PROJECT, [{ id: 'content-folder', hasState: true }])).toEqual({ ok: true })
    expect(readFolders).not.toHaveBeenCalled()
  })

  it('reads the Folders when the caller has none, or does not hold this one', async () => {
    s.deleteProject.mockResolvedValue({ result: { ok: true } })
    vi.mocked(readFolders).mockResolvedValue([{ id: 'content-folder', hasState: true }] as never)
    await deleteProject(PROJECT, undefined)
    await deleteProject(PROJECT, [{ id: 'another-team', hasState: true }])
    expect(readFolders).toHaveBeenCalledTimes(2)
    expect(s.deleteProject).toHaveBeenLastCalledWith(expect.objectContaining({ folders: [{ folder: 'content-folder', hasState: true }] }))
  })

  it('a moved project is unlisted from the Folders that list it, not its content Folder (FOL-7)', async () => {
    s.deleteProject.mockResolvedValue({ result: { ok: true }, unlisted: { ok: true } })
    const folders = [
      { id: 'content-folder', hasState: true, addresses: [] },
      { id: 'new-team', hasState: true, addresses: [PROJECT.addr] },
    ]
    expect(await deleteProject(PROJECT, folders)).toEqual({ ok: true })
    expect(s.deleteProject).toHaveBeenCalledWith(expect.objectContaining({ folders: [{ folder: 'new-team', hasState: true }] }))
    expect(readFolders).not.toHaveBeenCalled()
  })

  it('a moved project deleted before the caller has Folders is unlisted from what the fresh read lists it in', async () => {
    s.deleteProject.mockResolvedValue({ result: { ok: true }, unlisted: { ok: true } })
    vi.mocked(readFolders).mockResolvedValue([
      { id: 'content-folder', hasState: true, addresses: [] },
      { id: 'new-team', hasState: true, addresses: [PROJECT.addr] },
    ] as never)
    await deleteProject(PROJECT, undefined)
    expect(s.deleteProject).toHaveBeenCalledWith(expect.objectContaining({ folders: [{ folder: 'new-team', hasState: true }] }))
  })

  it('a Folder nobody can read has no state to change', async () => {
    s.deleteProject.mockResolvedValue({ result: { ok: true } })
    vi.mocked(readFolders).mockResolvedValue([])
    await deleteProject(PROJECT, [])
    expect(s.deleteProject).toHaveBeenCalledWith(expect.objectContaining({ folders: [{ folder: 'content-folder', hasState: false }] }))
  })

  it('a refused delete is refused, whatever the unlist did', async () => {
    s.deleteProject.mockResolvedValue({ result: { ok: false, reason: 'not the author' } })
    expect(await deleteProject(PROJECT, [])).toEqual({ ok: false, reason: 'not the author' })
  })

  it('a refused unlist is a deleted project that says why its row stays', async () => {
    s.deleteProject.mockResolvedValue({ result: { ok: true }, unlisted: { ok: false, reason: 'rate limited' } })
    expect(await deleteProject(PROJECT, [{ id: 'content-folder', hasState: true }])).toEqual({ ok: true, stillListed: 'rate limited' })
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

describe('creating a project', () => {
  it('a project is created in the team it names', async () => {
    s.createProject.mockResolvedValue({ result: { ok: true }, placed: { ok: true }, addr: 'a', id: 'i', folder: TEAM.folder })
    expect(await createProject({ title: 'X', description: '', team: TEAM })).toEqual({ ok: true, addr: 'a' })
    expect(s.createProject).toHaveBeenCalledWith({ title: 'X', description: '', team: TEAM })
  })

  it('a refused record is no project', async () => {
    s.createProject.mockResolvedValue({ result: { ok: false, reason: 'refused' }, addr: 'a', id: 'i', folder: TEAM.folder })
    expect(await createProject({ title: 'X', description: '', team: TEAM })).toEqual({ ok: false, reason: 'refused' })
  })

  it('a refused listing is a created project that says why Peek will not place it', async () => {
    s.createProject.mockResolvedValue({ result: { ok: true }, placed: { ok: false, reason: 'rate limited' }, addr: 'a', id: 'i', folder: TEAM.folder })
    expect(await createProject({ title: 'X', description: '', team: TEAM })).toEqual({ ok: true, addr: 'a', unlisted: 'rate limited' })
  })
})

describe('moving a project', () => {
  const FROM = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', hasState: true }
  const TO = { id: TEAM.folder, hasState: true }

  it('moves by address, from the Folders that list it, to the one chosen', async () => {
    s.moveProject.mockResolvedValue({ added: { ok: true }, removed: [{ folder: FROM.id, result: { ok: true } }] })
    expect(await moveProject(PROJECT, [FROM], TO)).toEqual({ ok: true })
    expect(s.moveProject).toHaveBeenCalledWith({ project: PROJECT.addr, from: [FROM], to: TO })
  })

  it('a move planned as unsafe is refused, saying why', async () => {
    s.moveProject.mockResolvedValue({ refused: 'target-has-no-state', removed: [] })
    expect(await moveProject(PROJECT, [FROM], TO)).toEqual({ ok: false, reason: expect.stringMatching(/no list of its own/) })
  })

  it('a refused add is a refused move', async () => {
    s.moveProject.mockResolvedValue({ added: { ok: false, reason: 'restricted: not a channel member' }, removed: [] })
    expect(await moveProject(PROJECT, [FROM], TO)).toEqual({ ok: false, reason: 'restricted: not a channel member' })
  })

  it('a refused remove is a move that says which Folder still lists it', async () => {
    s.moveProject.mockResolvedValue({ added: { ok: true }, removed: [{ folder: FROM.id, result: { ok: false, reason: 'rate limited' } }] })
    expect(await moveProject(PROJECT, [FROM], TO)).toEqual({ ok: true, stillIn: [{ folder: FROM.id, reason: 'rate limited' }] })
  })
})

describe('createFolder and renameFolder say what the relay did (FOL-8)', () => {
  const FOLDER = { id: '11111111-1111-4111-8111-111111111111', hasState: true }

  it('a created Folder resolves its id', async () => {
    s.createFolder.mockResolvedValue({ id: FOLDER.id, result: { ok: true } })
    expect(await createFolder('New')).toEqual({ ok: true, id: FOLDER.id })
  })

  it('a refused channel is no Folder at all', async () => {
    s.createFolder.mockResolvedValue({ id: FOLDER.id, refusedAt: 0, result: { ok: false, reason: 'restricted' } })
    expect(await createFolder('New')).toEqual({ ok: false, reason: 'restricted' })
  })

  it('a refused command is still a Folder — its id comes back, so it is opened rather than made twice', async () => {
    s.createFolder.mockResolvedValue({ id: FOLDER.id, refusedAt: 1, result: { ok: false, reason: 'rate limited' } })
    expect(await createFolder('New')).toEqual({ ok: true, id: FOLDER.id, unlisted: 'rate limited' })
  })

  it('a rename passes the Folder, the name and its hasState through', async () => {
    s.renameFolder.mockResolvedValue({ result: { ok: true } })
    expect(await renameFolder(FOLDER, 'Renamed')).toEqual({ ok: true })
    expect(s.renameFolder).toHaveBeenCalledWith({ folder: FOLDER.id, name: 'Renamed', hasState: true })
  })

  it('a refused channel rename is the relay’s reason; a refused command says the name did not change', async () => {
    s.renameFolder.mockResolvedValue({ refusedAt: 0, result: { ok: false, reason: 'restricted' } })
    expect(await renameFolder(FOLDER, 'Renamed')).toEqual({ ok: false, reason: 'restricted' })
    s.renameFolder.mockResolvedValue({ refusedAt: 1, result: { ok: false, reason: 'rate limited' } })
    expect(await renameFolder(FOLDER, 'Renamed')).toEqual({ ok: false, reason: "the channel was renamed but the folder's own name was not (rate limited)" })
  })
})
