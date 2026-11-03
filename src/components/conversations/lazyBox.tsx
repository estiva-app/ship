import { Suspense, lazy, type ComponentProps } from 'react'
import { SkeletonBar } from '@estiva-app/ui'
import { cn } from '@/lib/cn'

/*
  The box is its own chunk: its editor is ProseMirror, which a reader must
  never download (RIC-14's rule for the description, kept). Until it lands a
  bar holds its place; a closed box is a line and needs no editor.
*/
const LazyBox = lazy(() => import('./ConversationBox'))

/** Ship's `ConversationBox`, loaded when first drawn: start, reply and edit, every one the kit's `CommentBox`. */
export function Box(props: ComponentProps<typeof LazyBox>) {
  return (
    <Suspense fallback={props.kind === 'edit' ? null : <SkeletonBar shape="control" className={cn('h-10 w-full', props.className)} />}>
      <LazyBox {...props} />
    </Suspense>
  )
}
