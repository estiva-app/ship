import { useEffect, useMemo, useRef, useState } from 'react'
import type { FolderSummary, ForeignObject } from '@estiva-app/interop'
import { archivedLine } from '@estiva-app/ui'
import { me, type DirectoryView, type WorkspaceState } from '@/api'
import { reloadTopics, rereadTopics, useTopicDocuments, useTopicPlace, useTopics, useYourTopics } from '@/api/topics'
import { addToTopic, joinTopic, leaveTopic } from '@/api/writes'
import { Members } from '@/components/Members'
import { ThreadList } from '@/components/conversations/ThreadList'
import type { Archives } from '@/lib/archive'
import { safeLink } from '@/lib/handoff'
import { projectTabs } from '@/lib/projects'
import { useTabTitle } from '@/lib/tabTitle'
import { ago } from '@/lib/time'
import { isSiblingHost, topicHref } from '@/lib/topicLinks'
import { topicOfD, topicPageOf } from '@/lib/topics'
import { href } from '@/router'
import { TopicView, type TopicDocument, type TopicPageView } from '@/views/TopicView'
import { act, type Say } from './act'
import { copyText, pickerPeople } from './ProjectPage'
import { useTopicConversation } from './topicConversation'

/** "Katerina, 2h ago": who edited a file last, by first name, and when (the prototype's rows, Miky 4 Nov). */
export function editedLabel(name: string, at: number, now: number = Date.now()): string {
  return `${name.split(' ')[0]}, ${ago(at, now)}`
}

/**
 * A topic's page in Ship (SHIPS-4): what it lists that Ship holds, from the
 * one topics read Topics and Add to topic draw from (held, so opened from
 * Topics it reads nothing more) and Ship's fold, and one read of its Leaf
 * documents' titles.
 *
 * A topic the held read does not have is read for once more before the page
 * says it is not available, so one started since the read opens. A space goes
 * on to Peek (Decided 3 Nov). The address bar gets the topic's current slug,
 * whichever link brought the reader here: an old title, `/o/<naddr>`, or a word
 * nobody declares (SPEC §7.7 serving rule 4).
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-link-opens-in-the-app-you-are-in-when-it-has-a-page-made-for-that-kind.md
 */
