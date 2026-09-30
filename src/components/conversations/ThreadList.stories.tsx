import type { Meta, StoryObj } from '@storybook/react-vite'
import { useFakeRelay } from '@/fixtures/fakeRelay'
import { MentionListView, ThreadListView } from './ThreadList'
import { STORY_ME, STORY_MENTIONS, STORY_PEOPLE, STORY_REACTIONS, STORY_THREADS } from './stories.fixtures'

/**
 * The conversations on a project or an issue. Everything here really runs —
 * attaching a file uploads it, the picture comes back through the signed
 * download, and sending, replying, reacting, editing and deleting all answer —
 * against a pretend relay (`fakeRelay`). Type "refuse" to see the relay say
 * no: the text stays. A file over 5 MB is refused in the relay's words.
 */
function Conversations({ empty = false, signedOut = false, unread }: { empty?: boolean; signedOut?: boolean; unread?: Record<string, string> }) {
  const relay = useFakeRelay({ threads: empty ? [] : STORY_THREADS, mentioned: STORY_MENTIONS, people: STORY_PEOPLE, me: STORY_ME, reactions: STORY_REACTIONS, unread, signedOut })
  return <ThreadListView {...relay.conversations} />
}

function Mentioned({ empty = false, truncated = 0 }: { empty?: boolean; truncated?: number }) {
  const relay = useFakeRelay({ threads: [], mentioned: empty ? [] : STORY_MENTIONS, people: STORY_PEOPLE, me: STORY_ME, reactions: STORY_REACTIONS })
  return <MentionListView {...relay.mentioned} truncated={truncated} />
}

const meta = {
  title: 'Conversations/Conversations',
  component: Conversations,
  // The page's reading column.
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
 * A card per conversation. Under each message and reply, its reactions then
 * the add-reaction button; under a first message, the replies button ("💬 2",
 * or the icon alone). "…" is always there. A picture, a text file, a linked
 * issue and an edit are in the sample.
 */
export const Default: Story = {}

/** Nothing yet: the box, and a line saying so. */
export const Empty: Story = { args: { empty: true } }

/**
 * "New since you last read this" above a new reply — the thread opens by
 * itself, and its replies button says how many are new — and above a whole new
 * conversation.
 */
export const Unread: Story = { args: { unread: { t1: 'm3', t2: 'm4' } } }

/** Signed out: the boxes say why, nothing can be pressed, and reactions still show. */
export const SignedOut: Story = { args: { signedOut: true } }

/** "Mentioned in": conversations elsewhere that name this object, each with the place it lives. */
export const MentionedIn: StoryObj<typeof Mentioned> = { render: () => <Mentioned /> }

/** "Mentioned in" with nothing yet. */
export const MentionedInEmpty: StoryObj<typeof Mentioned> = { render: () => <Mentioned empty /> }

/** More than the horizon: the list says how many it left out rather than implying there are none. */
export const MentionedInTruncated: StoryObj<typeof Mentioned> = { render: () => <Mentioned truncated={12} /> }
