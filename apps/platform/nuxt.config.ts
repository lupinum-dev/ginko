// The platform host: all code lives in the layer (UI) and in @lupinum/ginko-server (Convex, see packages/ginko-server/convex.json).
export default defineNuxtConfig({
  extends: ['@lupinum/ginko-studio'],
  // Playwright writes sessions and traces here during a run; watching them reloaded open pages mid-test.
  ignore: ['e2e/**', 'test-results/**', 'playwright-report/**'],
})
