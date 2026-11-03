import { Card, PageHeader, Panel, SkeletonConversation } from '@estiva-app/ui'
import { cn } from '@/lib/cn'
import { Centred } from '@/components/layout/ReadingColumn'
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
 * - `issue` — one issue, as its page draws it since ONE-6 (step 4e): the
 *   kit's PageHeader with the trail, then the title, the summary, the
 *   fields' pills and the description, and the comments column beside it,
 *   the kit's own placeholder under "Comments". It was the trail, the title,
 *   rows and the rail.
 * - `project` — one project: the same, with its tabs under the header.
 * - `rows` — rows alone, for any other route (an inbound reference while
 *   the workspace loads). A Folder is not here: it does not wait for the
 *   workspace, and draws its own rows while its files load.
 *
 * Revealed after 150ms, as the list is, so a fast read never flashes it.
 */
export type PageSkeletonShape = 'cards' | 'list' | 'issue' | 'project' | 'rows'

/** A page in the shape it will arrive in, while the workspace's first read is in flight. */
export function PageSkeleton({ shape }: { shape: PageSkeletonShape }) {
  // `data-loading` is what a test waits on; the shape rides beside it.
  const marks = { 'data-loading': 'workspace', 'data-shape': shape, 'aria-hidden': true } as const

  if (shape === 'issue' || shape === 'project') {
    return (
      <div {...marks} className="flex min-h-0 flex-1 animate-skeleton-in">
        {/* The page's column as IssueView and ProjectView lay it out: the header, the tabs on a project, then the
            reading column 16px apart. */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <PageHeader title={<SkeletonBar className="h-3.5 w-40" />} />
          {shape === 'project' && (
            <div className="flex min-h-8 items-center gap-1 px-6">
              <SkeletonBar className="h-7 w-20" />
              <SkeletonBar className="h-7 w-14" />
            </div>
          )}
          <div className="px-6">
            <Centred>
              {/* The title, and the summary 4px under it: each bar on a line of the text's own size, so each is as
                  tall as what replaces it. */}
              <div className="flex flex-col gap-1">
                <div className="py-1 text-h1">
                  <span className="inline-block w-2/3 align-middle">
                    <SkeletonBar className="h-6" />
                  </span>
                </div>
                <div className="py-1 text-body-1">
                  <span className="inline-block w-1/2 align-middle">
                    <SkeletonBar className="h-4" />
                  </span>
                </div>
              </div>
              {/* The fields' pills: status, who, and the project on an issue. */}
              <div className="flex h-6 items-center gap-2">
                {(shape === 'issue' ? ['w-28', 'w-28', 'w-36'] : ['w-28', 'w-28']).map((width, i) => (
                  <SkeletonBar key={i} shape="round" className={cn('h-6', width)} />
                ))}
              </div>
              <div className="flex flex-col py-1">
                <Line className="w-full" />
                <Line className="w-11/12" />
                <Line className="w-2/3" />
              </div>
            </Centred>
          </div>
        </div>
        {/* The comments column the page opens with, 384px beside it under the kit's header, which lines up with the
            page's: the kit's own placeholder for comments, as the column draws it while they are read. */}
        <div className="flex shrink-0 flex-col border-l border-border-default">
          <Panel title="Comments" className="min-h-0 w-96 flex-1" bodyClassName="p-3">
            <SkeletonConversation />
          </Panel>
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
