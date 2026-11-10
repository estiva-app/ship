import { useEffect, useMemo, useRef, useState } from 'react'
import type { FolderSummary } from '@estiva-app/interop'
import type { FolderState } from '@/api'
import { reloadTopics, rereadTopics, useTopicDocuments, useTopics } from '@/api/topics'
import type { Archives } from '@/lib/archive'
import { safeLink } from '@/lib/handoff'
import { useTabTitle } from '@/lib/tabTitle'
import { isSiblingHost, topicHref } from '@/lib/topicLinks'
import { topicOfD, topicPageOf } from '@/lib/topics'
import { TopicView, type TopicDocument } from '@/views/TopicView'

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
export function TopicPage({ d, state, folders, archives }: { d: string; state: FolderState; folders: FolderSummary[] | undefined; archives: Archives }) {
  const read = useTopics()
  const held = read === 'failed' ? undefined : read
  const topic = held ? topicOfD(held.topics, d) : undefined

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
  const documents = useMemo((): TopicDocument[] | 'loading' | 'failed' => {
    if (listed === undefined) return 'loading'
    if (listed === 'failed') return 'failed'
    if (!page) return []
    const order = new Map(page.documents.map((address, at) => [address, at]))
    return listed
      .flatMap((object): TopicDocument[] => {
        // An archived document is left out, as Leaf's own lists leave it.
        if (!object.address || object.archived) return []
        const href = safeLink(object.openUrl)
        return [{ address: object.address, title: object.slots.title?.value || 'Untitled document', ...(href ? { href } : {}) }]
      })
      .sort((a, b) => (order.get(a.address) ?? 0) - (order.get(b.address) ?? 0))
  }, [listed, page])

  useTabTitle(page && !sendsOn ? page.title : undefined)

  // A space draws nothing here while the browser goes on to Peek.
  const shown = page
    ? sendsOn
      ? 'loading'
      : page
    : held && !topic && (!heldAtOpen.current || readAgain === 'landed')
      ? 'unavailable'
      : read === 'failed' || readAgain === 'failed'
        ? 'failed'
        : 'loading'
  return (
    <TopicView
      topic={shown}
      onRetryDocuments={retryDocuments}
      folderName={page ? folders?.find((folder) => folder.id === page.folder)?.name : undefined}
      documents={documents}
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
