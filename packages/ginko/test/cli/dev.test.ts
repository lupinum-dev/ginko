import { describe, expect, it } from 'vitest'
import { knownTargetError, localDeploymentError, parseOutput } from '../../src/cli/local.ts'

describe('localDeploymentError', () => {
  it.each([
    ['anonymous deployment', { deployment: 'anonymous-agent', url: 'http://127.0.0.1:3210' }, undefined],
    ['anonymous deployment without url', { deployment: 'anonymous-agent' }, undefined],
    ['localhost url without deployment', { url: 'http://localhost:3210' }, undefined],
    ['cloud deployment chosen by the Convex CLI', { deployment: 'dev:review-cloud-example', url: 'https://review.convex.cloud' }, 'dev:review-cloud-example'],
    ['cloud deployment with a local-looking url', { deployment: 'dev:review-cloud-example', url: 'http://127.0.0.1:3210' }, 'dev:review-cloud-example'],
    ['nothing selected', {}, 'is not confirmed'],
    ['remote url without deployment', { url: 'https://review.convex.cloud' }, 'is not local'],
    ['unparsable url without deployment', { url: 'not a url' }, 'is not local'],
    // Astra 9: the Convex CLI prefers a deploy key over CONVEX_DEPLOYMENT, so the anonymous name proves nothing then.
    ['anonymous deployment but a deploy key is set', { deployment: 'anonymous-agent', cloudKeys: ['CONVEX_DEPLOY_KEY'] }, 'CONVEX_DEPLOY_KEY is set'],
  ])('%s', (_name, target, expected) => {
    const problem = localDeploymentError(target)
    if (expected === undefined) expect(problem).toBeUndefined()
    else expect(problem).toContain(expected)
  })
})

describe('knownTargetError (the check before `convex dev` starts)', () => {
  it.each([
    ['a fresh checkout has no target yet', {}, undefined],
    ['empty values are no target', { deployment: ' ', url: '' }, undefined],
    ['anonymous deployment', { deployment: 'anonymous-agent' }, undefined],
    ['cloud deployment', { deployment: 'dev:something-cloud' }, 'dev:something-cloud'],
    ['remote url', { url: 'https://review.convex.cloud' }, 'is not local'],
    ['a fresh checkout with a deploy key in the shell', { cloudKeys: ['CONVEX_DEPLOY_KEY'] }, 'CONVEX_DEPLOY_KEY is set'],
  ])('%s', (_name, target, expected) => {
    const problem = knownTargetError(target)
    if (expected === undefined) expect(problem).toBeUndefined()
    else expect(problem).toContain(expected)
  })
})

describe('parseOutput', () => {
  it.each([
    ['an object', '{"done":true}\n', { done: true }],
    ['a pretty-printed object after progress lines', 'Provisioning…\n{\n  "done": false\n}\n', { done: false }],
    ['a string result', '"http://127.0.0.1:3211/api/storage/upload?token=abc"\n', 'http://127.0.0.1:3211/api/storage/upload?token=abc'],
    ['a string result after progress lines', 'Provisioning…\n"http://127.0.0.1:3211/x"\n', 'http://127.0.0.1:3211/x'],
    ['no JSON', 'nothing here', undefined],
  ])('%s', (_name, output, expected) => {
    expect(parseOutput(output)).toEqual(expected)
  })
})
