// `.nuxt/ginko-i18n/manifest.json` is the CLI's only input; the module writes it. Raise the version when
// its shape changes, so a CLI of another version refuses the file instead of misreading it.
export const MANIFEST_VERSION = 1
