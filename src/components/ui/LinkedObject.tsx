import { isReadableFolder, useFolderFiles } from '@/api/useFolderFiles'
import { ForeignObject, type ForeignObjectProps } from './ForeignObject'

/** A linked file's card or row, under a message or after a description's line; a Folder's card lists its files, its row is one line. */
export function LinkedObject({ reference, object, layout }: { reference: string } & Pick<ForeignObjectProps, 'object' | 'layout'>) {
  // Only a Folder's card reads its files and listens for focus; every other card draws as it is.
  if (layout !== 'card' || !isReadableFolder(object)) return <ForeignObject object={object} layout={layout} />
  return <FolderCard reference={reference} object={object} />
}

/** A linked Folder's card, with its files read for it alone. */
function FolderCard({ reference, object }: { reference: string; object: ForeignObjectProps['object'] }) {
  return <ForeignObject object={useFolderFiles(reference, object)} layout="card" />
}
