/** Pull a short live progress title from model prose. */
export function progressTitleFromText(text: string, maxLen = 72): string | null {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < 3) return null;

  // Prefer the first sentence / clause the model writes before tools.
  const match = cleaned.match(/^(.+?[.!?])(?:\s|$)/);
  let title = (match?.[1] ?? cleaned).trim();
  // Drop markdown bullets / bold wrappers that pollute the status line.
  title = title.replace(/^[*#>\-\d.)\s]+/, "").replace(/\*\*/g, "").trim();
  if (title.length < 3) return null;
  if (title.length > maxLen) {
    return `${title.slice(0, Math.max(1, maxLen - 1)).trimEnd()}…`;
  }
  return title;
}
