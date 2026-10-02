import type { Meta, StoryObj } from '@storybook/react-vite'
import type { FolderContents, ForeignObject } from '@/api/foreign'
import { FolderView } from './FolderView'

/**
 * Invented files from three apps, one of which nobody wrote.
 *
 * Since RFC 0.5 §10.7 the tree lists Ship's own kinds and *counts* the rest,
 * so the tide reading and the topic are the point of the fixture for a new
 * reason: neither is listed, both are counted, and no kind is named in the
 * rule that decides. The line under the title is what a person gets instead
 * of a blank list.
 */
const file = (over: Partial<ForeignObject>): ForeignObject =>
  ({
    ref: 'r',
    address: 'a',
    eventId: 'e',
    kind: 30850,
    widget: 'card',
    appName: 'Estiva Ship',
    slots: {},
    meta: [],
    comments: [],
    actions: [],
    viaRecommendation: true,
    ...over,
  }) as ForeignObject

const FILES: ForeignObject[] = [
  file({ ref: 'p', kind: 30850, appName: 'Estiva Ship', slots: { title: { value: 'Payment integration' } } }),
  file({ ref: 't', kind: 30840, appName: 'Peek', noun: 'topic', slots: { title: { value: 'Onboarding' } } }),
  file({ ref: 'x', kind: 30911, appName: 'Tide table', widget: ['tideboard', 'card'], slots: { title: { value: 'Spring tides' } } }),
  file({ ref: 'i', kind: 30851, appName: 'Estiva Ship', widget: 'row', slots: { title: { value: 'Refund webhook retries' }, status: { value: 'In Progress', colour: 'blue' } } }),
]

const folder = (over: Partial<FolderContents> = {}): FolderContents =>
  ({ id: '7b32200c-e4c0-4216-b79a-8490fc05e0bd', name: 'Onboarding', hasState: true, source: 'state', files: FILES, ...over }) as FolderContents

const meta = {
  title: 'Views/FolderView',
  component: FolderView,
  args: { folder: folder() },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof FolderView>

export default meta
type Story = StoryObj<typeof meta>

/** Ship's project and issue listed; the topic and the tide reading counted — "2 files · 2 other files, listed in Peek". */
export const ThreeApps: Story = {}

/**
 * Four topics and no projects — the case §10.7's ticket names.
 *
 * Nothing is listed and the folder is not empty, and the line has to say both:
 * "No projects or issues here · 4 other files, listed in Peek". A blank list
 * under "Nothing in this folder yet" would be the lie this story guards
 * against.
 */
export const OnlyOtherApps: Story = {
  args: {
    folder: folder({
      files: [1, 2, 3, 4].map((n) => file({ ref: `t${n}`, kind: 30840, appName: 'Peek', noun: 'topic', slots: { title: { value: `Topic ${n}` } } })),
    }),
  },
}

/**
 * The approximation, and it says so.
 *
 * A Folder with no state event is read by containment — each file's own `h`
 * tag — which lists Ship's records and **cannot list a topic**, because under
 * `h` a topic is the container rather than something inside it. The short list
 * is the only visible symptom, so the line under the title is the whole
 * explanation a reader gets.
 */
export const NoFolderStateYet: Story = {
  args: { folder: folder({ hasState: false, source: 'channel', files: [FILES[0]!] }) },
}

/** One file: "1 file", not "1 files". */
export const OneFile: Story = { args: { folder: folder({ files: [FILES[0]!] }) } }

/**
 * Empty, and deliberately not silent.
 *
 * Also what a Folder looks like to somebody who may not read its contents:
 * RFC 0.4 §4.2 drops files the reader cannot see rather than marking them,
 * because the count is itself the disclosure. So "nothing here" and "nothing
 * here *for you*" render identically, on purpose.
 */
export const Empty: Story = { args: { folder: folder({ files: [] }) } }

/** No name: a Folder with no state has only its channel's, and may have none. */
export const Unnamed: Story = { args: { folder: folder({ name: undefined }) } }

/** The title is click-to-edit (FOL-8), as a project's is; Enter renames, Escape leaves it. */
export const Renameable: Story = { args: { onRename: () => true } }

/** Renameable with no name: the placeholder says what it is. */
export const RenameableUnnamed: Story = { args: { folder: folder({ name: undefined }), onRename: () => true } }
