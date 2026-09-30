import type { ReactNode } from 'react'
import type { FolderContents } from '@/api/foreign'
import { Button } from '@/components/ui/Button'
import { EditableText } from '@/components/ui/EditableText'
import { ForeignObject } from '@/components/ui/ForeignObject'
import { splitByKind } from '@/lib/ownKinds'

/**
 * One Folder, as Ship's navigation — RFC 0.4 §4 and §5, narrowed by RFC 0.5
 * §10.7: **navigation is by kind; nesting is by intent.**
 *
 * Ship is a specialized app, and a specialized app's tree lists its own kinds:
 * folders and, inside them, projects and issues. The generic apps are where
 * every file in a Folder is listed — in Peek you can talk about any file, so
 * Peek lists them all. Until 2026-09-11 this view listed everything too, and
 * the comment above it said a `kind === 30850` branch would be the day the
 * Folder stopped being a container. §10.7 settled that the other way: the
 * *read* is still generic (`readFolder` filters nothing), and what the tree
 * chooses to list is this app's business.
 *
 * **What it does not list, it counts.** A Folder holding four topics and no
 * projects is not empty, and a blank list would say it was — so the line under
 * the title says how many other files there are and where they are listed.
 * The split is `splitByKind`, defined once beside the Related filter, and
 * there is no list of the kinds it expects to hide: a Leaf document is "other"
 * the day Leaf exists.
 *
 * Every row is still a `<ForeignObject>`, resolved through its owner's
 * manifest and drawn through the widget chain: Ship's own kinds arrive here
 * the same way a stranger's would, which is what keeps the folder read one
 * mechanism rather than an integration.
 *
 * **Peers, not nesting.** The rows are the Folder's contents, flat, in the
 * order the Folder lists them. A project's own issues are *its* children and
 * belong on the project's page; showing them here would put one row inside
 * another, which is exactly what §5's "a file is anything with an address that
 * a folder can list" rules out.
 */
export function FolderView({ folder, onRename, onArchive, archivedNotice }: {
  folder: FolderContents
  /**
   * The title is click-to-edit, as a project's is (FOL-8). Resolves whether the
   * relay took it; absent, the title is text.
   */
  onRename?: (name: string) => Promise<boolean> | boolean
  /** "Archive folder" (FOL-46). Absent: no control — an archived Folder is restored from its notice. */
  onArchive?: () => void
  /** The `ArchivedNotice` of an archived Folder: the first thing on the page (FOL-46). */
  archivedNotice?: ReactNode
}) {
  const { own, foreign } = splitByKind(folder.files)
  return (
    <div className="flex flex-col gap-4 p-6" data-surface="folder" data-folder={folder.id} data-source={folder.source}>
      {archivedNotice}
      <div className="flex flex-col gap-1">
        {onRename ? (
          /*
            Still the page's heading: EditableText takes its size from where it
            sits (UIG-9), and editable it draws a button or an input, both of
            which an `h1` may hold. Only its read-only form is a `div`, and
            this one is never read-only. Named for the Folder, because the
            button's own name ("Edit folder name") would otherwise be the
            heading's.
          */
          <h1 className="text-h3 text-text-primary" aria-label={folder.name ?? 'Untitled folder'}>
            <EditableText label="Folder name" value={folder.name ?? ''} placeholder="Untitled folder" onCommit={onRename} className="-mx-2" />
          </h1>
        ) : (
          <h1 className="text-h3 text-text-primary">{folder.name ?? 'Folder'}</h1>
        )}
        <p className="text-caption text-text-muted" data-own={own.length} data-foreign={foreign.length}>
          {countLine(own.length, foreign.length)}
          {/*
            Said out loud, because the two are not equivalent and a short list
            is the only visible symptom. Containment by `h` can list Ship's
            records and can never list a topic — under `h` a topic is the
            container rather than something inside it — so a Folder with no
            state event shows less than it holds, and nothing else on screen
            would say why.
          */}
          {folder.source === 'channel' && ' · from channel contents; this folder has no folder state yet'}
        </p>
        {onArchive && (
          <Button size="small" variant="muted" className="mt-2 self-start" onClick={onArchive}>
            Archive folder
          </Button>
        )}
      </div>
      {own.length > 0 && (
        <div className="flex flex-col gap-2">
          {own.map((file) => (
            <ForeignObject key={file.ref} object={file} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The count, in four sentences that must stay four.
 *
 * "Nothing in this folder yet" is true only when both halves are zero. A
 * folder of only other apps' files says so and says how many, because the
 * honest answer to "why is this list blank" is "it is not; Ship does not list
 * these" — and Peek, which lists everything, is where they are.
 */
export function countLine(own: number, foreign: number): string {
  const files = (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`
  const others = `${foreign} other ${foreign === 1 ? 'file' : 'files'}, listed in Peek`
  if (own === 0 && foreign === 0) return 'Nothing in this folder yet.'
  if (foreign === 0) return files(own)
  if (own === 0) return `No projects or issues here · ${others}`
  return `${files(own)} · ${others}`
}
