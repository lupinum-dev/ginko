import { inject, provide, type InjectionKey, type Ref } from 'vue'

/** Processing state of one upload: the server checks (and for photos, converts) a file after it arrives. */
export interface UploadState { status: 'processing' | 'ready' | 'failed'; error?: string }

/** What a ready upload offers the form: where to show it and the facts about the file. */
export interface UploadDetails {
  url: string; name: string; size: number; width: number | null; height: number | null
  /** The library's description per language: it applies wherever a field has none of its own. */
  alt?: Record<string, string>
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
