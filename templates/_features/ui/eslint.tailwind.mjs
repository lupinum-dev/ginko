// @ts-check
// Lint rule shared by every template: a class Tailwind does not know is an error.
// tokens.css switches off Tailwind's default palette, type scale, radii and shadows, so a class such as `text-sm`,
// `shadow-lg` or `bg-red-500` generates no CSS and does nothing. Without this rule that mistake is silent.
// Tailwind reads the template's CSS entry (the same file the build uses), so a new token is known at once.
import betterTailwind from 'eslint-plugin-better-tailwindcss'

/**
 * Classes that are not Tailwind on purpose. Each one is a hook for a stylesheet, a script or the print layout.
 * The plugin treats every entry as an unanchored regular expression, so each one must be anchored (`^name$`):
 * a bare 'dark' would also skip `dark:bg-red-500`. Keep this list short; never add a real pattern.
 */
const allowedClasses = [
  // Plain CSS classes written in tokens.css (not Tailwind utilities).
  '^prose$', // ProseBody: the reading column and the styles for rendered Markdown
  '^surface-primary$', // BlockCta: a band in the accent colour that swaps text, buttons and focus ring
  // Not a style at all: the colour-mode class. Tailwind's `dark:` variant reads it, so the lightbox sets it on
  // itself to stay dark in light mode.
  '^dark$',
]

export const tailwindClassesConfig = {
  name: 'ginko/unknown-tailwind-classes',
  files: ['app/**/*.vue', 'app/**/*.ts'],
  plugins: { 'better-tailwindcss': betterTailwind },
  settings: {
    'better-tailwindcss': { entryPoint: 'app/assets/css/main.css' },
  },
  rules: {
    'better-tailwindcss/no-unknown-classes': ['error', { ignore: allowedClasses }],
  },
}
