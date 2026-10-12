// File-type icons for Files, CodeTree and code labels. Only the multicolour brand marks live here (Iconify `logos`
// set, CC0); every single-colour glyph is a Lucide icon in icons.ts, so each icon has one home.
import type { IconName } from './icons'

export interface BrandMark { viewBox: string; body: string }
export const BRAND_MARKS = {
  typescript: { viewBox: '0 0 256 256', body: "<path fill=\"#3178c6\" d=\"M20 0h216c11.046 0 20 8.954 20 20v216c0 11.046-8.954 20-20 20H20c-11.046 0-20-8.954-20-20V20C0 8.954 8.954 0 20 0\"/><path fill=\"#fff\" d=\"M150.518 200.475v27.62q6.738 3.453 15.938 5.179T185.849 235q9.934 0 18.874-1.899t15.678-6.257q6.738-4.359 10.669-11.394q3.93-7.033 3.93-17.391q0-7.51-2.246-13.163a30.8 30.8 0 0 0-6.479-10.055q-4.232-4.402-10.149-7.898t-13.347-6.602q-5.442-2.245-9.761-4.359t-7.342-4.316q-3.024-2.2-4.665-4.661t-1.641-5.567q0-2.848 1.468-5.135q1.469-2.288 4.147-3.927t6.565-2.547q3.887-.906 8.638-.906q3.456 0 7.299.518q3.844.517 7.732 1.597a54 54 0 0 1 7.558 2.719a41.7 41.7 0 0 1 6.781 3.797v-25.807q-6.306-2.417-13.778-3.582T198.633 107q-9.847 0-18.658 2.115q-8.811 2.114-15.506 6.602q-6.694 4.49-10.582 11.437Q150 134.102 150 143.769q0 12.342 7.127 21.06t21.638 14.759a292 292 0 0 1 10.625 4.575q4.924 2.244 8.509 4.66t5.658 5.265t2.073 6.474a9.9 9.9 0 0 1-1.296 4.963q-1.295 2.287-3.93 3.97t-6.565 2.632t-9.2.95q-8.983 0-17.794-3.151t-16.327-9.451m-46.036-68.733H140V109H41v22.742h35.345V233h28.137z\"/>" },
  javascript: { viewBox: '0 0 256 256', body: "<path fill=\"#f7df1e\" d=\"M0 0h256v256H0z\"/><path d=\"m67.312 213.932l19.59-11.856c3.78 6.701 7.218 12.371 15.465 12.371c7.905 0 12.89-3.092 12.89-15.12v-81.798h24.057v82.138c0 24.917-14.606 36.259-35.916 36.259c-19.245 0-30.416-9.967-36.087-21.996m85.07-2.576l19.588-11.341c5.157 8.421 11.859 14.607 23.715 14.607c9.969 0 16.325-4.984 16.325-11.858c0-8.248-6.53-11.17-17.528-15.98l-6.013-2.58c-17.357-7.387-28.87-16.667-28.87-36.257c0-18.044 13.747-31.792 35.228-31.792c15.294 0 26.292 5.328 34.196 19.247l-18.732 12.03c-4.125-7.389-8.591-10.31-15.465-10.31c-7.046 0-11.514 4.468-11.514 10.31c0 7.217 4.468 10.14 14.778 14.608l6.014 2.577c20.45 8.765 31.963 17.7 31.963 37.804c0 21.654-17.012 33.51-39.867 33.51c-22.339 0-36.774-10.654-43.819-24.574\"/>" },
  vue: { viewBox: '0 0 256 221', body: "<path fill=\"#41b883\" d=\"M204.8 0H256L128 220.8L0 0h97.92L128 51.2L157.44 0z\"/><path fill=\"#41b883\" d=\"m0 0l128 220.8L256 0h-51.2L128 132.48L50.56 0z\"/><path fill=\"#35495e\" d=\"M50.56 0L128 133.12L204.8 0h-47.36L128 51.2L97.92 0z\"/>" },
  nuxt: { viewBox: '0 0 256 168', body: "<path fill=\"#00dc82\" d=\"M143.618 167.029h95.166c3.023 0 5.992-.771 8.61-2.237a16.96 16.96 0 0 0 6.302-6.115a16.3 16.3 0 0 0 2.304-8.352c0-2.932-.799-5.811-2.312-8.35L189.778 34.6a16.97 16.97 0 0 0-6.301-6.113a17.6 17.6 0 0 0-8.608-2.238c-3.023 0-5.991.772-8.609 2.238a16.96 16.96 0 0 0-6.3 6.113l-16.342 27.473l-31.95-53.724a17 17 0 0 0-6.304-6.112A17.64 17.64 0 0 0 96.754 0c-3.022 0-5.992.772-8.61 2.237a17 17 0 0 0-6.303 6.112L2.31 141.975a16.3 16.3 0 0 0-2.31 8.35c0 2.932.793 5.813 2.304 8.352a16.96 16.96 0 0 0 6.302 6.115a17.6 17.6 0 0 0 8.61 2.237h59.737c23.669 0 41.123-10.084 53.134-29.758l29.159-48.983l15.618-26.215l46.874 78.742h-62.492zm-67.64-26.24l-41.688-.01L96.782 35.796l31.181 52.492l-20.877 35.084c-7.976 12.765-17.037 17.416-31.107 17.416\"/>" },
} as const satisfies Record<string, BrandMark>

