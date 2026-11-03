import { useEffect } from 'react'
import { Link, NoAccessNotice } from '@estiva-app/ui'
import { IconLink } from '@tabler/icons-react'
import { useHandoff } from '@/api/handoff'
import { beginSignIn, signedIn, signInAvailable } from '@/auth/estivaId'
import { EmptyState } from '@/components/ui/EmptyState'
import { ForeignObject } from '@/components/ui/ForeignObject'
import { SkeletonList } from '@/components/ui/Skeleton'
import { KIND } from '@/nostr/kinds'
import { replace } from '@/router'

/**
 * Another app's file, opened on Ship's host, handed off to the app that draws
 * it — RFC 0.5 §7.7 rule 2, PRO-22.
 *
 * Ship has no view of a Peek topic and should not grow one to satisfy a URL:
 * the hand-off *is* the answer. So this draws the file the way a reference in
 * a comment is drawn — its title and its app — and the link that opens it
 * there. Never a 404 and never the issue list, because the link named a real
 * file.
 */
export function HandoffPage({ word, fileRef, query }: { word: string; fileRef: string; query?: string }) {
  const handoff = useHandoff(word, fileRef, query)

  // A word nobody declares that turned out to be Ship's own file (§7.7 rule
  // 4): drawn at its right word, without a history entry to bounce off.
  useEffect(() => {
    if (handoff && handoff !== 'failed' && handoff.state === 'own') {
      replace(handoff.kind === KIND.PROJECT ? { name: 'project', d: handoff.d, view: 'table' } : { name: 'issue', d: handoff.d })
    }
  }, [handoff])

  if (handoff === undefined || (handoff !== 'failed' && handoff.state === 'own')) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-6" data-loading="handoff">
        <SkeletonList rows={1} />
      </div>
    )
  }
  if (handoff === 'failed') {
    // The relay answers reads only to a member, so a signed-out reader's
    // "could not be read" is really "sign in" — and trying again never helps.
    return signInAvailable && !signedIn() ? (
      <EmptyState icon={<IconLink size={16} stroke={1.5} />} message="Sign in to open this link." action={{ label: 'Sign in', onClick: () => void beginSignIn() }} />
    ) : (
      <EmptyState icon={<IconLink size={16} stroke={1.5} />} message="This link could not be read. Try again in a moment." />
    )
  }
  if (handoff.state === 'missing') {
    return <EmptyState icon={<IconLink size={16} stroke={1.5} />} message="Nothing found at this link. It may be in a Folder you cannot see." />
  }
  if (handoff.state === 'unclaimed') {
    return <EmptyState icon={<IconLink size={16} stroke={1.5} />} message="No app here can open this yet. Ask whoever sent the link where it lives." />
  }

  const { object, app, openUrl } = handoff
  // A file the reader can't open: the page says only that, with no title and no Open link — its app would say the same
  // (Decided 2026-11-03, ALO-4; under a message it is the card instead). The word is the file's type, else its app's
  // name, as the card says it; never the URL's word, which whoever wrote the link chose.
  if (object.unreachable) return <NoAccessNotice what={object.noun ?? app ?? object.appName ?? 'file'} />
  return (
    <div data-surface="handoff" className="flex flex-1 flex-col items-center justify-center px-6 py-5">
      <div className="flex w-full max-w-prose flex-col gap-3">
        {/* The kit's card, labelled by the file's type ("Topic", PRO-24); a type with no name is called by the app the link goes to. */}
        <ForeignObject object={{ ...object, appName: app ?? object.appName }} />
        {openUrl && (
          <Link href={openUrl} variant="underlined">
            {app ? `Open in ${app}` : 'Open'}
          </Link>
        )}
      </div>
    </div>
  )
}
