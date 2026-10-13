export const NOTES_MAX_LENGTH = 4000;
export class NotesValidationError extends Error {}

export function parseNotes(value: unknown, label = "Notes"): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new NotesValidationError(`${label} must be text`);
  const notes = value.trim();
  if (notes.length > NOTES_MAX_LENGTH) {
    throw new NotesValidationError(`${label} must be ${NOTES_MAX_LENGTH} characters or fewer`);
  }
  return notes || null;
}
