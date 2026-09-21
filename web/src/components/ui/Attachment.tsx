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
 * ## What is the package's, and what stays here
 *
 * **All of it is the package's card now** (UIG-35, Katerina 20 September):
 * the shapes, the wait, the refusal, saving the file, and opening a picture
 * full screen — which Ship never had, so a screenshot in an issue could not be
 * looked at. The 181 lines that were here did what Peek's 174 did, differently.
 *
 * What stays is the one thing only this app knows: how to fetch with this
 * reader's authorization, and which URL is the thumbnail and which the
 * original.
 *
 * No story here, by ruling (Katerina, 21 September): the card has a page in the
 * package, and a second page drawing the same card with Ship's words would be
 * the same picture twice. What is left in this file is a mapping, not a shape.
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
  const name = file.filename ?? file.alt ?? (isImage ? 'attachment' : 'file')
  /*
    The relay generates a thumbnail for images and it is the right thing to put
    in a conversation card; the original is fetched only when somebody opens it.
    `thumb` comes back absolute, like `url`.
  */
  return (
    <AttachmentCard
      data-attachment={isImage ? 'image' : 'file'}
      name={name}
      /*
        The sender's words where they wrote some, the filename otherwise. Never
        empty: an empty alt tells a screen reader the image is decorative, and
        an attachment somebody deliberately posted is the opposite of that.
      */
      alt={isImage ? (file.alt ?? name) : undefined}
      size={file.size}
      contentType={file.m}
      remoteSrc={opens || isImage ? (isImage ? (file.thumb ?? file.url) : file.url) : undefined}
      remoteFullSrc={isImage ? file.url : undefined}
      fetchImage={blobObjectUrl}
      download={opens}
      className={className}
    />
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
