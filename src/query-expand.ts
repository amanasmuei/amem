/**
 * Developer-domain query expansion: synonym mapping + basic stemming.
 * Used to improve keyword recall when embeddings are unavailable.
 */

const SYNONYM_MAP: Record<string, string[]> = {
  auth: ["authentication", "login", "session"],
  config: ["configuration", "settings"],
  test: ["testing", "spec"],
  db: ["database", "sql"],
  api: ["endpoint", "route"],
  deploy: ["deployment", "release"],
  error: ["exception", "bug"],
  cache: ["caching"],
  env: ["environment"],
  perf: ["performance", "optimization"],
  style: ["styling", "css"],
};

/**
 * Basic suffix stripping for common English suffixes.
 * Only applies to words longer than 4 characters.
 */
function basicStem(word: string): string {
  if (word.length <= 4) return word;

  // Order matters: try longer suffixes first
  if (word.endsWith("tion")) return word.slice(0, -4);
  if (word.endsWith("ment")) return word.slice(0, -4);
  if (word.endsWith("ness")) return word.slice(0, -4);
  if (word.endsWith("able")) return word.slice(0, -4);
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("ing")) return word.slice(0, -3);
  if (word.endsWith("es")) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);

  return word;
}

/**
 * Expand a query string into an array of terms including synonyms and stems.
 * Returns a deduplicated array of lowercase terms.
 */
export function expandQuery(query: string): string[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);

  const terms = new Set<string>();

  for (const word of words) {
    terms.add(word);

    // Add synonyms if available
    const synonyms = SYNONYM_MAP[word];
    if (synonyms) {
      for (const syn of synonyms) {
        terms.add(syn);
      }
    }

    // Apply stemming and add the stem
    const stem = basicStem(word);
    if (stem !== word) {
      terms.add(stem);
    }
  }

  return [...terms];
}
