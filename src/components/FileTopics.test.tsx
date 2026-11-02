import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TopicOfFile } from '@/api/foreign'
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
  it('names each topic that lists it, opening the topic in Peek', () => {
    render(<FileTopics topics={[WIDGETS]} busy={new Set()} onChange={vi.fn()} readChoices={vi.fn()} />)
    expect(screen.getByRole('link', { name: /Widgets/ }).getAttribute('href')).toBe('https://peek.estiva.app/topic/w')
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
})
