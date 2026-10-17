// Which parts of a long text were removed or added (UI.md 10.5: "changed paragraphs only"). One sequence diff for
// plain text (a paragraph is a non-empty line) and for Markdown (a block of the parsed text, see markdownDiff.ts).
// A reworded part shows as one removed and one added.

export interface SequenceChange<T> { kind: 'removed' | 'added'; item: T }

/** Removed and added items in reading order, compared by `key` (longest common subsequence keeps the unchanged ones out). */
export function sequenceDiff<T>(before: readonly T[], after: readonly T[], key: (item: T) => string): SequenceChange<T>[] {
  const a = before.map(key)
  const b = after.map(key)
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }
  const out: SequenceChange<T>[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i++; j++ }
    else if (j >= b.length || (i < a.length && lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) out.push({ kind: 'removed', item: before[i++]! })
    else out.push({ kind: 'added', item: after[j++]! })
  }
  return out
}

export interface ParagraphChange { kind: 'removed' | 'added'; text: string }

const paragraphsOf = (text: string): string[] => text.split(/\n+/).map((p) => p.trim()).filter(Boolean)

/** Removed and added paragraphs of a plain text in reading order. */
export function paragraphDiff(before: string, after: string): ParagraphChange[] {
  return sequenceDiff(paragraphsOf(before), paragraphsOf(after), (p) => p).map(({ kind, item }) => ({ kind, text: item }))
}
