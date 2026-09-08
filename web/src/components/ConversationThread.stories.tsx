import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, userEvent, within } from 'storybook/test'
import { THREADS } from '@/fixtures/issues'
import { Conversations } from './ConversationThread'

/** As production: a composer to start one, then each thread with its replies one level in and a reply line. */
const meta = {
  title: 'Conversations/Conversations',
  component: Conversations,
  args: { threads: THREADS, onStart: fn(), onReply: fn() },
  decorators: [
    (Story) => (
      <div className="w-[640px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Conversations>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Empty: Story = { args: { threads: [] } }

/** A single thread with no replies yet. */
export const OneThread: Story = { args: { threads: [THREADS[1]] } }

/**
 * "New since you last read this" — the divider CRO-13 added.
 *
 * It had no colour at all until 2026-09-07: `text-accent-default` and
 * `bg-accent-default/40` are not classes the preset defines (the accent tokens
 * are `accent-primary`, `accent-muted`, `accent-hover`), so both compiled to
 * nothing and the marker rendered in the inherited body colour. A story would
 * have shown it; there was not one, which is why there is one now.
 */
export const Unread: Story = { args: { threads: THREADS, unread: { [THREADS[0].id]: THREADS[0].replies[1].id } } }

/**
 * Every message carries a `…` — CON-3.
 *
 * **On every message, not only your own.** SPEC §6.5 said a relay honours a
 * deletion only from the original signer, and this app was built to hide the
 * control accordingly; the rule was withdrawn on 2026-09-06. Buzz accepts a
 * `kind:5` from the target's effective author **or** from the NIP-OA owner of
 * an authoring agent, and no client can evaluate the second half — ownership is
 * written from the attestation and read server-side only. So an author gate
 * would hide the control from the one *other* party the relay would accept,
 * which here is where the conversation is: 425 of 583 messages on production
 * were written by a single agent identity.
 *
 * Without `onDeleteMessage` — a signed-out reader — the trigger is absent
 * rather than disabled, which is Button's rule for a control somebody may
 * never be allowed to use.
 */
export const Deletable: Story = { args: { threads: [THREADS[0]], onDeleteMessage: fn() } }

/**
 * Every message carries "React" beside its `…` — the two are one strip, one
 * Tab stop (0.10.0, D34). The picker is the package's, and it opens **above**
 * the button, because the message it is about is underneath (D30). This
 * canvas opens the first one.
 */
export const Reactable: Story = {
  args: { threads: [THREADS[0]], onReact: fn(), onDeleteMessage: fn() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole('button', { name: 'React' })[0])
  },
}
