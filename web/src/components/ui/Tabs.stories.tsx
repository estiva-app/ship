import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Tabs } from './Tabs'

const meta = {
  title: 'Primitives/Tabs',
  component: Tabs,
} satisfies Meta<typeof Tabs>

export default meta
type Story = StoryObj<typeof meta>

type Which = 'active' | 'archived'

/** The projects list's pair, as today: labels carry their counts. */
export const ActiveArchived: Story = {
  args: { tabs: [], active: 'active', onChange: () => {} },
  render: () => {
    const [active, setActive] = useState<Which>('active')
    return (
      <Tabs<Which>
        tabs={[
          { id: 'active', label: 'Active (5)' },
          { id: 'archived', label: 'Archived (2)' },
        ]}
        active={active}
        onChange={setActive}
      />
    )
  },
}

/** The project page's view switch (ruling C11). */
export const TableBoard: Story = {
  args: { tabs: [], active: 'table', onChange: () => {} },
  render: () => {
    const [active, setActive] = useState<'table' | 'board'>('table')
    return (
      <Tabs
        tabs={[
          { id: 'table', label: 'Table' },
          { id: 'board', label: 'Board' },
        ]}
        active={active}
        onChange={setActive}
      />
    )
  },
}
