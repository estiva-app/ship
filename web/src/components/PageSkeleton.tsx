import { Card } from '@estiva-app/ui'
import { cn } from '@/lib/cn'
import { Divider } from '@/components/ui/Divider'
import { SkeletonBar, SkeletonList } from '@/components/ui/Skeleton'

/**
 * A page before the workspace's first read lands, in the shape it will arrive
 * in (UIG-14). It was six list rows on every route, and the projects route
 * arrives as a grid of cards: the placeholder and the thing it becomes were
 * two different shapes. The package's Skeleton page: "data is on its way and
 * the shape of what arrives is known, show that shape".
 *
 * Built from the package's bar and list, as the package asks of a placeholder
 * that knows what it stands for (Peek's conversation card is one): the bars
 * sit in boxes one text line tall, so each shape is as tall as its page.
 *
 * - `cards` — the projects page: its heading, then a grid of project cards.
 * - `list` — the issues page: its heading, the tabs, then rows.
 * - `page` — one project or issue: the trail, the title and rows, and the
 *   rail beyond the hairline.
 * - `rows` — rows alone, where the page's shape is its own to say (a Folder
 *   draws this same list while its files load).
 *
 * Revealed after 150ms, as the list is, so a fast read never flashes it.
 */
export type PageSkeletonShape = 'cards' | 'list' | 'page' | 'rows'

/** A page in the shape it will arrive in, while the workspace's first read is in flight. */
export function PageSkeleton({ shape }: { shape: PageSkeletonShape }) {
  // `data-loading` is what a test waits on; the shape rides beside it.
  const marks = { 'data-loading': 'workspace', 'data-shape': shape, 'aria-hidden': true } as const

  if (shape === 'page') {
    return (
      <div {...marks} className="flex min-h-0 flex-1 animate-skeleton-in">
        {/* The trail at the page's top, then the title and rows 16px below it,
            as the issue and project pages lay them out. */}
        <div className="flex min-w-0 flex-1 flex-col gap-4 px-6 pt-5">
          <Line className="w-40" />
          <div className="flex flex-col gap-6">
            <div className="flex h-7 items-center">
              <SkeletonBar className="h-5 w-2/3" />
            </div>
            <SkeletonList rows={6} />
          </div>
        </div>
        <Divider orientation="vertical" />
        {/* The rail starts level with the title, below the trail's row. Three
            properties: a label over a select. 256px (`w-64`): the rail's own
            250px has no spacing token. */}
        <div className="shrink-0 px-6 pt-14">
          <div className="flex w-64 flex-col gap-4">
            {['w-16', 'w-20', 'w-16'].map((label, i) => (
              <div key={i} className="flex flex-col gap-3">
                <SkeletonBar className={cn('h-3', label)} />
                <SkeletonBar className="h-9 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (shape === 'rows') {
    return (
      <div {...marks} className="flex flex-col gap-3 p-6">
        <SkeletonList rows={6} />
      </div>
    )
  }

  return (
    <div {...marks} className="flex flex-1 flex-col gap-4 px-6 py-5 animate-skeleton-in">
      {/* The heading, and its button at the far end. */}
      <div className="flex h-8 items-center gap-3">
        <SkeletonBar className="h-4 w-24" />
        <span className="flex-1" />
        <SkeletonBar className="h-8 w-24" />
      </div>
      {shape === 'cards' ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5">
          {Array.from({ length: 6 }, (_, i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          <div className="flex h-7 items-center gap-2">
            <SkeletonBar className="h-7 w-12" />
            <SkeletonBar className="h-7 w-16" />
            <SkeletonBar className="h-7 w-32" />
          </div>
          <SkeletonList rows={8} />
        </>
      )}
    </div>
  )
}

/** One text line's box, 20px, with a bar in it the height of the letters. */
function Line({ className }: { className?: string }) {
  return (
    <div className="flex h-5 items-center">
      <SkeletonBar className={cn('h-3.5', className)} />
    </div>
  )
}

/**
 * A project card's placeholder, line for line: the title, two lines of
 * description, the status line and the by-line with its face — the same
 * surface, padding and gaps as the card, so it is as tall as one (144px to
 * its 143: a line box here is 20px, a body line 19.6px).
 */
function ProjectCardSkeleton() {
  return (
    <Card fill="surface" className="flex flex-col gap-2 p-3">
      <Line className="w-1/2" />
      <div className="mb-1 flex flex-col">
        <Line className="w-full" />
        <Line className="w-3/4" />
      </div>
      <div className="flex h-3.5 items-center">
        <SkeletonBar className="h-3 w-1/3" />
      </div>
      <div className="flex h-4 items-center gap-1.5">
        <SkeletonBar className="size-4 shrink-0" />
        <SkeletonBar className="h-3 w-20" />
      </div>
    </Card>
  )
}
