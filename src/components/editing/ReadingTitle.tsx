/** A page's title as text, where the title editor would stand: for a reader, and before the editors arrive. */
export function ReadingTitle({ title, placeholder }: { title: string; placeholder: string }) {
  // No "Archived" chip beside the title: the Archived notice above it says so in words (Katerina, 30 September).
  return <h1 className={title ? '-mx-2 px-2 py-1 text-h2 text-text-primary' : '-mx-2 px-2 py-1 text-h2 text-text-muted'}>{title || placeholder}</h1>
}
