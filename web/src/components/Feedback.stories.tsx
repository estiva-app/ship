import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, userEvent, within } from 'storybook/test'
import { Banner } from '@/components/Banner'
import { Button } from '@/components/ui/Button'
import { ToastProvider, useToast } from '@/components/ui/Toast'

/**
 * How Ship answers a person since 0.10.0 (D35): an error is a banner under
 * the top bar that stays until it is dismissed or replaced; an "ok" note —
 * "Public key copied.", "Deletion requested.", "Project archived." — is the
 * package's toast, bottom left, gone on its own after five seconds.
 */
const meta = {
  title: 'Feedback/Banner and Toast',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** An error stays. The ✕ is D21's dismiss; before 0.10.0 the banner had none. */
export const ErrorBanner: Story = {
  render: () => (
    <Banner tone="error" onDismiss={fn()}>
      Status → cancelled rejected — relay said no
    </Banner>
  ),
}

/** The relay is busy: a static notice with no dismiss, because it clears itself. */
export const BusyBanner: Story = {
  render: () => <Banner tone="info">The relay is busy — waiting to load the workspace. This clears on its own.</Banner>,
}

function CopyKey() {
  const { showToast } = useToast()
  return (
    <div className="p-6">
      <Button size="small" variant="outlined" onClick={() => showToast({ label: 'Public key copied.', type: 'success' })}>
        Copy public key
      </Button>
    </div>
  )
}

/** An "ok" note is a toast. This canvas presses the button so the toast is up. */
export const Toast: Story = {
  render: () => (
    <ToastProvider>
      <CopyKey />
    </ToastProvider>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Copy public key' }))
  },
}
