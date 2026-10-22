// Trailing slashes, without a regular expression: `/\/+$/` tries every start in a run of slashes, so a request path of
// 16,000 slashes kept the server busy for 0.4 s, and a longer one for seconds.

/** The text without its trailing slashes: `https://a.example/` is `https://a.example`, `///` is empty. */
export function withoutTrailingSlashes(text: string): string {
  let end = text.length
  while (end > 0 && text[end - 1] === '/') end--
  return text.slice(0, end)
}

/** A path without its trailing slashes, so `/alt/` and `/alt` compare equal; `/` (and `//`) stays `/`. */
export const trimPath = (path: string): string => (path.length > 1 ? withoutTrailingSlashes(path) || '/' : path)
