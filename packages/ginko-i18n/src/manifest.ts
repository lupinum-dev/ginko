// `.nuxt/ginko-i18n/manifest.json` is the CLI's only input; the module writes it. Raise the version when
// its shape changes, so a CLI of another version refuses the file instead of misreading it. The module writes
// it with `satisfies Manifest` and the CLI reads this type, so a change of shape shows in both.
import type { LocaleInfo, Strategy } from './core/locales.ts'

export const MANIFEST_VERSION = 1

/** A message folder: a library's (namespaced), a layer's or the app's `i18n/`. */
export interface ManifestSource { dir: string, namespace?: string, origin: 'library' | 'layer' | 'app' }

export interface Manifest {
  version: typeof MANIFEST_VERSION
  rootDir: string
  locales: LocaleInfo[]
  defaultLocale: string
  strategy: Strategy
  params: Record<string, unknown>
  sources: ManifestSource[]
  srcDirs: string[]
}
