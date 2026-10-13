import { describe, expect, test } from 'vitest'
import { apiEntryId, groupParams, signatureTail } from '../src/runtime/components/api.utils.ts'
import { isCorrectAnswer, parseQuizOptions } from '../src/runtime/components/quiz.utils.ts'

const o = (text: string, correct = false) => ({ text, correct })

describe('quiz rules', () => {
  test.each([
    ['one option', [o('A', true)], 'single', 'count'],
    ['blank text', [o('A', true), o('  ')], 'single', 'empty'],
    ['same text twice', [o('A', true), o('A ')], 'single', 'duplicate'],
    ['single with two right', [o('A', true), o('B', true)], 'single', 'single'],
    ['single with none right', [o('A'), o('B')], 'single', 'single'],
    ['multiple with none right', [o('A'), o('B')], 'multiple', 'multiple'],
  ] as const)('%s is a problem', (_, items, type, problem) => {
    expect(parseQuizOptions(items, type).problem).toBe(problem)
  })

  test('valid options are trimmed; multiple allows one or more right', () => {
    expect(parseQuizOptions([o(' A ', true), o('B')], 'single').options).toEqual([o('A', true), o('B')])
    expect(parseQuizOptions([o('A', true), o('B', true)], 'multiple').problem).toBeUndefined()
  })

  test('an answer is right only when exactly the right options are chosen', () => {
    const opts = [o('A', true), o('B', true), o('C')]
    expect(isCorrectAnswer(opts, new Set([0, 1]))).toBe(true)
    expect(isCorrectAnswer(opts, new Set([0]))).toBe(false)
    expect(isCorrectAnswer(opts, new Set([0, 1, 2]))).toBe(false)
    expect(isCorrectAnswer(opts, new Set())).toBe(false)
  })
})

describe('api helpers', () => {
  test('signature: ?, type and default in order', () => {
    expect(signatureTail({ type: 'number', defaultValue: '20' })).toBe(': number = 20')
    expect(signatureTail({ type: 'string' })).toBe(': string')
    expect(signatureTail({})).toBe('')
  })

  test('deep-link ids are slugs of group and name', () => {
    expect(apiEntryId('Query', 'page_size')).toBe('api-query-page-size')
    expect(apiEntryId('Antwort 200', '--pm')).toBe('api-antwort-200-pm')
  })

  test('groups keep the order of first appearance', () => {
    expect(groupParams(['Query', 'Body', 'Query'])).toEqual([{ label: 'Query', indexes: [0, 2] }, { label: 'Body', indexes: [1] }])
  })
})
