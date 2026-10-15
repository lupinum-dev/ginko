// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  // An optional TypeScript prop is `undefined` when not passed; a default for each would only repeat that.
  rules: { 'vue/require-default-prop': 'off' },
})
