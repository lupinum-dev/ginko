import { describe, expect, it } from 'vitest'
import { realRunner } from '../../src/cli/platform-run.ts'

// Wrong behaviour caught: setup reads the Convex teams from `npx convex login status`, which prints them on stderr; a
// runner that returns stdout only makes every account look like it has no team.
describe('realRunner', () => {
  const program = ['-e', 'process.stdout.write("out\\n"); process.stderr.write("  - Team (team)\\n")']
  it.each([
    [false, 'out\n'],
    [true, 'out\n  - Team (team)\n'],
  ])('stderr: %s returns %j', async (stderr, expected) => {
    expect(await realRunner({ command: process.execPath, args: program, cwd: process.cwd(), stderr })).toBe(expected)
  })
})
