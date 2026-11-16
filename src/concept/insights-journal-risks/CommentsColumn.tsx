/**
 * CONCEPT — Ship's comments column, on the kit's ConversationLayout and ConversationCard as ThreadList draws it,
 * with Mark as… in each comment's ⋯ (the card's `menu` slot, after Resolve) and a marked comment's line.
 * The real ThreadList wires the relay; this draws only what a person sees.
 */
import { useState } from 'react'
import { ConversationCard, ConversationLayout } from '@estiva-app/ui'
import { MarkAsRows, MarkedLine, MarkedNotice, TYPE_OF, type Mark, type MarkWord } from './MarkAs'
import type { Person } from './fixtures'

export interface StoryComment {
  id: string
  author: Person
  time: string
  text: string
  mark?: Mark
  /** A source whose readers differ from any team's: no Mark offered. */
  privateSource?: boolean
}

export function CommentsColumn({ comments, team, about, startMenuOn }: { comments: StoryComment[]; team: string; about?: string; startMenuOn?: string }) {
  const [marks, setMarks] = useState<Record<string, Mark | undefined>>(() => Object.fromEntries(comments.map((c) => [c.id, c.mark])))
  const [notice, setNotice] = useState<MarkWord>()
  const mark = (c: StoryComment, word: MarkWord) => {
    // Marks at once: the title from the comment's first line, the source's team, what it is about (Decided, kickoff).
    const title = c.text.split(/(?<=[.!?])\s/)[0].slice(0, 80)
    setMarks((m) => ({ ...m, [c.id]: { type: TYPE_OF[word], word, title, href: '#', status: 'accepted' } }))
    setNotice(word)
  }
  const items = comments.map((c) => ({
    id: c.id,
    card: (
      <MarkedLine mark={marks[c.id]}>
        <ConversationCard
          author={{ name: c.author.name, bot: c.author.bot }}
          time={c.time}
          menuLabel="Message actions"
          editLabel="Edit message"
          deleteLabel="Delete message"
          onDelete={() => {}}
          onReply={() => {}}
          onResolve={() => true}
          menu={<MarkAsRows mark={marks[c.id]} refused={c.privateSource} onMark={(w) => mark(c, w)} onUnmark={() => setMarks((m) => ({ ...m, [c.id]: undefined }))} />}
        >
          {c.text}
        </ConversationCard>
      </MarkedLine>
    ),
  }))
  return (
    <div className="flex w-[384px] min-h-0 flex-1 flex-col" data-start-menu={startMenuOn}>
      <ConversationLayout threads="under" items={items} title="Comments" />
      {notice && <MarkedNotice word={notice} team={team} about={about} onClose={() => setNotice(undefined)} />}
    </div>
  )
}
