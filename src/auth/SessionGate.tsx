/**
 * The app, with the passkey screen drawn over it when the sign-in ends (AUT-4).
 *
 * Over, not instead: the page under it stays mounted and its route stays in the
 * address bar, which is where Continue sends the person back to. The ending
 * comes from {@link sessionEnded}: a renewal Estiva ID refused, or another tab
 * signing out.
 */
import { useSyncExternalStore, type ReactNode } from 'react'
import { AuthShell } from './AuthShell'
import { enterFromShell } from './boot'
import { sessionEnded, subscribeSessionEnded } from './estivaId'

export function SessionGate({ children }: { children: ReactNode }) {
  const reason = useSyncExternalStore(subscribeSessionEnded, sessionEnded)
  return (
    <>
      {children}
      {reason && (
        <AuthShell
          // Another tab signing out is a sign-out, not an ending: the plain screen, as Peek draws it.
          state={{ phase: 'authenticating', reason }}
          onContinue={() => void enterFromShell()}
        />
      )}
    </>
  )
}
