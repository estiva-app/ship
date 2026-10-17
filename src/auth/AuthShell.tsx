/**
 * The auth shell, in React (REW-2).
 *
 * The screen itself is the package's `EntryShell` (AUT-3), the one Peek and
 * Leaf draw, so a sign-in ending looks the same in every app. This wrapper
 * keeps what only Ship knows: its name at the top, and which words and which
 * button each state of entry gets, from `@estiva-app/identity`'s `SHELL_COPY`.
 *
 * It fills the whole window. Mid-session (AUT-4) `SessionGate` draws it in place
 * of the page, and the route left in the address bar is the one Continue comes
 * back to.
 */
import { EntryShell } from '@estiva-app/ui'
import { CONTINUE_LABEL, RETRY_LABEL, SHELL_COPY, isRecoverable, type ShellState } from '@estiva-app/identity'

export interface AuthShellProps {
  state: ShellState
  /** Start the passkey flow. Runs from the tap. */
  onContinue: () => void
}

/**
 * What shows while nobody is signed in: Ship's name, one line saying why, and
 * at most one button.
 */
export function AuthShell({ state, onContinue }: AuthShellProps) {
  const logo = <h1 className="text-h3 text-text-primary">Estiva Ship</h1>

  if (state.phase === 'checking' || state.phase === 'entering' || state.phase === 'ready') {
    return <EntryShell logo={logo} busy className="fixed inset-0 z-50" />
  }

  const { reason } = state
  return (
    <EntryShell
      logo={logo}
      className="fixed inset-0 z-50"
      message={SHELL_COPY[reason]}
      /*
        An unrecoverable reason gets no button: `identity_inactive` and
        `token_rejected` cannot be cleared by authenticating, so offering a
        passkey would send somebody to try the one thing that cannot work.
      */
      action={
        isRecoverable(reason)
          ? { label: state.phase === 'authenticating' ? CONTINUE_LABEL : RETRY_LABEL, onClick: onContinue }
          : undefined
      }
    />
  )
}
