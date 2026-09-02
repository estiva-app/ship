import {
  BLOCK_DOCUMENT_FORMAT,
  blockDocumentToMarkerText,
  markerTextToBlockDocument,
  parseBlockDocument,
  serializeBlockDocument,
  type BlockDocument,
  type ContentFormat,
} from '@estiva-app/protocol'

/**
 * A description, between the two things it has to be — SPEC §13.
 *
 * On the wire it is a **block document**, because a block carries an id and an
 * id is what a comment anchors to (RFC 0.4 §6). In the editor it is **marker
 * text**, because the editor is a `<textarea>` and will be until somebody
 * designs a block editor. These two functions are that seam, and keeping them
 * here rather than in the pages means the conversion happens once each way.
 *
 * **Nothing published is rewritten.** A description that is marker text stays
 * marker text until a person edits it; only the save writes a document. That
 * is §13.4's model working as intended — the format belongs to the event, not
 * to the object, so a description can be an untagged root and a tagged change
 * at the same time.
 */

/** The previous document, when there is one to carry ids from. */
function previousDocument(value: string, format: ContentFormat): BlockDocument | undefined {
  if (format !== 'blocks') return undefined
  try {
    return parseBlockDocument(value)
  } catch {
    /*
      Tagged `blocks` and not a document. Returning `undefined` mints fresh ids
      rather than throwing, which loses anchors on a body that was already
      broken — the alternative is refusing the edit, which loses the edit.
    */
    return undefined
  }
}

/**
 * What the editor opens with.
 *
 * A body that is not a block document comes back untouched, which covers every
 * legacy description and is what §13.4 requires: no tag means marker text, and
 * a body that merely looks like JSON is still marker text.
 */
export function descriptionForEditing(value: string, format: ContentFormat): string {
  if (format !== 'blocks') return value
  try {
    return blockDocumentToMarkerText(parseBlockDocument(value))
  } catch {
    // Mis-tagged. Show the author what is actually stored rather than nothing.
    return value
  }
}

/**
 * What a save publishes: the edited text as a block document, carrying the
 * previous document's ids so anchored comments survive the edit.
 *
 * An empty description stays empty text rather than becoming an empty
 * document — there is nothing to address, and `{"type":"doc","content":[]}` in
 * a `value` tag would be a worse thing for another app to receive than "".
 */
export function descriptionForPublishing(
  next: string,
  current: string,
  currentFormat: ContentFormat,
): { value: string; contentFormat?: string } {
  if (next.trim() === '') return { value: '' }
  const document = markerTextToBlockDocument(next, previousDocument(current, currentFormat))
  return { value: serializeBlockDocument(document), contentFormat: BLOCK_DOCUMENT_FORMAT }
}
