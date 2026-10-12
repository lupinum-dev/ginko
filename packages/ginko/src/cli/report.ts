// English, short texts for the terminal. Pure: the commands print what these return.
import { coreMessage, type Msg, type SchemaChange } from '../core/index.ts'

/** A catalog message in English. Core messages carry German `message` text; the terminal shows the English one. */
export function english(m: Msg): string {
  return coreMessage('en', m.key, m.params)
}

/** One block per rejected change: what is wrong, then the way to do it right. */
export function explainRejected(rejected: SchemaChange[]): string[] {
  const lines = ['The schema changes in a way that is not allowed:']
  for (const r of rejected) {
    lines.push(`  ✗ ${r.path}: ${english(r)}`)
    const fix = r.fixMsg ? english(r.fixMsg) : r.fix
    if (fix) lines.push(`    → ${fix}`)
  }
  return lines
}

export function explainProblems(problems: string[]): string[] {
  return ['The release would not be accepted:', ...problems.map((p) => `  ✗ ${p}`)]
}

export function explainChanges(changes: SchemaChange[]): string[] {
  return changes.map((c) => `  + ${english(c)}`)
}

export function kib(bytes: number): string {
  return `${Math.ceil(bytes / 1024)} KiB`
}
