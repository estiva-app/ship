/**
 * What another app's object is called on its chip — PRO-24.
 *
 * Miky, 2026-10-02: an object is labelled by its type ("Topic", "Page"), not by
 * an app name. The app name is said only where a link goes ("Open in Peek"),
 * and stands in here only when the object's app declares no noun. The noun is
 * the owner's — or, for a file nobody owns, the opening app's `fileNoun` —
 * lower case and singular, so it is capitalised for a label.
 *
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-file-is-labelled-by-its-type-not-its-app.md
 */
export function typeLabelOf(object: { noun?: string; appName?: string }): string | undefined {
  return object.noun ? object.noun.charAt(0).toUpperCase() + object.noun.slice(1) : object.appName
}

/** "this topic", or "this Peek object" when the app declares no noun, or "this object". */
export function thisObject(object: { noun?: string; appName?: string }): string {
  if (object.noun) return `this ${object.noun}`
  return object.appName ? `this ${object.appName} object` : 'this object'
}
