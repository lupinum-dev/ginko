// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import { tailwindClassesConfig } from './eslint.tailwind.mjs'

export default withNuxt(
  {
    // An optional TypeScript prop is `undefined` when not passed; a default for each would only repeat that.
    rules: { 'vue/require-default-prop': 'off' },
  },
  // A class Tailwind does not know is an error (tokens.css removes the default palette, scale, radii and shadows).
  tailwindClassesConfig,
)
