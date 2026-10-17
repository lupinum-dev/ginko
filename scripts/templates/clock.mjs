// Test clock for the template gates (spec TEMPLATES.md T10): `NODE_OPTIONS=--import=<this file>` with
// GINKO_TEST_NOW=<ISO instant> starts this process's clock at that instant. The clock keeps running, so timers and
// durations behave; only the start moves. `nuxt build`, the built server and create-ginko use it; the browser gets
// the same instant from Playwright's page.clock.install. Without GINKO_TEST_NOW it changes nothing.
const target = process.env.GINKO_TEST_NOW
if (target) {
  const RealDate = globalThis.Date
  const offset = RealDate.parse(target) - RealDate.now()
  if (Number.isNaN(offset)) throw new Error(`GINKO_TEST_NOW is not a date: "${target}"`)
  const now = () => RealDate.now() + offset
  // `new Date()` and `Date.now()` read the moved clock; `new Date(x)` is unchanged; `Date()` returns a string as usual.
  // Reflect.construct keeps `class X extends Date` working (new.target is X).
  function Date(...args) {
    if (!new.target) return new RealDate(now()).toString()
    return Reflect.construct(RealDate, args.length ? args : [now()], new.target)
  }
  Object.setPrototypeOf(Date, RealDate)
  Date.prototype = RealDate.prototype
  Date.now = now
  globalThis.Date = Date
}
