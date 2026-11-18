import { IconUsers } from '@tabler/icons-react'
import { Chip } from '@/components/ui/Chip'
import { href, linkTo } from '@/router'

/**
 * The team a page's thing belongs to: the one chip after its name in the page's header, opening the team's page — an
 * initiative's, a project's, an issue's (Katerina, 17 November: "one chip, the team it belongs to"; 18 November, D4,
 * D7), as Peek's initiative and file pages draw it: the kit's Chip with the team icon at a chip's 12px.
 */
export function TeamChip({ id, name }: { id: string; name: string }) {
  return <Chip label={name} leadingIcon={<IconUsers size={12} stroke={1.5} aria-hidden />} {...linkTo(href({ name: 'folder', id }))} />
}
