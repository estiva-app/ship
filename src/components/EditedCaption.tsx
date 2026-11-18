/** Who edited a row's file last and when ("Katerina, 2h ago"), in its column on an initiative's page; hidden on a phone. */
export function EditedCaption({ edited }: { edited: string }) {
  return <span className="hidden w-32 shrink-0 truncate text-right text-caption text-text-muted sm:inline">{edited}</span>
}
