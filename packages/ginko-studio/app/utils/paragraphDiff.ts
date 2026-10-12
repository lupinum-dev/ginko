// Which paragraphs of a long text were removed or added (UI.md 10.5: "changed paragraphs only").
// A paragraph is a non-empty line; a reworded paragraph shows as one removed and one added.

export interface ParagraphChange { kind: 'removed' | 'added'; text: string }

const paragraphsOf = (text: string): string[] => text.split(/\n+/).map((p) => p.trim()).filter(Boolean)

/** Removed and added paragraphs in reading order (longest common subsequence keeps the unchanged ones out). */
export function paragraphDiff(before: string, after: string): ParagraphChange[] {
  const a = paragraphsOf(before)
  const b = paragraphsOf(after)
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }
  const out: ParagraphChange[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i++; j++ }
    else if (j >= b.length || (i < a.length && lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) out.push({ kind: 'removed', text: a[i++]! })
    else out.push({ kind: 'added', text: b[j++]! })
  }
  return out
}
