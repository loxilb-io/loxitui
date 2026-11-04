/**
 * Text search utilities for panel filtering and highlighting
 */

/**
 * Check if text matches the search query (case-insensitive substring match)
 * @param text - The text to search in
 * @param query - The search query
 * @returns true if the query is found in the text (case-insensitive), or if query is empty
 */
export function matchesSearch(text: string, query: string): boolean {
  if (!query || query.trim() === "") return true;
  return text.toLowerCase().includes(query.toLowerCase());
}

/**
 * @deprecated Use filterBySearch instead - highlighting removed in favor of filter-only approach
 * Highlight matching text with ANSI escape codes for terminal rendering
 * Uses background color to highlight matches
 * @param text - The text to highlight
 * @param query - The search query to highlight
 * @returns Text with ANSI codes wrapping matched portions, or original text if no query
 */
export function highlightMatches(text: string, query: string): string {
  if (!query || query.trim() === "") return text;

  const normalizedQuery = query.toLowerCase();
  const normalizedText = text.toLowerCase();

  let result = "";
  let lastIndex = 0;
  let index = normalizedText.indexOf(normalizedQuery);

  // ANSI escape codes: \x1b[43m (yellow background), \x1b[30m (black text), \x1b[0m (reset)
  const highlightStart = "\x1b[43m\x1b[30m";
  const highlightEnd = "\x1b[0m";

  while (index !== -1) {
    // Add text before match
    result += text.slice(lastIndex, index);
    // Add highlighted match
    result += highlightStart + text.slice(index, index + query.length) + highlightEnd;
    lastIndex = index + query.length;
    index = normalizedText.indexOf(normalizedQuery, lastIndex);
  }

  // Add remaining text
  result += text.slice(lastIndex);

  return result;
}

/**
 * Check if any of the provided texts match the search query
 * @param query - The search query
 * @param texts - Array of text strings to search in
 * @returns true if any text matches the query
 */
export function matchesAny(
  query: string,
  ...texts: (string | number | null | undefined)[]
): boolean {
  if (!query || query.trim() === "") return true;

  return texts.some((text) => {
    if (text === null || text === undefined) return false;
    return matchesSearch(String(text), query);
  });
}

/**
 * Filter result with metadata
 */
export interface FilterResult<T> {
  filtered: T[];
  matchCount: number;
  totalCount: number;
}

/**
 * Filter an array based on a search query with match tracking
 * @param data - Array to filter
 * @param query - Search query string
 * @param matcher - Function to determine if an item matches the query
 * @returns Object containing filtered array and match counts
 */
export function filterBySearch<T>(
  data: T[],
  query: string,
  matcher: (item: T, query: string) => boolean
): FilterResult<T> {
  const totalCount = data.length;

  if (!query || query.trim() === "") {
    return {
      filtered: data,
      matchCount: totalCount,
      totalCount,
    };
  }

  const filtered = data.filter((item) => matcher(item, query));

  return {
    filtered,
    matchCount: filtered.length,
    totalCount,
  };
}
