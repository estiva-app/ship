import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IconCopy, IconExternalLink, IconLogout } from '@tabler/icons-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Person } from '@/components/ui/Person'
import { PersonTrigger } from '@/components/ui/PersonTrigger'

/**
 * Who you are, and where you are — the top bar's identity trigger and the
 * menu it opens.
 *
 * The trigger is a face and a name, never a key (ruling A4). Anonymous is a
 * silhouette and the word "Anonymous": the truth of the situation rather than
 * eight hex characters posing as a name, which is what today's app shows.
 *
 * The menu keeps the old app's two honest sentences word for word, and the
 * workspace line names the relay because on this substrate the relay *is* the
 * workspace (and the smoke test asserts that this menu names it). The one
 * place a key appears is as the *result* of "Copy public key" — this component
 * never receives the key, so it cannot show one; the caller copies.
 *
 * Three kinds of text, three tokens: a section label is muted, the value is
 * primary, the sentence under it is secondary. The actions are Buttons.
 *
 * Signed-in affordances ("Edit your profile in Estiva ID", "Sign out") are
 * modelled now and wired in REW-2.
 */
export interface Identity {
  /** From `kind:0`. Absent means anonymous. */
  name?: string
  picture?: string
  /** Known to Estiva ID, never published to the relay (PEEK-50). */
  email?: string
}

export interface IdentityMenuProps {
  me: Identity
  /** Signed in through Estiva ID, as opposed to a browser-held key. */
  signedIn: boolean
  relayUrl: string
  /** Estiva ID's base URL when this build offers sign-in; absent = anonymous-only build. */
  idBase?: string
  onCopyKey: () => void
  onSignOut?: () => void
  className?: string
}

export function IdentityMenu({ me, signedIn, relayUrl, idBase, onCopyKey, onSignOut, className }: IdentityMenuProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const act = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  return (
    <div ref={root} className={cn('relative', className)}>
      <PersonTrigger
        name={me.name}
        picture={me.picture}
        fallback="Anonymous"
        open={open}
        onClick={() => setOpen((value) => !value)}
      />

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-border-default bg-bg-elevated p-1 shadow-lg"
        >
          <Section label={signedIn ? 'Signed in as' : 'Acting as'}>
            <Person name={me.name} picture={me.picture} fallback="Anonymous" size={28} className="text-body-2-strong" />
            <Note>
              {signedIn
                ? 'Your Estiva ID. The same person you are in Estiva Peek.'
                : 'A key held by this browser only. Nobody else knows who you are.'}
            </Note>
            {me.email && <Note>{me.email} · known to Estiva, never published to the relay</Note>}
          </Section>

          <Divider />

          <Section label="Workspace">
            <span className="break-all font-mono text-caption text-text-primary">{relayUrl}</span>
            <Note>Everyone on this relay shares this workspace, in every app.</Note>
          </Section>

          <Divider />

          <div className="flex flex-col gap-px pt-1">
            {signedIn && idBase && (
              <Button
                className="w-full justify-start"
                leadingIcon={<IconExternalLink size={16} stroke={1.5} className="text-text-secondary" />}
                onClick={act(() => window.open(idBase, '_blank', 'noopener,noreferrer'))}
              >
                Edit your profile in Estiva ID
              </Button>
            )}
            <Button
              className="w-full justify-start"
              leadingIcon={<IconCopy size={16} stroke={1.5} className="text-text-secondary" />}
              onClick={act(onCopyKey)}
            >
              Copy public key
            </Button>
            {idBase && onSignOut && (
              <Button
                className="w-full justify-start"
                leadingIcon={<IconLogout size={16} stroke={1.5} className="text-text-secondary" />}
                onClick={act(onSignOut)}
              >
                Sign out
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 px-2 pb-3 pt-2">
      <span className="text-caption text-text-muted">{label}</span>
      {children}
    </div>
  )
}

function Note({ children }: { children: ReactNode }) {
  return <span className="text-caption text-text-secondary">{children}</span>
}

function Divider() {
  return <div className="mx-1 border-t border-border-subtle" />
}
