import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IconChevronDown } from '@tabler/icons-react'
import { cn } from '@/lib/cn'
import { Avatar } from '@/components/ui/Avatar'

/**
 * Who you are, and where you are — the header's identity trigger and the
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
  const displayName = me.name ?? 'Anonymous'

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

  const close = () => setOpen(false)

  return (
    <div ref={root} className={cn('relative', className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex h-8 cursor-pointer items-center gap-2 rounded-md pl-1.5 pr-2 transition-colors hover:bg-bg-hover',
          open && 'bg-bg-hover',
        )}
      >
        <Avatar name={me.name} src={me.picture} size={22} />
        <span className={cn('text-body-2', me.name ? 'text-text-primary' : 'text-text-muted')}>{displayName}</span>
        <IconChevronDown size={14} stroke={1.5} className="text-text-muted" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-[300px] rounded-lg border border-border-default bg-bg-elevated py-1.5 shadow-lg"
        >
          <MenuLabel>{signedIn ? 'Signed in as' : 'Acting as'}</MenuLabel>
          <MenuValue>
            <span className="flex items-center gap-2">
              <Avatar name={me.name} src={me.picture} size={20} />
              <span className={cn('text-body-2-strong', me.name ? 'text-text-primary' : 'text-text-muted')}>
                {displayName}
              </span>
            </span>
          </MenuValue>
          <MenuNote>
            {signedIn
              ? 'Your Estiva ID. The same person you are in Estiva Peek.'
              : 'A key held by this browser only. Nobody else knows who you are.'}
          </MenuNote>
          {me.email && <MenuNote>{me.email} · known to Estiva, never published to the relay</MenuNote>}

          <MenuLabel>Workspace</MenuLabel>
          <MenuValue>
            <span className="break-all font-mono text-caption text-text-secondary">{relayUrl}</span>
          </MenuValue>
          <MenuNote>Everyone on this relay shares this workspace, in every app.</MenuNote>

          <div className="mx-2 my-1.5 border-t border-border-subtle" />

          {signedIn && idBase && (
            <MenuAction href={idBase} onClick={close}>
              Edit your profile in Estiva ID
            </MenuAction>
          )}
          <MenuAction
            onClick={() => {
              close()
              onCopyKey()
            }}
          >
            Copy public key
          </MenuAction>
          {idBase && onSignOut && (
            <MenuAction
              onClick={() => {
                close()
                onSignOut()
              }}
            >
              Sign out
            </MenuAction>
          )}
        </div>
      )}
    </div>
  )
}

function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-3 pb-0.5 pt-2 text-caption text-text-muted">{children}</div>
}

function MenuValue({ children }: { children: ReactNode }) {
  return <div className="px-3 py-0.5">{children}</div>
}

function MenuNote({ children }: { children: ReactNode }) {
  return <div className="px-3 py-0.5 text-caption text-text-muted">{children}</div>
}

function MenuAction({ href, onClick, children }: { href?: string; onClick: () => void; children: ReactNode }) {
  const classes =
    'flex h-8 w-full cursor-pointer items-center px-3 text-left text-body-2 text-text-primary hover:bg-bg-hover'
  if (href) {
    return (
      <a role="menuitem" href={href} target="_blank" rel="noreferrer" onClick={onClick} className={classes}>
        {children}
      </a>
    )
  }
  return (
    <button role="menuitem" type="button" onClick={onClick} className={classes}>
      {children}
    </button>
  )
}
