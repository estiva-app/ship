import { useFolderFiles } from '@/api/useFolderFiles'
import { ForeignObject, type ForeignObjectProps } from './ForeignObject'

/** A linked file's card or row, under a message or after a description's line; a Folder's lists its files. */
export function LinkedObject({ reference, object, layout }: { reference: string } & Pick<ForeignObjectProps, 'object' | 'layout'>) {
  return <ForeignObject object={useFolderFiles(reference, object)} layout={layout} />
}
