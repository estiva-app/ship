import { useState } from 'react'
import { cn } from '@/lib/cn'
import { Divider } from '@/components/ui/Divider'
import { Menu, MenuItem, MenuRow, MenuSection } from '@/components/ui/Menu'
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
 * The menu is Peek's menu shell (`ui/Menu`) — same container, same rows,
 * same section headings, same exits. It keeps the old app's two honest
 * sentences word for word, and the workspace line names the relay because on
 * this substrate the relay *is* the workspace (and the smoke test asserts
 * that this menu names it). The one place a key appears is as the *result*
 * of "Copy public key" — this component never receives the key, so it cannot
 * show one; the caller copies. Items are text only, no icons (her ruling).
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
  const close = () => setOpen(false)
  const act = (action: () => void) => () => {
    close()
    action()
  }

  return (
    <div className={cn('relative', className)}>
      <PersonTrigger
        name={me.name}
        picture={me.picture}
        fallback="Anonymous"
        open={open}
        onClick={() => setOpen((value) => !value)}
      />

      {open && (
        <Menu onClose={close} className="w-72">
          <MenuSection label={signedIn ? 'Signed in as' : 'Acting as'}>
            <MenuRow>
              <Person name={me.name} picture={me.picture} fallback="Anonymous" size={28} className="text-body-2-strong" />
            </MenuRow>
            <Note>
              {signedIn
                ? 'Your Estiva ID. The same person you are in Estiva Peek.'
                : 'A key held by this browser only. Nobody else knows who you are.'}
            </Note>
            {me.email && <Note>{me.email} · known to Estiva, never published to the relay</Note>}
          </MenuSection>

          <Divider className="mx-0 my-2" />

          <MenuSection label="Workspace">
            <MenuRow>
              <span className="break-all font-mono text-caption text-text-primary">{relayUrl}</span>
            </MenuRow>
            <Note>Everyone on this relay shares this workspace, in every app.</Note>
          </MenuSection>

          <Divider className="mx-0 my-2" />

          {signedIn && idBase && (
            <MenuItem
              label="Edit your profile in Estiva ID"
              onClick={act(() => window.open(idBase, '_blank', 'noopener,noreferrer'))}
            />
          )}
          <MenuItem label="Copy public key" onClick={act(onCopyKey)} />
          {idBase && onSignOut && <MenuItem label="Sign out" onClick={act(onSignOut)} />}
        </Menu>
      )}
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return <span className="px-2 pb-1.5 text-caption text-text-secondary">{children}</span>
}
