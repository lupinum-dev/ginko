// Test stand-in for the generated '#convex/api': `api.entries.whyNotPublic` is the string "entries.whyNotPublic",
// so tests that replace the Convex composables can tell which function a component asked for.
const path = (names: string[]): unknown => new Proxy(() => undefined, {
  get: (_target, name) => (name === Symbol.toPrimitive || name === 'toString' ? () => names.join('.') : path([...names, String(name)])),
})
export const api = path([]) as Record<string, Record<string, string>>
