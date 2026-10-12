// English, short texts for the terminal. Pure: the commands print what these return.
import type { SchemaChange } from '../core/index.ts'

/** One block per rejected change: what is wrong, then the way to do it right. */
export function explainRejected(rejected: SchemaChange[]): string[] {
  const lines = ['The schema changes in a way that is not allowed:']
  for (const r of rejected) {
    lines.push(`  ✗ ${r.path}: ${r.message}`)
    if (r.fix) lines.push(`    → ${r.fix}`)
  }
  return lines
}

export function explainProblems(problems: string[]): string[] {
  return ['The release would not be accepted:', ...problems.map((p) => `  ✗ ${p}`)]
}

export function explainChanges(changes: SchemaChange[]): string[] {
  return changes.map((c) => `  + ${c.message}`)
}

export function kib(bytes: number): string {
  return `${Math.ceil(bytes / 1024)} KiB`
}
