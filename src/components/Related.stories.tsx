import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ForeignObject } from '@/api/foreign'
import { Related } from './Related'

/**
 * What somebody placed under a project or an issue from another app — RFC 0.5
 * §10.7, drawn under a "Related" heading on the object's page.
 *
 * Each file is the kit's row (`ForeignObject`, always the row here), so what is
 * Related's own is the nesting, the count it read — conversations on the file,
 * from `conversationCountsOf`, drawn as the kit's count opening them — and the
 * one line it says when the read failed.
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
    appName: 'Peek',
    openUrl: 'https://peek.estiva.app/o/naddr1topic',
    noun: 'topic',
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
  args: { related: { files: [TOPIC, SECOND], inside: {}, counts: { t1: 7, t2: 0 } } },
  // The page's reading column (Katerina, 29 September: 768px).
  // Padded, not centred: in the centred layout a column has no width to take, and a short one shrank to its words.
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-full max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Related>

export default meta
type Story = StoryObj<typeof meta>

/** Two topics under a project: one with seven conversations, one nobody has spoken in yet — which draws no count. */
export const Topics: Story = {}

/** Any kind, not only the bare file — a record from an app nobody here has heard of, through the fallback chain. */
export const AnyKind: Story = { args: { related: { files: [TOPIC, TIDE], inside: {}, counts: { t1: 7, x: 1 } } } }

/**
 * A sub-topic under the related topic, and one under that (FOL-4): indented
 * beneath, each still a row that opens in its own app.
 */
export const Nested: Story = {
  args: {
    related: {
      files: [TOPIC],
      inside: { [TOPIC.ref]: [SECOND], [SECOND.ref]: [TIDE] },
      counts: { t1: 7, t2: 0, x: 1 },
    },
  },
}

/** The read did not come back. Says so, and is never mistaken for "nothing placed here". */
export const Failed: Story = { args: { related: 'failed' } }

/**
 * Every state a row can be in, as the kit's rows (Katerina, 30 Oct): the kind's
 * tile, the title, its type on the line under it; its state and its comment
 * count on the title's line; an
 * object's own list nested under it; and one this reader may not see, as the
 * kit's "not available" row with the way to open it in its app.
 */
export const EveryState: Story = {
  args: {
    related: {
      files: [
        file({ ref: 'r1', slots: { title: { value: 'Cut-over checklist' }, status: { value: 'In Progress', colour: 'blue' } } as ForeignObject['slots'] }),
        file({ ref: 'r2', appName: 'Peek', slots: { title: { value: 'Pairing notes' }, subtitle: { value: 'What we agreed on Tuesday, and what is still open' } } as ForeignObject['slots'], meta: [{ label: 'Owner', value: 'Mara Sato' }] as ForeignObject['meta'] }),
        file({ ref: 'r3', appName: 'Leaf', slots: { title: { value: 'Cut-over plan' } } as ForeignObject['slots'], children: [file({ ref: 'r3a', appName: 'Leaf', slots: { title: { value: 'Step 1: reads' }, status: { value: 'Done', colour: 'green' } } as ForeignObject['slots'] }), file({ ref: 'r3b', appName: 'Leaf', slots: { title: { value: 'Step 2: writes' }, status: { value: 'Todo', colour: 'gray' } } as ForeignObject['slots'] })] }),
        file({ ref: 'r4', appName: 'Peek', unreachable: true, openUrl: '#' } as Partial<ForeignObject>),
      ],
      inside: {},
      counts: { r1: 7, r2: 12 },
    },
  },
}
