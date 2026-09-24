/**
 * The project's own conversation — FOL-1, and RFC 0.5 §10.7 (a different file
 * is a different conversation).
 *
 * What is pinned: a project pointing at its team's Folder shows neither the
 * team's chat nor a sibling project's comments; its own comments show from
 * every Folder it has had; a legacy project keeps its record channel's talk
 * that names nothing; and the rule reads the root's tags, not a reply's and not
 * the body.
 */
import { describe, expect, it } from 'vitest'
import type { Conversation, Message } from '../../../src/fold'
import { ownConversations, recordChannel, type ConversationHome } from './ownConversation'

const RECORD = '85db5b59-9e49-4ea1-8e93-3d2a2d78c048'
const TEAM = '05bebd5b-b699-4bd4-af50-f5377df0fd67'
const PROJECT = '30850:pk:proj'
const SIBLING = '30850:pk:sibling'
const TOPIC = '30840:pk:topic'
const ISSUE = '30851:pk:issue'

/** Never relinked: record channel and content Folder are one. */
const legacy: ConversationHome = { addr: PROJECT, originFolder: RECORD, folders: [RECORD] }
/** Relinked to its team: `projectFolders` gives the record channel first, then the team. */
const underTeam: ConversationHome = { addr: PROJECT, originFolder: RECORD, folders: [RECORD, TEAM] }

const message = (id: string, over: Partial<Message> = {}): Message => ({ id, author: 'a', createdAt: 1, body: id, folder: RECORD, about: [], ...over })
const thread = (root: Message, replies: Message[] = []): Conversation => ({ id: root.id, root, replies, about: [], createdAt: 1, lastAt: 1 })
const ids = (conversations: Conversation[]) => conversations.map((c) => c.id)

const general = thread(message('general'))
const inTopic = thread(message('topic-root', { about: [TOPIC] }), [message('topic-reply', { about: [TOPIC], rootId: 'topic-root' })])
const onIssue = thread(message('issue-root', { about: [ISSUE] }))
const onProject = thread(message('project-root', { about: [PROJECT] }))
const teamChat = thread(message('team-chat', { folder: TEAM }))
const onProjectInTeam = thread(message('project-in-team', { folder: TEAM, about: [PROJECT] }))
const onSiblingInTeam = thread(message('sibling-in-team', { folder: TEAM, about: [SIBLING] }))
const elsewhere = thread(message('other-folder', { folder: 'other' }))
const onProjectElsewhere = thread(message('project-elsewhere', { folder: 'other', about: [PROJECT] }))
const anchors = {
  'topic-root': [TOPIC],
  'topic-reply': [TOPIC],
  'issue-root': [ISSUE],
  'project-root': [PROJECT],
  'project-in-team': [PROJECT],
  'sibling-in-team': [SIBLING],
  'project-elsewhere': [PROJECT],
}

describe('ownConversations — a project under its team', () => {
  it("does not show the team's chat — talk that names nothing is not this project's in a shared Folder", () => {
    expect(ownConversations([teamChat], underTeam, anchors)).toHaveLength(0)
  })

  it("does not show another project's comments filed in the same team Folder", () => {
    expect(ownConversations([onSiblingInTeam], underTeam, anchors)).toHaveLength(0)
  })

  it('shows its own comments from the team Folder and from the record channel it had before', () => {
    const all = [teamChat, onSiblingInTeam, onProjectInTeam, onProject, general]
    expect(ids(ownConversations(all, underTeam, anchors))).toEqual(['project-in-team', 'project-root', 'general'])
  })

  it('keeps the record channel’s talk that names nothing — that Folder was the project’s alone', () => {
    expect(ids(ownConversations([general], underTeam, anchors))).toEqual(['general'])
  })
})

describe('ownConversations — a project filed into its team (FOL-2)', () => {
  /** Its record names the team: no record channel of its own. */
  const filed: ConversationHome = { addr: PROJECT, originFolder: recordChannel(TEAM, [{ id: TEAM }]) ?? '', folders: [TEAM] }

  it('has no record channel — its origin Folder is a team', () => {
    expect(recordChannel(TEAM, [{ id: TEAM }])).toBeUndefined()
    expect(recordChannel(RECORD, [{ id: TEAM }])).toBe(RECORD)
  })

  it('has none until the teams are read, rather than taking a team for one', () => {
    expect(recordChannel(RECORD, undefined)).toBeUndefined()
  })

  it("shows its own comments and neither the team's chat nor a sibling's", () => {
    expect(ids(ownConversations([teamChat, onSiblingInTeam, onProjectInTeam], filed, anchors))).toEqual(['project-in-team'])
  })
})

describe('ownConversations — a legacy project', () => {
  it('keeps its record channel’s talk that names nothing — identity merges (CON-9)', () => {
    expect(ids(ownConversations([general], legacy, anchors))).toEqual(['general'])
  })

  it('a thread rooted at the project itself is its own', () => {
    expect(ids(ownConversations([onProject], legacy, anchors))).toEqual(['project-root'])
  })

  it("a topic's thread in the project's Folder is the topic's, not the project's", () => {
    expect(ids(ownConversations([general, inTopic], legacy, anchors))).toEqual(['general'])
  })

  it("an issue's thread is the issue's — the same rule, no kind named in it", () => {
    expect(ownConversations([onIssue], legacy, anchors)).toHaveLength(0)
  })
})

describe('ownConversations — what bounds it', () => {
  it('a Folder the project never pointed at is not read, anchored or not', () => {
    expect(ownConversations([elsewhere, onProjectElsewhere], underTeam, anchors)).toHaveLength(0)
  })

  it('a record with no Folder does not claim roots that carried no `h`', () => {
    const noH = thread(message('no-h', { folder: '' }))
    expect(ownConversations([noH], { addr: PROJECT, originFolder: '', folders: [TEAM] }, anchors)).toHaveLength(0)
  })

  it('a root naming the project and another file is not the project’s own', () => {
    const both = thread(message('both', { folder: TEAM, about: [PROJECT, TOPIC] }))
    expect(ownConversations([both], underTeam, { both: [PROJECT, TOPIC] })).toHaveLength(0)
  })

  it('the root’s tags decide — a reply naming a topic does not move the thread, and a body mention does not either', () => {
    const replyNames = thread(message('r'), [message('r2', { about: [TOPIC], rootId: 'r' })])
    const bodyMentions = thread(message('m', { about: [TOPIC] }))
    // `about` carries body mentions too; only the anchor index is the root's declaration.
    expect(ownConversations([replyNames, bodyMentions], legacy, { r2: [TOPIC] })).toHaveLength(2)
  })
})
