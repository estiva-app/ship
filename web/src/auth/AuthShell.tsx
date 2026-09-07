/**
 * The auth shell, in React (REW-2).
 *
 * Peek renders these states in React and the old Ship app rendered them in plain
 * DOM. All three use the same copy from the same `SHELL_COPY`, so the apps agree
 * on what entry *says* without sharing a component — which is the line
 * `@estiva-app/identity` draws: it ships the state machine and the vocabulary,
 * never the pixels.
 *
 * That line is not only taste. ADR 0002 §2 names identity depending on
 * `@estiva-app/ui` as the trigger that would fold `ui` back into the foundation
 * repo, and a package shipping sign-in components is how that happens by
 * accident. So this file uses Ship's own primitives and the package stays clear.
 *
 * ## Deliberately the same canvas in every state
 *
 * A title, a line of text, and at most one button. What it must never look like
 * is a sign-in page for an identity system the person is usually already signed
 * into — the whole point of the silent probe is that most loads never see this.
 *
 * Waiting states are a heading and nothing else: entry with a live session
 * resolves fast, and anything more would flash.
 */
import {
  CONTINUE_LABEL,
  RETRY_LABEL,
  SHELL_COPY,
  isRecoverable,
  type ShellState,
} from '@estiva-app/identity'
import { Button } from '@estiva-app/ui'

export interface AuthShellProps {
  state: ShellState
  onContinue: () => void
}

export function AuthShell({ state, onContinue }: AuthShellProps) {
  const waiting = state.phase === 'checking' || state.phase === 'entering' || state.phase === 'ready'

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-bg-surface px-6 text-center">
      <h1 className="text-h3 text-text-primary">Estiva Ship</h1>
      {!waiting && (
        <>
          <p className="max-w-prose text-body-2 text-text-secondary">{SHELL_COPY[state.reason]}</p>
          {/*
            An unrecoverable reason gets no button, and that is the honest thing:
            `identity_inactive` and `token_rejected` cannot be cleared by
            authenticating, so offering a passkey would send somebody to try the
            one thing that cannot work.
          */}
          {isRecoverable(state.reason) && (
            <Button onClick={onContinue}>
              {state.phase === 'authenticating' ? CONTINUE_LABEL : RETRY_LABEL}
            </Button>
          )}
        </>
      )}
    </div>
  )
}
