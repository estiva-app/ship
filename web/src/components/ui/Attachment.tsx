import { useEffect, useState } from 'react'
import type { Imeta } from '@estiva-app/protocol'
import { AttachmentCard } from '@estiva-app/ui'
import { cn } from '@/lib/cn'
import { blobObjectUrl } from '@/api/blobs'

/**
 * A file on a message — SHI-1's screenshot half, CON-12.
 *
 * Katerina: *"Screenshots and reference widgets aren't rendered in conversation
 * or replies."* The reference half was answered when threads learned to draw a
 * `nostr:` pointer as the object it names. This is the other half, and it could
 * not be built until peek#177 put the file on the relay — before that an
 * attachment lived in Convex storage and there was no image for Ship to draw.
 *
 * ## The bytes have to be fetched, not linked
 *
 * Media GET is authenticated, so `<img src={file.url}>` answers 401 for
 * everyone. `blobObjectUrl` signs a `kind:24242` and hands back an object URL.
 * That is also why there is a loading state for something that looks like a
 * plain image: it is a request, and requests fail.
 *
 * ## Three states, all of them said
 *
 * A file that cannot be read is drawn as a file that cannot be read, never as
 * nothing: the message *says* an image is attached, and a card silently missing
 * one leaves the reader thinking the sender forgot it. The relay's most likely
 * refusal here is `relay_membership_required` — a real answer about a channel
 * this reader is not in, not a bug — and it deserves words rather than a gap.
 *
 * ## What is the package's, and what stays here
 *
 * A file, and an image that cannot be read, are the package's `AttachmentCard`
 * (UIG-27): Ship's files are the same card as Peek's (Katerina, 2026-09-14).
 * An image stays drawn here, whole, in its 4px frame, until the package has a
 * full-screen viewer to open it in — her ruling the same day. So does the
 * fetch: the package draws, the app reads the bytes with the reader's own
 * permission.
 */
/**
 * A file attached to a message: an image shown whole, any other file as a card
 * to open or download, and a plain note when it cannot be loaded.
 */
export function Attachment({
  file,
  opens = true,
  className,
}: {
  file: Imeta
  /**
   * Whether a file opens and downloads. `false` in a description being edited: that editor saves and closes
   * when it loses focus, and the card's link and Download button take focus (measured 2026-09-15: pressing
   * Download committed and left the editor). There a file is content being edited, drawn and never opened.
   */
  opens?: boolean
  className?: string
}) {
  const isImage = file.m.startsWith('image/')
  // The relay generates a thumbnail for images and it is the right thing to put
  // in a conversation card. `thumb` comes back absolute, like `url`.
  const source = isImage ? (file.thumb ?? file.url) : undefined
  const { url, failed } = useBlobUrl(source)
  const label = file.filename ?? file.alt ?? 'attachment'

  if (!isImage) return <FileCard file={file} opens={opens} className={className} />

  if (failed) {
    // The package's card that cannot be read (UIG-27): its name, "Could not be loaded", a dashed hairline.
    return <AttachmentCard data-attachment="unreadable" name={label} contentType={file.m} state="unreadable" className={className} />
  }

  if (!url) {
    return (
      <div
        data-attachment="loading"
        aria-busy="true"
        aria-label={`Loading ${label}`}
        /* `bg-bg-inset`, the surface the package's own SkeletonBar uses: the
           class here was `bg-bg-subtle`, which the preset does not generate,
           so this placeholder had no background at all. The token lint
           (S11) caught it on the day it was switched on. */
        className={cn('h-24 w-40 animate-pulse rounded border border-border-default bg-bg-inset', className)}
      />
    )
  }

  return (
    <img
      data-attachment="image"
      src={url}
      /*
        The sender's alt text where they wrote one, the filename otherwise.
        Never empty: an empty alt tells a screen reader the image is decorative,
        and an attachment somebody deliberately posted is the opposite of that.
      */
      alt={file.alt ?? label}
      className={cn('max-h-64 max-w-full rounded border border-border-default object-contain', className)}
    />
  )
}

/**
 * A non-image file: the package's file card (UIG-27; Katerina, 2026-09-14: Ship's files are Peek's card) —
 * a type tile, the name, and its type and size.
 */
function FileCard({ file, opens, className }: { file: Imeta; opens: boolean; className?: string }) {
  const name = file.filename ?? file.alt ?? 'file'
  /*
    Its bytes are read so the card can open them, as an image's are. Media GET
    is authenticated, so the relay's own URL answers 401 in a new tab; only an
    object URL made from a signed fetch opens. Read once per file and cached
    (`blobObjectUrl`), as Peek reads a file from the relay (Katerina,
    2026-09-15: files open and download, like Peek's). Until the bytes arrive,
    or when they cannot be read, the card has no address: dimmed, opening
    nothing.
  */
  const { url } = useBlobUrl(opens ? file.url : undefined)
  return (
    <AttachmentCard
      data-attachment="file"
      name={name}
      size={file.size}
      contentType={file.m}
      href={opens ? url : undefined}
      onDownload={opens ? () => void saveFile(file.url, name) : undefined}
      className={className}
    />
  )
}

/** Save a file under its own name: its bytes' object URL, handed to a temporary `<a download>`. */
async function saveFile(source: string, name: string): Promise<void> {
  try {
    const url = await blobObjectUrl(source)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
  } catch {
    // A refused read saves nothing, and the card already opens nothing: there is no second thing to say.
  }
}

/** Every file on one message, in the order the sender attached them. */
export function Attachments({ files, className }: { files?: readonly Imeta[]; className?: string }) {
  if (!files || files.length === 0) return null
  return (
    <div className={cn('flex flex-wrap items-start gap-1.5', className)}>
      {files.map((file) => (
        // Content-addressed, so the hash is a stable key — and two copies of
        // one file on a message are the same blob, hence the index beside it.
        <Attachment key={`${file.x}_${file.url}`} file={file} />
      ))}
    </div>
  )
}

/**
 * The object URL for one blob, or the fact that it could not be read.
 *
 * The `cancelled` flag is not about wasted work — it is about a fetch resolving
 * after its card has gone, which React warns about and which would otherwise
 * show one message's image on another after a poll reorders a thread.
 */
function useBlobUrl(source?: string): { url?: string; failed: boolean } {
  const [state, setState] = useState<{ url?: string; failed: boolean }>({ failed: false })

  useEffect(() => {
    if (!source) {
      setState({ failed: false })
      return
    }
    let cancelled = false
    setState({ failed: false })
    blobObjectUrl(source)
      .then((url) => {
        if (!cancelled) setState({ url, failed: false })
      })
      .catch(() => {
        if (!cancelled) setState({ failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [source])

  return state
}