type BrandName = keyof typeof BRAND_MARKS
/** A brand mark (own colours, own viewBox) or the name of a Lucide icon in icons.ts. */
export type FileIcon = BrandMark | { name: IconName }

const BY_NAME: Record<string, BrandName | IconName> = {
  'nuxt.config.ts': 'nuxt', 'nuxt.config.js': 'nuxt', 'package.json': 'package',
  'pnpm-lock.yaml': 'package', 'pnpm-workspace.yaml': 'package', 'tsconfig.json': 'file-cog', '.gitignore': 'git-branch',
  '.env': 'file-key', '.env.example': 'file-key', 'vite.config.ts': 'zap', 'vite.config.js': 'zap',
}
const BY_EXTENSION: Record<string, BrandName | IconName> = {
  ts: 'typescript', mts: 'typescript', cts: 'typescript', js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  vue: 'vue', json: 'braces', css: 'braces', scss: 'braces', html: 'code-xml', md: 'file-text', mdc: 'file-text',
  txt: 'file-text', yaml: 'file-cog', yml: 'file-cog', toml: 'file-cog', csv: 'table', sh: 'terminal',
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', svg: 'image', avif: 'image', gif: 'image',
}
const BY_LANGUAGE: Record<string, BrandName | IconName> = {
  typescript: 'typescript', javascript: 'javascript', markdown: 'file-text', jsonc: 'braces', yaml: 'file-cog',
}

/** The icon of a file name (`nuxt.config.ts`, `app/app.vue`) or a code language (`ts`, `vue`); undefined if none fits. */
export function fileIcon(name: string | undefined): FileIcon | undefined {
  if (!name) return undefined
  const base = name.split('/').pop()!.toLowerCase()
  const key = BY_NAME[base] ?? BY_LANGUAGE[base] ?? BY_EXTENSION[base.includes('.') ? base.split('.').pop()! : base]
  if (!key) return undefined
  return key in BRAND_MARKS ? BRAND_MARKS[key as BrandName] : { name: key as IconName }
}

const SHELL = new Set(['bash', 'sh', 'shell', 'zsh', 'console', 'powershell', 'ps1', 'cmd', 'bat'])

/**
 * Label and icon of a code block: its filename, else "Terminal" for shell code, else its language.
 * `file` names the file or language for a type icon (see CodeIcon).
 */
export function codeLabel(props: { language?: string; filename?: string }, terminal: string): { text: string; icon: 'terminal' | 'file-code'; file?: string } {
  const shell = SHELL.has((props.language ?? '').toLowerCase())
  return { text: props.filename || (shell ? terminal : props.language ?? ''), icon: shell ? 'terminal' : 'file-code', file: shell ? undefined : props.filename || props.language }
}
