import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Resolution } from '@/api'
import type { ThreadData, UnreadByThread } from '@/components/ConversationThread'
import { useFakeRelay } from '@/fixtures/fakeRelay'
import { MentionListView, ThreadListView } from './ThreadList'
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
  return <ThreadListView {...relay.conversations} resolvedBy={resolvedBy} />
}

function Mentioned({ empty = false, truncated = 0 }: { empty?: boolean; truncated?: number }) {
  const relay = useFakeRelay({ threads: [], mentioned: empty ? [] : STORY_MENTIONS, people: STORY_PEOPLE, me: STORY_ME, reactions: STORY_REACTIONS })
  return <MentionListView {...relay.mentioned} truncated={truncated} />
}

const meta = {
  title: 'Conversations/Conversations',
  component: Conversations,
  // The page's reading column.
  // Padded, not centred: in the centred layout a column has no width to take, and a short one shrank to its words.
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-full max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Conversations>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The kit's cards, in Ship's words, still in the Activity tab (ONE-6, step 3):
 * a comment per conversation, its replies row (faces, how many, the last time)
 * and its thread opening under it, one at a time. React, Reply and "Message
 * actions" show on hover. A picture, a text file, a linked issue and an edit
 * are in the sample.
 */
export const Default: Story = {}

/** Nothing yet: the box, and a line saying so. */
export const Empty: Story = { args: { empty: true } }

/**
 * "New since you last read this" above a new reply — the thread opens by
 * itself, and its replies button says how many are new — and above a whole new
 * conversation.
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

/** A comment resolved in Peek: "✓ Resolved" by its time, and who resolved it with the note above its replies. Ship offers no Resolve. */
export const ResolvedInPeek: Story = { args: { resolvedBy: STORY_RESOLVED } }

/** A comment that was deleted: "This comment was deleted.", its replies under it, and in place of the box, why no reply can be written. */
export const DeletedComment: Story = { args: { first: [STORY_DELETED] } }

/** A comment written on words in Leaf: the words it quotes, under the name. */
export const QuotedInLeaf: Story = { args: { first: [STORY_QUOTED] } }

/** A new comment naming you urgently: the amber mark and edge until it is read. */
export const UrgentForYou: Story = { args: { first: [STORY_URGENT], unread: { m10: ['m10'] } } }
