import { useMemo } from 'react'
import {
  deleteMessage,
  editMessage,
  fileContext,
  react,
  reply,
  startConversation,
  threadContext,
  unreact,
  unreadByThread,
  useFeedJudges,
  useMergedReadState,
  type DirectoryView,
  type WorkspaceState,
} from '@/api'
import { useThreads } from '@/api/useThreads'
import type { ConversationsProps } from '@/components/ConversationThread'
import { ownConversations } from '@/lib/ownConversation'
import { newestDrawn, useMarkRead, useShownThreads } from '@/lib/useMarkRead'
import { useNewSince } from '@/lib/useNewSince'
import { answerOf, deleteAnswer, type Say } from './act'
import { cardEditOf, folderOfMessage, refreshAfter, resolveAnswer, threadFor } from './ProjectPage'
import { useSideColumn } from './sideColumn'

/**
 * A topic's own conversation on its page in Ship (TOPI-8), as a project's comments column draws and writes one:
 * the threads whose root is about the topic, in its team's Folder, the same ones Peek's topic shows; a new one and a
 * reply go to that Folder, about the topic. Writing in it never makes you a member (record below).
 *
 * Read state is the one Peek keeps for the topic (`fileContext` of its address, and a thread's own once its replies
 * are drawn), marked only while the column is shown and its conversations are held, so a topic read here is read in
 * Peek and the other way round (66b31c4b, CON-34).
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/writing-in-a-place-never-follows-it.md
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-reply-is-read-only-when-its-thread-is-opened.md
 */
export function useTopicConversation(
  topic: { address: string; folder: string; createdAt: number } | undefined,
  state: WorkspaceState,
  directory: DirectoryView,
  say: Say,
  refresh: (folders?: string[]) => Promise<void>,
) {
  const held = useThreads(state, topic ? [topic.folder] : [], topic ? [topic.address] : [])
  const conversations = useMemo(() => (topic ? ownConversations(state.conversations, { addr: topic.address, recordFolder: '' }, state.anchors) : []), [topic, state])
  const side = useSideColumn()
  const shown = side.comments.shown
  const [shownThreads, onThreadShown] = useShownThreads()
  const drawn = useMemo(() => newestDrawn(conversations, shownThreads), [conversations, shownThreads])
  const streams = useMemo(() => (shown && held.all && topic ? [fileContext(topic.address)] : []), [topic, shown, held.all])
  useMarkRead(streams, drawn.rootsAt)
  useMarkRead(shown ? shownThreads.map(threadContext) : [], drawn.repliesAt)
  const threads = useMemo(
    () => conversations.map((c) => threadFor(c, directory, undefined, topic?.address, state.edits, state.attachments, state.urgent, state.parts, state.embeds)),
    [conversations, directory, topic, state],
  )
  const merged = useMergedReadState()
  const judges = useFeedJudges(topic ? { addr: topic.address, createdAt: topic.createdAt } : undefined, undefined)
  const verdictAt = useMemo(() => {
    if (!judges.file) return () => undefined
    return (frontier: Readonly<Record<string, number>>) => unreadByThread(conversations, frontier, () => judges.file)
  }, [judges, conversations])
  const { unread, stillUnread } = useNewSince(topic?.address, merged, verdictAt)
  const again = (folder: string | undefined) => refreshAfter(state, folder, refresh, () => {})

  const list: ConversationsProps = {
      threads,
      loading: !held.folders,
      unread,
      stillUnread,
      onThreadShown,
      about: topic?.address,
      nameOf: directory.nameOf,
      onStart: (body, files, picks) => {
        if (!topic) return Promise.resolve('This topic is not on this page yet.')
        return answerOf(() => startConversation({ folder: topic.folder, about: topic.address, body, files, urgent: picks?.urgent, embeds: picks?.embeds }), () => refresh([topic.folder]))
      },
      onReply: (threadId, body, files, picks) => {
        const conversation = conversations.find((c) => c.id === threadId)
        if (!conversation || !topic) return Promise.resolve('That conversation is no longer on this page.')
        return answerOf(() => reply(conversation, topic.folder, body, files, picks?.urgent, picks?.embeds), () => refresh([conversation.root.folder || topic.folder]))
      },
      onReact: (messageId, emoji, mine) => answerOf(() => (mine ? unreact(mine) : react(messageId, emoji))),
      onResolve: (threadId, resolved, note) => resolveAnswer(state, threadId, resolved, note, say),
      onDeleteMessage: (messageId) => {
        const folder = folderOfMessage(state, messageId)
        return deleteAnswer(() => deleteMessage(messageId), say, () => again(folder))
      },
      onEditMessage: (messageId, body, removeCard, files, dropped) => {
        const folder = folderOfMessage(state, messageId)
        if (!folder) return Promise.resolve('That message has no team to publish an edit into.')
        return answerOf(() => editMessage(folder, messageId, body, cardEditOf(state, messageId, removeCard, dropped), files), () => again(folder))
      },
  }
  return { comments: { ...side.comments, unread: Object.values(stillUnread ?? {}).some((ids) => ids.length > 0) }, list }
}