export function TopicPage({
  d,
  state,
  folders,
  archives,
  directory,
  say,
  refresh,
}: {
  d: string
  state: WorkspaceState
  folders: FolderSummary[] | undefined
  archives: Archives
  directory: DirectoryView
  say: Say
  /** Folders given: only they are re-read (PER-17). */
  refresh: (folders?: string[]) => Promise<void>
}) {
  const read = useTopics()
  const held = read === 'failed' ? undefined : read
  // Until every topic is read, one of yours draws from the sidebar's read of yours (ALO-17): its title, and
  // what Ship holds of it at once, then Peek's link when every topic lands. A space waits, to go on to Peek.
  const yours = useYourTopics(false).read
  const fromYours = !held && yours && yours !== 'failed' ? topicOfD(yours.topics, d) : undefined
  const topic = held ? topicOfD(held.topics, d) : fromYours && !fromYours.space ? fromYours : undefined

  // A read this open made already has every topic the reader can read; only an older one is read again.
  const heldAtOpen = useRef(read !== undefined && read !== 'failed')
  const [readAgain, setReadAgain] = useState<'landed' | 'failed'>()
  const readingAgain = useRef(false)
  useEffect(() => {
    if (!held || topic || !heldAtOpen.current || readingAgain.current) return
    readingAgain.current = true
    void rereadTopics().then(
      (landed) => setReadAgain(landed ? 'landed' : 'failed'),
      () => setReadAgain('failed'),
    )
  }, [held, topic])

  const page = useMemo(() => (topic ? topicPageOf(topic, state, archives) : undefined), [topic, state, archives])
  // A space goes on to Peek by itself only on a host beside Ship's; anywhere else its page is drawn, with the link.
  const sendsOn = !!topic?.space && !!page?.peekUrl && isSiblingHost(page.peekUrl, location.hostname)

  useEffect(() => {
    if (!topic || !page) return
    if (sendsOn) {
      window.location.replace(page.peekUrl!)
      return
    }
    const path = topicHref(topic.address, page.title)
    if (location.pathname !== path) history.replaceState(null, '', `${path}${location.search}${location.hash}`)
  }, [topic, page, sendsOn])

  const documentsKey = page?.documents.join(' ') ?? ''
  const { documents: listed, retry: retryDocuments } = useTopicDocuments(documentsKey)
  const { nameOf, personOf } = directory
  const documents = useMemo((): TopicDocument[] | 'loading' | 'failed' => {
    if (listed === undefined) return 'loading'
    if (listed === 'failed') return 'failed'
    if (!page) return []
    const order = new Map(page.documents.map((address, at) => [address, at]))
    // An archived document or page is left out, as Leaf's own lists leave it.
    const documentOf = (object: ForeignObject): TopicDocument[] => {
      if (!object.address || object.archived) return []
      const href = safeLink(object.openUrl)
      const children = (object.children ?? []).flatMap(documentOf)
      return [
        {
          address: object.address,
          title: object.slots.title?.value || 'Untitled document',
          ...(href ? { href } : {}),
          ...(object.changedBy && object.changedAt ? { edited: editedLabel(nameOf(object.changedBy), object.changedAt) } : {}),
          ...(children.length ? { children } : {}),
        },
      ]
    }
    return listed.flatMap(documentOf).sort((a, b) => (order.get(a.address) ?? 0) - (order.get(b.address) ?? 0))
  }, [listed, page, nameOf])

  // Projects as the Projects page draws them, in the topic's order (Decided 6 Nov: the order inside each kind).
  const view = useMemo((): TopicPageView | undefined => {
    if (!page) return undefined
    const live = page.live.filter((row) => row.kind === 'project').map((row) => row.address)
    const order = new Map(live.map((address, at) => [address, at]))
    const projects = projectTabs(
      state.projects.filter((project) => order.has(project.addr)),
      state.issues,
      archives,
      personOf,
    ).all.sort((a, b) => (order.get(a.addr) ?? 0) - (order.get(b.addr) ?? 0))
    const issues = page.live
      .filter((row) => row.kind === 'issue')
      .map((row) => ({ ...row, ...(row.edited ? { editedLabel: editedLabel(nameOf(row.edited.by), row.edited.at) } : {}) }))
    const team = folders?.find((folder) => folder.id === page.folder)?.name
    return { title: page.title, ...(page.summary ? { summary: page.summary } : {}), ...(team ? { team } : {}), archived: page.archived, projects, issues, archivedWork: page.archivedWork }
  }, [page, state, archives, personOf, nameOf, folders])

  const conversation = useTopicConversation(topic && !sendsOn ? { address: topic.address, folder: topic.folder, createdAt: topic.createdAt } : undefined, state, directory, say, refresh)
  const { place, reload: reloadPlace } = useTopicPlace(topic && !sendsOn ? topic : undefined)
  const members = useMemo(() => (place ? new Map(place.listed.map((listed) => [listed.pubkey, listed])) : undefined), [place])
  const people = useMemo(() => pickerPeople(state, directory), [state, directory])

  useTabTitle(page && !sendsOn ? page.title : undefined)

  // A space draws nothing here while the browser goes on to Peek.
  const shown = view
    ? sendsOn
      ? 'loading'
      : view
    : held && !topic && (!heldAtOpen.current || readAgain === 'landed')
      ? 'unavailable'
      : read === 'failed' || readAgain === 'failed'
        ? 'failed'
        : 'loading'
  return (
    <TopicView
      topic={shown}
      onRetryDocuments={retryDocuments}
      documents={documents}
      topicsHref={href({ name: 'topics' })}
      comments={conversation.comments}
      conversation={
        // An archived topic takes no message, as an archived file's comments do not (Decided 2026-10-17).
        // Said as the approved story says it: where to bring it back.
        <ThreadList {...conversation.list} disabledReason={page?.archived ? archivedLine({}, undefined, { in: 'Peek', to: 'reply' }) : undefined} className="min-h-0 flex-1" />
      }
      members={
        topic && (
          <Members
            key={topic.address}
            members={members}
            me={me}
            people={people}
            nameOf={nameOf}
            personOf={personOf}
            // Who made it: the pubkey in its address.
            roles={[{ pubkey: topic.address.split(':')[1] ?? '', role: 'Author' }]}
            readOnlyReason={page?.archived ? 'Archived. Unarchive it in Peek to join.' : undefined}
            onSetMine={(member) =>
              act(member ? 'Join' : 'Leave', () => (member ? joinTopic(topic) : leaveTopic(topic)), say, async () => {
                await Promise.all([reloadPlace(), rereadTopics()])
              }, (reason) => `Nothing changed: “${view?.title ?? 'this topic'}” could not be ${member ? 'joined' : 'left'}. ${reason}`)
            }
            onAdd={async (pubkeys) => {
              for (const pubkey of pubkeys) {
                const added = await act('Add member', () => addToTopic(topic, pubkey, place?.events ?? []), say, undefined, (reason) => `Nothing changed: ${nameOf(pubkey)} could not be added to “${view?.title ?? 'this topic'}”. ${reason}`)
                if (!added) {
                  await reloadPlace()
                  return false
                }
              }
              await reloadPlace()
              return true
            }}
          />
        )
      }
      onCopyLink={() => void copyText(new URL(topic ? topicHref(topic.address, view?.title ?? '') : location.pathname, window.location.origin).href, 'Link copied', 'Copy this link:', say)}
      {...(page?.peekUrl ? { onOpenInPeek: () => void window.open(page.peekUrl, '_blank', 'noopener') } : {})}
      onRetry={() => {
        if (readAgain !== 'failed') return void reloadTopics()
        setReadAgain(undefined)
        void rereadTopics().then(
          (landed) => setReadAgain(landed ? 'landed' : 'failed'),
          () => setReadAgain('failed'),
        )
      }}
    />
  )
}
