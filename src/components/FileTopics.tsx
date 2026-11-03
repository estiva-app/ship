import { useEffect, useState } from 'react'
import { IconPlus, IconX } from '@tabler/icons-react'
import { CommandPalette, CommandPaletteSearch, KindIcon, type CommandPaletteRow } from '@estiva-app/ui'
import type { TopicOfFile } from '@/api/foreign'
import type { TopicChoices } from '@/api/topics'
import type { FileTopicsState } from '@/api/useFileTopics'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { SkeletonBar } from '@/components/ui/Skeleton'

/**
 * **A project's or an issue's topics** (TOP-5; why:
 * https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-topic-keeps-its-own-list-of-files.md),
 * in its Overview: one chip per topic whose list names this file, each opening the
 * topic in Peek, as the Per app prototype draws a file's Topics row (estiva-ui
 * `concept/cross-app-navigation`, `Lens.tsx` FilePage). "None" when no topic
 * lists it.
 *
 * Add to topic and each chip's ✕ are where the prototype draws nothing yet
 * (Miky, 1 Nov: Katerina polishes after). They follow the topic, not the file:
 * the list is the topic's, so a file you cannot edit, or an archived one, can
 * still be put in a topic, and an archived topic — by itself or with its
 * project — keeps its chip, says "(archived)" and has no ✕
 * (why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/an-archived-file-is-read-only-in-every-app.md).
 */
export function FileTopics({ topics, busy, onChange, readChoices, choicesNow }: {
  topics: FileTopicsState
  /** Topic addresses with a write on the way: their chip waits, with no ✕. */
  busy: ReadonlySet<string>
  /** Put the file on the topic's list, or take it off. */
  onChange: (topic: TopicOfFile, listed: boolean) => void
  /** The choices, read afresh on each open of Add to topic. */
  readChoices: () => Promise<TopicChoices>
  /** The choices already in hand, drawn while {@link readChoices} reads. */
  choicesNow?: () => TopicChoices | undefined
}) {
  const [picking, setPicking] = useState(false)
  if (topics === undefined) {
    return (
      // Held back 150ms as the Folder's placeholder is, so a fast read never flashes it.
      <div className="animate-skeleton-in" aria-hidden>
        <SkeletonBar className="h-3.5 w-24" />
      </div>
    )
  }
  if (topics === 'failed') return <span className="text-caption text-text-muted">Topics could not be read.</span>
  return (
    <div className="flex flex-col items-start gap-2" data-file-topics>
      {topics.length === 0 ? (
        <EmptyState scope="section" message="None" />
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          {topics.map((topic) => (
            <span key={topic.address} className="flex items-center" data-file-topic={topic.address}>
              <Chip label={topic.archived ? `${topic.title} (archived)` : topic.title} leadingIcon={<KindIcon kind="topic" size={14} tone="inherit" />} href={topic.openUrl} onClick={(event) => openBeside(event, topic.openUrl)} />
              {!topic.archived && !busy.has(topic.address) && (
                <IconButton variant="muted" aria-label={`Remove from ${topic.title}`} tooltip={`Remove from ${topic.title}`} onClick={() => onChange(topic, false)}>
                  <IconX size={12} stroke={1.5} />
                </IconButton>
              )}
            </span>
          ))}
        </div>
      )}
      <Button size="small" variant="muted" leadingIcon={<IconPlus size={14} stroke={1.5} />} onClick={() => setPicking(true)}>
        Add to topic
      </Button>
      {picking && (
        <AddToTopic
          listed={topics.map((topic) => topic.address)}
          readChoices={readChoices}
          choicesNow={choicesNow}
          onPick={(topic) => {
            setPicking(false)
            onChange(topic, true)
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}

/**
 * Every typed word starts a word of the title, in any order: search matches
 * word starts only, everywhere (Miky, 2026-10-19).
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/search-matches-every-word-as-a-word-start.md
 */
function startsWords(title: string, words: readonly string[]): boolean {
  const own = title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  return words.every((word) => own.some((w) => w.startsWith(word)))
}

/** Another app's page, beside Ship rather than in its place, as every other file of another app opens. */
function openBeside(event: { preventDefault: () => void }, url: string | undefined) {
  if (!url) return
  event.preventDefault()
  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * Add to topic's picker, in the kit's palette as Peek's Add file is: the
 * topics you are a member of first, then every other topic you can read, each
 * A–Z, as Peek's Topics screen splits them; archived ones and the ones already
 * listing this file left out. Typing narrows both by title.
 */
function AddToTopic({ listed, readChoices, choicesNow, onPick, onClose }: {
  /** The addresses of the topics that list the file already. */
  listed: readonly string[]
  readChoices: () => Promise<TopicChoices>
  choicesNow?: () => TopicChoices | undefined
  onPick: (topic: TopicOfFile) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  // Choices already in hand draw with the palette, so it never says "Reading topics…" for them.
  const [choices, setChoices] = useState<TopicChoices | 'failed' | undefined>(() => choicesNow?.())
  useEffect(() => {
    let live = true
    readChoices()
      .then((next) => live && setChoices(next))
      // A failed re-read keeps the choices already drawn.
      .catch(() => live && setChoices((drawn) => (typeof drawn === 'object' ? drawn : 'failed')))
    return () => {
      live = false
    }
  }, [readChoices])
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const rows = (topics: readonly TopicOfFile[]): CommandPaletteRow[] =>
    topics
      .filter((topic) => !listed.includes(topic.address) && startsWords(topic.title, words))
      .map((topic) => ({ id: topic.address, label: topic.title, icon: <KindIcon kind="topic" tone="inherit" />, onSelect: () => onPick(topic) }))
  const groups = typeof choices === 'object' ? [{ label: 'Your topics', rows: rows(choices.yours) }, { label: 'Other topics', rows: rows(choices.others) }].filter((group) => group.rows.length > 0) : []
  return (
    <CommandPalette open onOpenChange={(open) => !open && onClose()} label="Add to topic">
      <CommandPaletteSearch
        query={query}
        onQueryChange={setQuery}
        placeholder="Find a topic…"
        groups={groups}
        pending={choices === undefined ? 'Reading topics…' : undefined}
        empty={choices === 'failed' ? 'Topics could not be read.' : words.length ? `No topic is called “${query.trim()}”.` : 'No topic to add it to.'}
      />
    </CommandPalette>
  )
}
