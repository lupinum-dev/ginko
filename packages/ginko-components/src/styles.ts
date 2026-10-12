// The stylesheets of the components, in load order (later files may rely on the tokens of earlier ones). One list for
// module.ts (adds them to the Nuxt app) and scripts/build-registry.ts (joins them into the shadcn stylesheet item).
// `runtime/styles.css` is the same list as @imports, for hosts that are not a Nuxt app (for example the Studio).
export const STYLES = ['components.css', 'code.css', 'interactive.css', 'media.css', 'extra.css'] as const
