/**
 * The project's own conversation — RFC 0.5 §10.7, a different file is a
 * different conversation.
 *
 * What is pinned: a topic's thread in the project's Folder stays off the
 * project's Conversations; the general talk with no object named stays on it;
 * and the rule reads the root's tags, not a reply's and not the body.
 */
import { describe, expect, it } from 'vitest'
import type { Conversation, Message } from '../../../src/fold'
import { ownConversations } from './ownConversation'

const FOLDER = '85db5b59-9e49-4ea1-8e93-3d2a2d78c048'
const PROJECT = '30850:pk:proj'
const TOPIC = '30840:pk:topic'
const ISSUE = '30851:pk:issue'

const message = (id: string, over: Partial<Message> = {}): Message => ({ id, author: 'a', createdAt: 1, body: id, folder: FOLDER, about: [], ...over })
const thread = (root: Message, replies: Message[] = []): Conversation => ({ id: root.id, root, replies, about: [], createdAt: 1, lastAt: 1 })

const general = thread(message('general'))
const inTopic = thread(message('topic-root', { about: [TOPIC] }), [message('topic-reply', { about: [TOPIC], rootId: 'topic-root' })])
const onIssue = thread(message('issue-root', { about: [ISSUE] }))
const onProject = thread(message('project-root', { about: [PROJECT] }))
const elsewhere = thread(message('other-folder', { folder: 'other' }))
const tagged = { 'topic-root': [TOPIC], 'topic-reply': [TOPIC], 'issue-root': [ISSUE], 'project-root': [PROJECT] }

describe('ownConversations', () => {
  it("a topic's thread in the project's Folder is the topic's, not the project's", () => {
    const own = ownConversations([general, inTopic], FOLDER, PROJECT, tagged)
    expect(own.map((c) => c.id)).toEqual(['general'])
  })

  it('talk that names no object stays the project’s — identity merges (CON-9)', () => {
    expect(ownConversations([general], FOLDER, PROJECT, tagged)).toHaveLength(1)
  })

  it('a thread rooted at the project itself is its own', () => {
    expect(ownConversations([onProject], FOLDER, PROJECT, tagged).map((c) => c.id)).toEqual(['project-root'])
  })

  it("an issue's thread is the issue's — the same rule, no kind named in it", () => {
    expect(ownConversations([onIssue], FOLDER, PROJECT, tagged)).toHaveLength(0)
  })

  it('the Folder still bounds it: another Folder’s general talk is not here', () => {
    expect(ownConversations([elsewhere], FOLDER, PROJECT, tagged)).toHaveLength(0)
  })

  it('the root’s tags decide — a reply naming a topic does not move the thread, and a body mention does not either', () => {
    const replyNames = thread(message('r'), [message('r2', { about: [TOPIC], rootId: 'r' })])
    const bodyMentions = thread(message('m', { about: [TOPIC] }))
    // `about` carries body mentions too; only the tagged index is the root's declaration.
    expect(ownConversations([replyNames, bodyMentions], FOLDER, PROJECT, { r2: [TOPIC] })).toHaveLength(2)
  })
})
