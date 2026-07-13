/**
 * Utility functions for parsing markdown-based knowledge files.
 *
 * Used by multiple handler domains (workflow context, knowledge,
 * plugins) to extract structured data from `.codestudio/knowledge/`
 * markdown files.
 */

/** Extract comma-separated values after the colon in a line. */
export function extractListValues(line: string): string[] {
  const after = line.split(':').slice(1).join(':').trim();
  return after
    .split(/[,;]/)
    .map((s) => s.trim().replace(/^[*_`]+|[*_`]+$/g, ''))
    .filter(Boolean);
}

/** Extract a single value after the colon in a line. */
export function extractSingleValue(line: string): string | null {
  const after = line
    .split(':')
    .slice(1)
    .join(':')
    .trim()
    .replace(/^[*_`]+|[*_`]+$/g, '');
  return after || null;
}

/** Extract comma/space-separated values from a markdown line like "Languages: TypeScript, Python". */
export function extractListFromLine(line: string): string[] {
  const parts = line.split(':');
  if (parts.length < 2) return [];
  return parts
    .slice(1)
    .join(':')
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
