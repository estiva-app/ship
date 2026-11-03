import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TopicsRead } from '@estiva-app/interop'
import type { TopicOfFile } from '@/api/foreign'
import { knowSpaces } from '@/lib/topicLinks'
import { FileTopics } from './FileTopics'

const topic = (d: string, title: string, extra: Partial<TopicOfFile> = {}): TopicOfFile => ({
  address: `30840:${'a'.repeat(64)}:${d}`,
  folder: 'team',
  title,
  openUrl: `https://peek.estiva.app/topic/${d}`,
  archived: false,
  ...extra,
})
const WIDGETS = topic('w', 'Widgets')
const OLD = topic('o', 'Old', { archived: true })
const DESIGN = topic('d', 'Design')
const ROADMAP = topic('r', 'Roadmap')

describe('FileTopics, a project’s or an issue’s Topics in its rail (TOP-5)', () => {
  it('names each topic that lists it, opening the topic’s page in Ship (SHIPS-4)', () => {
    render(<FileTopics topics={[WIDGETS]} busy={new Set()} onChange={vi.fn()} readChoices={vi.fn()} />)
    expect(screen.getByRole('link', { name: /Widgets/ }).getAttribute('href')).toBe('/topic/widgets-w')
  })

  it('says None when no topic lists it, and still offers Add to topic', () => {
    render(<FileTopics topics={[]} busy={new Set()} onChange={vi.fn()} readChoices={vi.fn()} />)
    expect(screen.getByText('None')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add to topic' })).toBeTruthy()
  })

  it('says so when the topics could not be read', () => {
    render(<FileTopics topics="failed" busy={new Set()} onChange={vi.fn()} readChoices={vi.fn()} />)
    expect(screen.getByText('Topics could not be read.')).toBeTruthy()
  })

  it('Remove takes it off that topic; an archived topic keeps its chip with no Remove', () => {
    const onChange = vi.fn()
    render(<FileTopics topics={[OLD, WIDGETS]} busy={new Set()} onChange={onChange} readChoices={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Remove from Old' })).toBeNull()
    expect(screen.getByRole('link', { name: /Old/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove from Widgets' }))
    expect(onChange).toHaveBeenCalledWith(WIDGETS, false)
  })

  it('says an archived topic is archived, and only that one', () => {
    render(<FileTopics topics={[OLD, WIDGETS]} busy={new Set()} onChange={vi.fn()} readChoices={vi.fn()} />)
    expect(screen.getByRole('link', { name: /Old \(archived\)/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Widgets/ }).textContent).not.toContain('archived')
  })

  it('Add to topic draws choices already in hand at once, never “Reading topics…”, and the fresh ones when they land', async () => {
    let land: (choices: { yours: TopicOfFile[]; others: TopicOfFile[] }) => void = () => undefined
    const readChoices = vi.fn(() => new Promise<{ yours: TopicOfFile[]; others: TopicOfFile[] }>((resolve) => (land = resolve)))
    render(<FileTopics topics={[]} busy={new Set()} onChange={vi.fn()} readChoices={readChoices} choicesNow={() => ({ yours: [ROADMAP], others: [DESIGN] })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add to topic' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Roadmap')).toBeTruthy()
    expect(within(dialog).queryByText('Reading topics…')).toBeNull()
    expect(readChoices).toHaveBeenCalledTimes(1)
    await act(async () => land({ yours: [ROADMAP], others: [DESIGN, WIDGETS] }))
    expect(within(dialog).getByText('Widgets')).toBeTruthy()
  })

  it('Add to topic keeps the choices in hand when reading them again fails', async () => {
    const readChoices = vi.fn().mockRejectedValue(new Error('relay down'))
    render(<FileTopics topics={[]} busy={new Set()} onChange={vi.fn()} readChoices={readChoices} choicesNow={() => ({ yours: [ROADMAP], others: [] })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add to topic' }))
    const dialog = screen.getByRole('dialog')
    await waitFor(() => expect(readChoices).toHaveBeenCalled())
    await act(async () => undefined)
    expect(within(dialog).getByText('Roadmap')).toBeTruthy()
    expect(within(dialog).queryByText('Topics could not be read.')).toBeNull()
  })

  it('Add to topic offers your topics first, then the others, never one that lists it already, and adds the one picked', async () => {
    const onChange = vi.fn()
    const readChoices = vi.fn().mockResolvedValue({ yours: [WIDGETS, ROADMAP], others: [DESIGN] })
    render(<FileTopics topics={[WIDGETS]} busy={new Set()} onChange={onChange} readChoices={readChoices} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add to topic' }))
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(within(dialog).getByText('Design')).toBeTruthy())
    const text = dialog.textContent ?? ''
    expect(text.indexOf('Your topics')).toBeLessThan(text.indexOf('Roadmap'))
    expect(text.indexOf('Roadmap')).toBeLessThan(text.indexOf('Other topics'))
    expect(text.indexOf('Other topics')).toBeLessThan(text.indexOf('Design'))
    expect(within(dialog).queryByText('Widgets')).toBeNull()
    await act(async () => fireEvent.click(within(dialog).getByText('Design')))
    expect(onChange).toHaveBeenCalledWith(DESIGN, true)
  })

  it('typing narrows the choices by title', async () => {
    const readChoices = vi.fn().mockResolvedValue({ yours: [ROADMAP], others: [DESIGN] })
    render(<FileTopics topics={[]} busy={new Set()} onChange={vi.fn()} readChoices={readChoices} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add to topic' }))
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(within(dialog).getByText('Design')).toBeTruthy())
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'road' } })
    expect(within(dialog).getByText('Roadmap')).toBeTruthy()
    expect(within(dialog).queryByText('Design')).toBeNull()
  })

  it('matches every typed word at a word start, in any order, never inside a word', async () => {
    const readChoices = vi.fn().mockResolvedValue({ yours: [topic('b', 'Widgets 2: build 1')], others: [DESIGN] })
    render(<FileTopics topics={[]} busy={new Set()} onChange={vi.fn()} readChoices={readChoices} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add to topic' }))
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(within(dialog).getByText('Design')).toBeTruthy())
    const box = within(dialog).getByRole('combobox')
    fireEvent.change(box, { target: { value: 'build wid' } })
    expect(within(dialog).getByText('Widgets 2: build 1')).toBeTruthy()
    fireEvent.change(box, { target: { value: 'dget' } })
    expect(within(dialog).queryByText('Widgets 2: build 1')).toBeNull()
  })

  it('a topic opens its page in Ship’s place; a space opens in Peek beside Ship (SHIPS-4)', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    history.replaceState(null, '', '/issues')
    knowSpaces({ me: 'm', membership: {}, topics: [{ address: DESIGN.address, space: true }] } as unknown as TopicsRead)
    render(<FileTopics topics={[WIDGETS, DESIGN]} busy={new Set()} onChange={vi.fn()} readChoices={vi.fn()} />)
    fireEvent.click(screen.getByRole('link', { name: /Widgets/ }))
    expect(location.pathname).toBe('/topic/widgets-w')
    expect(open).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('link', { name: /Design/ }))
    expect(open).toHaveBeenCalledWith('https://peek.estiva.app/topic/d', '_blank', 'noopener,noreferrer')
    knowSpaces({ me: 'm', membership: {}, topics: [] } as unknown as TopicsRead)
    open.mockRestore()
  })
})
