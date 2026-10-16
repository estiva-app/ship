import { useFolderFiles } from '@/api/useFolderFiles'
import { ForeignObject, type ForeignObjectProps } from './ForeignObject'

/** A linked file's card or row, under a message or after a description's line; a Folder's card lists its files, its row is one line. */
export function LinkedObject({ reference, object, layout }: { reference: string } & Pick<ForeignObjectProps, 'object' | 'layout'>) {
  if (layout !== 'card') return <ForeignObject object={object} layout={layout} />
  return <FolderAwareCard reference={reference} object={object} />
}

/** A linked file's card, with a Folder's files read for it alone. */
function FolderAwareCard({ reference, object }: { reference: string; object: ForeignObjectProps['object'] }) {
  return <ForeignObject object={useFolderFiles(reference, object)} layout="card" />
}
