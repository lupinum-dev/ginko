import { fileRefOf } from '@lupinum/ginko/internal'
import { inject, provide, reactive, ref, watch, type InjectionKey, type Ref } from 'vue'

/** Processing state of one upload: the server checks (and for photos, converts) a file after it arrives. */
export interface UploadState { status: 'processing' | 'ready' | 'failed'; error?: string }

/** What a ready upload offers the form: where to show it and the facts about the file. */
export interface UploadDetails {
  url: string; name: string; size: number; width: number | null; height: number | null
  /** The library's description per language: it applies wherever a field has none of its own. */
  alt?: Record<string, string>
  /** The focus point set in Files (0..1 from the top left): a crop keeps it in view. */
  focus?: { x: number; y: number }
  /** In the trash: a field keeps showing it, but a text may not name it (the save refuses), so a text shows it as missing. */
  trashed?: true
}

/**
 * How image and file fields reach the host's storage. The host knows its site and its backend;
 * the fields only ask for state, details and uploads.
 */
export interface GinkoAssets {
  /** Live processing state of one upload; undefined while unknown or when id is undefined. */
  state(id: Ref<string | undefined>): Ref<UploadState | undefined>
  /**
   * Live details (URL and file facts) for uploaded files; undefined while loading. An id that is
   * not ready or not this site's maps to null.
   */
  details(ids: Ref<string[]>): Ref<Record<string, UploadDetails | null> | undefined>
  /** Uploads a file and resolves with its id. Rejects when `signal` aborts. */
  upload(kind: 'image' | 'file', file: File, signal: AbortSignal): Promise<string>
}

export const GINKO_ASSETS: InjectionKey<GinkoAssets> = Symbol('ginko:assets')

/** Call once in a parent of the forms. */
export function provideGinkoAssets(assets: GinkoAssets): void { provide(GINKO_ASSETS, assets) }

export function useGinkoAssets(): GinkoAssets {
  const assets = inject(GINKO_ASSETS, undefined)
  if (!assets) throw new Error('[ginko-editor] provideGinkoAssets(...) fehlt: Bild- und Dateifelder brauchen einen Upload-Adapter.')
  return assets
}

/**
 * The library files that the pictures of one Markdown editor name (`![Hund]($file.k57…)`): the text keeps the
 * reference, the editor shows the file. One query for all of them.
 */
export interface FileImages {
  /** Starts loading the file of a `$file.<id>` source; any other source needs nothing. Call it outside a computed. */
  want(src: string): void
  /**
   * The file of a `$file.<id>` source (reactive): undefined while it loads and for any other source, null when the
   * library has no ready file with this ID or the file is in the trash.
   */
  file(src: string): UploadDetails | null | undefined
  /** The text in place of a file the library does not have, in the UI language. */
  missingText(): string
}

/** Call once per editor, in setup. Files once seen stay known, so a picture does not flicker while a new one loads. */
export function useFileImages(assets: GinkoAssets, missingText: () => string): FileImages {
  const ids = ref<string[]>([])
  const details = assets.details(ids)
  const known = reactive<Record<string, UploadDetails | null>>(Object.create(null))
  watch(details, (next) => { if (next) Object.assign(known, next) }, { immediate: true })
  return {
    want(src) {
      const id = fileRefOf(src)
      if (id && !ids.value.includes(id)) ids.value = [...ids.value, id]
    },
    file(src) {
      const id = fileRefOf(src)
      // `in`, not Object.hasOwn: Vue tracks `in` on a reactive object, so a file that arrives later is seen.
      if (id === undefined || !(id in known)) return undefined
      return known[id]?.trashed ? null : known[id]
    },
    missingText,
  }
}
