import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ForeignObject } from '@/api/foreign'
import { Related } from './Related'

/**
 * What somebody placed under a project or an issue from another app — RFC 0.5
 * §10.7, drawn under a "Related" heading on the object's page.
 *
 * The rows are `<ForeignObject>` cards, so what is Related's own here is the
 * count before the app chip — comments addressed to the file, from
 * `conversationCountsOf` — and the one line it says when the read failed.
 * The bare-file topic is the first thing this section was built for: no
 * owner, the built-in manifest names it "File", and its `kind:1111`s carry
 * `#a`, so the count is the discussion.
 */
const file = (over: Partial<ForeignObject>): ForeignObject =>
  ({
    ref: 'r',
    address: 'a',
    eventId: 'e',
    kind: 30840,
    widget: 'card',
    appName: 'File',
    slots: {},
    meta: [],
    comments: [],
    actions: [],
    viaRecommendation: false,
    parentRef: '30850:a:rel',
    ...over,
  }) as ForeignObject

const TOPIC = file({ ref: 't1', address: '30840:a:t1', slots: { title: { value: 'Cut-over checklist' }, body: { value: 'What has to be true before the old read path is turned off.' } } })
const SECOND = file({ ref: 't2', address: '30840:a:t2', slots: { title: { value: 'Design review' } } })
const TIDE = file({ ref: 'x', address: '30911:a:x', kind: 30911, appName: 'Tide table', widget: ['tideboard', 'card'], slots: { title: { value: 'Spring tides' } } })

const meta = {
  title: 'Projects/Related',
  component: Related,
  args: { related: { files: [TOPIC, SECOND], counts: { t1: 7, t2: 0 } } },
  // The width a project page's content column gives the section, as Activity's story does.
  decorators: [
    (Story) => (
      <div className="w-[640px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Related>

export default meta
type Story = StoryObj<typeof meta>

/** Two topics under a project: one with seven comments, one nobody has spoken in yet — which draws no badge, because a zero is not "no discussion". */
export const Topics: Story = {}

/** Any kind, not only the bare file — a record from an app nobody here has heard of, through the fallback chain. */
export const AnyKind: Story = { args: { related: { files: [TOPIC, TIDE], counts: { t1: 7, x: 1 } } } }

/** The read did not come back. Says so, and is never mistaken for "nothing placed here". */
export const Failed: Story = { args: { related: 'failed' } }
