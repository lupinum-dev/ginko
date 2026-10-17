// What the editor parts share without props: the site's component registry, and a tick for toolbar state.
import type { ComponentRegistry } from '@lupinum/ginko/internal'
import type { FileImages } from '@lupinum/ginko-editor'
import type { Editor } from '@tiptap/core'
import { useI18n } from '#imports'
import { reactive, ref, watch, type InjectionKey, type Ref } from 'vue'

/**
 * Provided once per site (the layout) or entry form: the component registry of the schema, as a getter.
 * Without it, no component appears in the slash menu.
 */
export const EDITOR_COMPONENTS: InjectionKey<() => ComponentRegistry | undefined> = Symbol('ginko:editor-components')

/**
 * Provided once per site (the layout): what a link can point to on the site itself. `pages`: the static pages with
 * their path per language; `routed`: the collections whose entries have their own page. Picked targets are stored as
 * route links (`$page.<key>`, `$<brick>.<entry id>`), which the site turns into the page address of each language.
 */
export interface LinkTargets { pages: Record<string, Partial<Record<string, string>>>; routed: string[] }
export const EDITOR_LINK_TARGETS: InjectionKey<() => LinkTargets | undefined> = Symbol('ginko:editor-link-targets')

/** Provided by a Markdown editor for its parts (component settings): the library files of its pictures, and the language of the text. */
export interface EditorFiles { images: FileImages; locale: () => string }
export const EDITOR_FILES: InjectionKey<EditorFiles> = Symbol('ginko:editor-files')

/** Rises after every transaction of `editor`; read it inside a computed to make it follow the selection. */
export function useEditorTick(editor: () => Editor | undefined): Ref<number> {
  const tick = ref(0)
  watch(editor, (current, _before, onCleanup) => {
    if (!current) return
    const bump = () => { tick.value++ }
    current.on('transaction', bump)
    onCleanup(() => current.off('transaction', bump))
  }, { immediate: true })
  return tick
}

/** A touch screen: the bubble menu stays away (it would sit under the finger and the system's own selection menu). */
export const isCoarsePointer = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches

/** A pointer that can hover (mouse, trackpad): the drag handle at a block needs it; phones keep plain editing. */
export const canHover = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover)').matches

const IS_APPLE = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** The prefix of a shortcut hint: `⌘` on Apple systems, else the word for the Control key in the person's language. Call in setup. */
export function useModKey(): () => string {
  const { t } = useI18n()
  return () => (IS_APPLE ? '⌘' : t('editor.modCtrl'))
}

/** Asks the node view at `pos` to open its settings popover; `missing` = the required props to show first (after an insert). */
export interface SettingsRequest { pos: number; missing: string[] }

/** Shared by the editor and the node views of its components: the slash menu and the keyboard ask, the node view opens. */
export const createSettingsBus = () => reactive<{ request: SettingsRequest | null }>({ request: null })
export type SettingsBus = ReturnType<typeof createSettingsBus>
