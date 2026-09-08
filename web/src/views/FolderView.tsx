import type { FolderContents } from '@/api/foreign'
import { ForeignObject } from '@/components/ui/ForeignObject'

/**
 * One Folder, and everything in it — RFC 0.4 §4 and §5.
 *
 * **The view that is supposed to look boring.** Every row is a
 * `<ForeignObject>`, the same component that draws a reference pasted into an
 * issue, and nothing here knows what any of the rows are. A Ship project, a
 * Peek topic and a record from an app nobody here has heard of are the same
 * case: an address, resolved through its owner's manifest, drawn through the
 * widget chain in Ship's design language.
 *
 * That is the whole claim. If this file ever grows a `kind === 30850` branch,
 * a sort by app, or a list of kinds it expects, the Folder has stopped being a
 * container and become an integration — and the demo stops proving anything.
 *
 * **Peers, not nesting.** The rows are the Folder's contents, flat, in the
 * order the Folder lists them. A project's own issues are *its* children and
 * belong on the project's page; showing them here would make one row the
 * parent of another and put the two apps at different levels, which is exactly
 * what §5's "a file is anything with an address that a folder can list" rules
 * out.
 */
export function FolderView({ folder }: { folder: FolderContents }) {
  return (
    <div className="flex flex-col gap-4 p-6" data-surface="folder" data-folder={folder.id} data-source={folder.source}>
      <div className="flex flex-col gap-1">
        <h1 className="text-h3 text-text-primary">{folder.name ?? 'Folder'}</h1>
        <p className="text-caption text-text-muted">
          {folder.files.length === 0
            ? 'Nothing in this folder yet.'
            : `${folder.files.length} ${folder.files.length === 1 ? 'file' : 'files'}`}
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
      </div>
      <div className="flex flex-col gap-2">
        {folder.files.map((file) => (
          <ForeignObject key={file.ref} object={file} />
        ))}
      </div>
    </div>
  )
}
