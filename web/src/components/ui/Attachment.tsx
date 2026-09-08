import { useEffect, useState } from 'react'
import { IconFile, IconPhotoOff } from '@tabler/icons-react'
import type { Imeta } from '@estiva-app/protocol'
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
 */
export function Attachment({ file, className }: { file: Imeta; className?: string }) {
  const isImage = file.m.startsWith('image/')
  // The relay generates a thumbnail for images and it is the right thing to put
  // in a conversation card. `thumb` comes back absolute, like `url`.
  const source = isImage ? (file.thumb ?? file.url) : undefined
  const { url, failed } = useBlobUrl(source)
  const label = file.filename ?? file.alt ?? 'attachment'

  if (!isImage) return <FileChip file={file} className={className} />

  if (failed) {
    return (
      <div
        data-attachment="unreadable"
        className={cn('flex items-center gap-1.5 rounded border border-border-default px-2 py-1.5 text-caption text-text-muted', className)}
      >
        <IconPhotoOff size={14} aria-hidden="true" />
        <span className="truncate">{label} — could not be loaded</span>
      </div>
    )
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

/** A non-image file: named and sized, because that is all a reader can use. */
function FileChip({ file, className }: { file: Imeta; className?: string }) {
  return (
    <div
      data-attachment="file"
      className={cn('flex items-center gap-1.5 rounded border border-border-default px-2 py-1.5 text-caption text-text-secondary', className)}
    >
      <IconFile size={14} aria-hidden="true" />
      <span className="truncate">{file.filename ?? file.alt ?? 'file'}</span>
      <span className="shrink-0 text-text-muted">{formatBytes(file.size)}</span>
    </div>
  )
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

/** Bytes as a person reads them. Binary units, one decimal past KB. */
function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  const kb = size / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}
