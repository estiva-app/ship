import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Resolution } from '@/api'
import type { ThreadData, UnreadByThread } from '@/components/ConversationThread'
import { useFakeRelay } from '@/fixtures/fakeRelay'
import { MentionListView, ThreadListView, commentsTitle } from './ThreadList'
import { STORY_DELETED, STORY_ME, STORY_MENTIONS, STORY_PEOPLE, STORY_QUOTED, STORY_REACTIONS, STORY_RESOLVED, STORY_THREADS, STORY_URGENT } from './stories.fixtures'

/**
 * The conversations on a project or an issue. Everything here really runs —
 * attaching a file uploads it, the picture comes back through the signed
 * download, and sending, replying, reacting, editing and deleting all answer —
 * against a pretend relay (`fakeRelay`). Type "refuse" to see the relay say
 * no: the text stays. A file over 5 MB is refused in the relay's words.
 */
function Conversations({ empty = false, signedOut = false, unread, resolvedBy, first = [] }: { empty?: boolean; signedOut?: boolean; unread?: UnreadByThread; resolvedBy?: Record<string, Resolution>; first?: ThreadData[] }) {
  const relay = useFakeRelay({ threads: empty ? [] : [...first, ...STORY_THREADS], mentioned: STORY_MENTIONS, people: STORY_PEOPLE, me: STORY_ME, reactions: STORY_REACTIONS, unread, signedOut })
  // The kit's one column, 384px, at a page's height beside it (ONE-6, step 4c).
  return (
    <div className="flex h-screen">
      <ThreadListView {...relay.conversations} resolvedBy={resolvedBy} title={commentsTitle('issue', 'REL-1 · Board columns lose order')} />
    </div>
  )
}

function Mentioned({ empty = false, truncated = 0 }: { empty?: boolean; truncated?: number }) {
  const relay = useFakeRelay({ threads: [], mentioned: empty ? [] : STORY_MENTIONS, people: STORY_PEOPLE, me: STORY_ME, reactions: STORY_REACTIONS })
  // The page's reading column, where Mentioned in still is (the Activity tab).
  return (
    <div className="w-full max-w-3xl p-4">
      <MentionListView {...relay.mentioned} truncated={truncated} />
    </div>
  )
}

const meta = {
  title: 'Conversations/Conversations',
  component: Conversations,
  // The whole frame: the comments are a column at a page's height. Mentioned in pads its own reading column.
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Conversations>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The comments column beside an issue's or a project's page (ONE-6, step 4c):
 * the kit's one column, 384px, "Comments" over whose they are, the kit's cards
 * in Ship's words. A comment per conversation, its replies row (faces, how
 * many, the last time) and its thread opening under it, one at a time; the box
 * at its foot. React, Reply and "Message actions" show on hover. A picture, a
 * text file, a linked issue and an edit are in the sample.
 */
export const Default: Story = {}

/** Nothing yet: the box, and a line saying so. */
export const Empty: Story = { args: { empty: true } }

/**
 * New since it was last read: the thread holding a new reply opens by itself,
 * its replies row says how many are new, and each new message keeps its dot
 * and edge until read ("New since you last read this" went, Katerina, 2 November).
 */
export const Unread: Story = { args: { unread: { t1: ['m3'], t2: ['m4'] } } }

/** Signed out: the boxes say why, nothing can be pressed, and reactions still show. */
export const SignedOut: Story = { args: { signedOut: true } }

/** "Mentioned in": conversations elsewhere that name this object, each with the place it lives. */
export const MentionedIn: StoryObj<typeof Mentioned> = { render: () => <Mentioned /> }

/** "Mentioned in" with nothing yet. */
export const MentionedInEmpty: StoryObj<typeof Mentioned> = { render: () => <Mentioned empty /> }

/** More than the horizon: the list says how many it left out rather than implying there are none. */
export const MentionedInTruncated: StoryObj<typeof Mentioned> = { render: () => <Mentioned truncated={12} /> }

/** A comment resolved in Peek: closed under "Resolved" at the column's end (Katerina, 2 November); opened, who resolved it and the note. Ship offers no Resolve. */
export const ResolvedInPeek: Story = { args: { resolvedBy: STORY_RESOLVED } }

/** A comment that was deleted: "This comment was deleted.", its replies under it, and in place of the box, why no reply can be written. */
export const DeletedComment: Story = { args: { first: [STORY_DELETED] } }

/** A comment written on words in Leaf: the words it quotes, under the name. */
export const QuotedInLeaf: Story = { args: { first: [STORY_QUOTED] } }

/** A new comment naming you urgently: the amber mark and edge until it is read. */
export const UrgentForYou: Story = { args: { first: [STORY_URGENT], unread: { m10: ['m10'] } } }
