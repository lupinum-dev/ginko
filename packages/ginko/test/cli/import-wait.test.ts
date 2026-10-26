import { afterEach, describe, expect, it, vi } from 'vitest'
import { waitForUploads } from '../../src/cli/import.ts'
import { CliError } from '../../src/cli/model.ts'

afterEach(() => vi.useRealTimers())

/** A fake `seed:importUploads`: each call returns the next state. */
function source(states: { processing: number; ready: number; failed: number; failedFiles: { name: string; error: string }[] }[]) {
  let i = 0
  return async (fn: string) => {
    expect(fn).toBe('seed:importUploads')
    return states[Math.min(i++, states.length - 1)]
  }
}

describe('waitForUploads', () => {
  it('polls until nothing is processing and returns when all are ready', async () => {
    vi.useFakeTimers()
    const logs: string[] = []
    const run = source([
      { processing: 2, ready: 0, failed: 0, failedFiles: [] },
      { processing: 1, ready: 1, failed: 0, failedFiles: [] },
      { processing: 0, ready: 2, failed: 0, failedFiles: [] },
    ])
    const done = waitForUploads({ run, log: (line) => logs.push(line) }, 'linde', ['a', 'b'])
    await vi.advanceTimersByTimeAsync(4_000)
    await expect(done).resolves.toBeUndefined()
    expect(logs).toEqual(['Processing images: 0/2 ready', 'Processing images: 1/2 ready', 'Processing images: 2/2 ready'])
  })

  it('fails with the failed file and a next step when one image failed', async () => {
    vi.useFakeTimers()
    const run = source([
      { processing: 1, ready: 1, failed: 0, failedFiles: [] },
      { processing: 0, ready: 1, failed: 1, failedFiles: [{ name: 'broken.png', error: 'errors.uploadWrongContent' }] },
    ])
    const done = waitForUploads({ run, log: () => {}, again: 'pnpm local:import x' }, 'linde', ['a', 'b'])
    const result = done.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(2_000)
    const error = await result
    expect(error).toBeInstanceOf(CliError)
    expect((error as CliError).message).toBe([
      '1 of 2 images are ready; 1 are not usable:',
      '  ✗ broken.png: errors.uploadWrongContent',
      'Run the import again (pnpm local:import x), or upload these files again in the Studio (Files). Raise the wait with --wait-timeout <seconds> if the images only need more time.',
    ].join('\n'))
  })

  it('reports images that are still processing at the timeout', async () => {
    vi.useFakeTimers()
    const run = source([{ processing: 1, ready: 0, failed: 0, failedFiles: [] }])
    const result = waitForUploads({ run, log: () => {}, waitTimeoutMs: 5_000 }, 'linde', ['a']).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(((await result) as CliError).message).toContain('1 image is still processing after 5 s.')
  })
})
