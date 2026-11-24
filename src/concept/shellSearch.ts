import { createContext } from 'react'
import type { AppShellProps } from '@estiva-app/ui'

/** KIN-6 concept: the top bar's search, handed to the page stories' frame so ⌘K can be drawn on Ship's real pages. */
export const ShellSearch = createContext<Pick<AppShellProps, 'onSearch' | 'searchPlaceholder' | 'searchStatus' | 'searchStatusLabel'>>({})
