// Rules of the quiz: which option lists are valid and when an answer is right, plus the context the quiz shares with
// its questions.
import type { InjectionKey, Ref } from 'vue'

/** What <Quiz> gives its questions: they report whether they were answered right, and learn when to reset. */
export interface QuizContext {
  report: (position: number, correct: boolean) => void
  resetKey: Ref<number>
}
export const QUIZ_KEY: InjectionKey<QuizContext> = Symbol('ginko:quiz')

export type QuizMode = 'single' | 'multiple'
export interface QuizOption { text: string; correct: boolean }
/** Why a list of options is not a usable question; the component shows a text per reason. */
export type QuizProblem = 'count' | 'empty' | 'duplicate' | 'single' | 'multiple'

export type ParsedQuizOptions = { options: QuizOption[]; problem?: undefined } | { options: []; problem: QuizProblem }

/** Checks the options an author wrote (`- [x] right`, `- [ ] wrong`). Trims the texts. */
export function parseQuizOptions(items: readonly QuizOption[], mode: QuizMode): ParsedQuizOptions {
  const bad = (problem: QuizProblem): ParsedQuizOptions => ({ options: [], problem })
  if (items.length < 2) return bad('count')
  const options = items.map((o) => ({ text: o.text.trim(), correct: o.correct }))
  if (options.some((o) => !o.text)) return bad('empty')
  if (new Set(options.map((o) => o.text)).size !== options.length) return bad('duplicate')
  const right = options.filter((o) => o.correct).length
  if (mode === 'single' && right !== 1) return bad('single')
  if (mode === 'multiple' && right < 1) return bad('multiple')
  return { options }
}

/** Right only if exactly the correct options are chosen: a missed or an extra one is wrong. */
export function isCorrectAnswer(options: readonly QuizOption[], selected: ReadonlySet<number>): boolean {
  return options.every((o, i) => o.correct === selected.has(i))
}
