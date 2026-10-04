export const ESTIMATE_NOTES_MAX_LENGTH = 4000;

export function parseEstimateNotes(value: unknown, label = "Estimate notes"): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error(`${label} must be text`);
  const notes = value.trim();
  if (notes.length > ESTIMATE_NOTES_MAX_LENGTH) {
    throw new Error(`${label} must be ${ESTIMATE_NOTES_MAX_LENGTH} characters or fewer`);
  }
  return notes || null;
}
