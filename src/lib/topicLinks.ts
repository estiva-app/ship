import { KIND_BARE_FILE, objectRef, type ReadTopic, type TopicsRead } from '@estiva-app/interop'
import { href } from '@/router'
import { safeLink } from './handoff'

/**
 * Where a topic opens from inside Ship (SHIPS-4): its page here, except a
 * space, which is Peek's (Decided 3 Nov). Apart from `lib/topics` so a link
 * can ask without reading the relay.
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-link-opens-in-the-app-you-are-in-when-it-has-a-page-made-for-that-kind.md
 */

const dOf = (address: string) => address.split(':')[2] ?? ''

/** A topic's page here, slug and all. */
export function topicHref(address: string, title?: string): string {
  return href({ name: 'topic', d: dOf(address), slug: title })
}

/** Whether an address is a topic's: a bare file (KINDS), which is what Peek's topics are. */
export function isTopicAddress(address: string | undefined): address is string {
  return !!address && address.startsWith(`${KIND_BARE_FILE}:`)
}

/**
 * The topic on Peek: the same path on the host its manifest's link names, as
 * §7.7 has a person move between apps by changing the host. Absent when Peek's
 * manifest gave no `https:` link.
 */
export function topicInPeek(openUrl: string | undefined, address: string, title: string): string | undefined {
  const link = safeLink(openUrl)
  return link ? `${new URL(link).origin}/topic/${objectRef(dOf(address), title)}` : undefined
}

/**
 * Whether a link is on a host beside this one, under the same parent domain
 * (`peek.estiva.app` from `ship.estiva.app`): the only place a page may send
 * the reader without a click. Peek's link comes from the newest manifest any
 * member may publish (until WOR-2), so anywhere else it stays a link.
 */
export function isSiblingHost(url: string, here: string): boolean {
  const parent = here.split('.').slice(1).join('.')
  if (!parent.includes('.')) return false
  const host = new URL(url).hostname
  return host !== here && host.endsWith(`.${parent}`) && host.split('.').length === here.split('.').length
}

/** The spaces the last topics read named. */
let spaces: ReadonlySet<string> = new Set()

/** Called as each read of every topic lands. */
export function knowSpaces(read: TopicsRead): void {
  spaces = new Set(read.topics.filter((topic) => topic.space).map((topic) => topic.address))
}

/**
 * Called as a read of only your topics lands (ALO-17): it says, for each of
 * yours, whether it is a space; what it says nothing of stays as known.
 */
export function knowSpacesAmong(topics: readonly Pick<ReadTopic, 'address' | 'space'>[]): void {
  const next = new Set(spaces)
  for (const topic of topics) {
    if (topic.space) next.add(topic.address)
    else next.delete(topic.address)
  }
  spaces = next
}

/**
 * Whether the topics read knows this topic for a space; `false` before any
 * read, and the topic's page sends a space on to Peek once it knows.
 */
export function isKnownSpace(address: string): boolean {
  return spaces.has(address)
}
