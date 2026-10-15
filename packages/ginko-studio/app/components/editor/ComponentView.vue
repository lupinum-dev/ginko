<!-- Node view of a Markdown component (`::callout`). Two looks, chosen by `componentMode` from the registry:
     live = the real Vue component of @lupinum/ginko-components with the editable text in its default slot;
     card = a frame with the label and a one-line summary of the props, the editable content below.
     Both get the settings button and popover (ComponentSettings), and can be selected as a block. -->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUpdated, ref, toRaw, useId, watch } from 'vue'
import { useI18n } from '#imports'
import { Plus, Settings2 } from '@lucide/vue'
import { fileRefOf, type ComponentRegistry } from '@lupinum/ginko/internal'
import { componentMode, GINKO_ASSETS, insertComponent, propsSummary, shownSrc, type ComponentProps } from '@lupinum/ginko-editor'
import { inject, watchEffect } from 'vue'
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { Button } from '@studio/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@studio/components/ui/popover'
import { EDITOR_FILES, type SettingsBus } from './context.ts'
import ComponentSettings from './ComponentSettings.vue'
import { useStudioSite } from '../../utils/labels'
import { EDITOR_PROPS, LIVE_COMPONENTS, LIVE_TAGS } from './liveComponents.ts'

const props = defineProps(nodeViewProps)
const { t } = useI18n()
const options = props.extension.options as { components?: ComponentRegistry; bus?: SettingsBus }

const tag = computed(() => String(props.node.attrs.tag ?? ''))
const def = computed(() => (options.components && Object.hasOwn(options.components, tag.value) ? options.components[tag.value] : undefined))
const { shown } = useStudioSite()
const label = computed(() => (def.value ? shown(def.value.label) : tag.value))
const values = computed(() => (props.node.attrs.props ?? {}) as ComponentProps)
const mode = computed(() => componentMode(tag.value, options.components, LIVE_TAGS))
const live = computed(() => (mode.value === 'live' ? LIVE_COMPONENTS[tag.value] : undefined))
// Pictures from the Files library show their file names in the summary (where the editor has a file source).
const assets = inject(GINKO_ASSETS, undefined)
const fileIds = computed(() => Object.entries(values.value).flatMap(([name, raw]) => {
  const field = def.value?.props[name.replace(/^:/, '')]
  const id = field?.type === 'image' && typeof raw === 'string' ? fileRefOf(raw) : undefined
  return id ? [id] : []
}))
const files = assets ? assets.details(fileIds) : ref(undefined)
const summary = computed(() => propsSummary(values.value, def.value, (id) => files.value?.[id]?.name))
// A card without text (a data block, a figure) has no box to type in: it says what the block shows instead.
const empty = computed(() => props.node.childCount === 0)
const describe = computed(() => (def.value ? shown(def.value.describe) : ''))
// Library pictures of the image props, as in the settings; the summary keeps their names. Other addresses are not loaded.
const editorFiles = inject(EDITOR_FILES, undefined)
const imageValues = computed(() => Object.entries(values.value).flatMap(([name, raw]) => {
  const field = def.value?.props[name.replace(/^:/, '')]
  return field?.type === 'image' && typeof raw === 'string' && fileRefOf(raw) !== undefined ? [{ name, raw }] : []
}))
watchEffect(() => { for (const { raw } of imageValues.value) editorFiles?.images.want(raw) })
const broken = ref(new Set<string>())
const pictures = computed(() => imageValues.value.flatMap(({ name, raw }) => {
  const src = editorFiles ? shownSrc(editorFiles.images, raw) : undefined
  return src && !broken.value.has(src) ? [{ name, src }] : []
}))
function hidePicture(src: string) { broken.value = new Set([...broken.value, src]) }
// The component gets the props as the page gives them: `:open` (a bare attribute) arrives as `open`.
const liveProps = computed(() => ({
  ...Object.fromEntries(Object.entries(values.value).map(([name, raw]) => [name.replace(/^:/, ''), raw])),
  ...EDITOR_PROPS[tag.value],
}))

const open = ref(false)
const requiredFirst = ref(false)
const titleId = useId()
const frame = ref<HTMLElement>()

watch(open, (isOpen) => { if (!isOpen) requiredFirst.value = false })

// Asked by the slash menu (after an insert) and by Enter on the selected block.
watch(() => options.bus?.request, (request) => {
  if (!request || request.pos !== props.getPos()) return
  requiredFirst.value = request.missing.length > 0
  if (options.bus) options.bus.request = null
  // After an insert, TipTap's `focus()` moves the focus into the text on the next frame; a popover opened before
  // that would count it as a click outside and close.
  setTimeout(() => { open.value = true }, 100)
}, { immediate: true, flush: 'post' })

function update(next: ComponentProps) {
  props.updateAttributes({ props: next })
}

/** A short form (`warning`) becomes the long form (`callout` with `type`); the content and the other props stay. */
function convert(target: string, next: ComponentProps) {
  props.updateAttributes({ tag: target, props: next })
}

/** The editor itself: Vue wraps `props.editor` in a reactive proxy, and a transaction from the proxy does not fit the state of the editor. */
const editor = () => toRaw(props.editor)

/** Closes the popover first, so the focus it hands back does not land in the middle of the deletion. */
async function remove() {
  open.value = false
  await nextTick()
  const from = props.getPos()
  if (from === undefined) return
  editor().commands.deleteRange({ from, to: from + props.node.nodeSize })
  editor().commands.focus()
}

// A container (a gallery, tabs) gets one button per kind of child its registry entry names (not plain tags like `pre`):
// the only way to add one, since its content holds no empty line for "/".
const childTags = computed(() => (def.value?.children ?? []).filter((child) => options.components && Object.hasOwn(options.components, child) && options.components[child]!.kind === 'block'))
const childLabel = (child: string) => shown(options.components![child]!.label)

/** Adds a `child` at the end of the content (before the named slots, which come last) and opens its settings. */
async function addChild(child: string) {
  const pos = props.getPos()
  if (pos === undefined || !options.components) return
  let at = pos + props.node.nodeSize - 1
  props.node.forEach((node, offset) => { if (node.type.name === 'slot') at = Math.min(at, pos + 1 + offset) })
  const inserted = await insertComponent(editor(), { tag: child, profile: 'page', components: options.components, at, child: true })
  if (!inserted) return
  editor().commands.setNodeSelection(inserted.pos)
  if (options.bus) options.bus.request = { pos: inserted.pos, missing: inserted.missing }
}

/**
 * A click on the frame (not on the text) selects the block. A click on the head of a card, or on the drawn
 * part of a live component (its title and symbol), also opens the settings: that is where people look for them.
 */
function select(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.closest('[data-node-view-content], .ginko-settings')) return
  const pos = props.getPos()
  if (pos === undefined) return
  editor().commands.setNodeSelection(pos)
  editor().commands.focus()
  if (target.closest('.ginko-block-head, .ginko-live')) open.value = true
}

/**
 * Nothing in the drawn component but its text may take focus. Links, summaries and the like get `tabindex=-1`
 * (also a link that wraps the text, as a whole-card link does); CSS (`.ginko-live`) takes their pointer events.
 */
function lock() {
  // The text is part of the editor's own editing area (a nested editing host would take the focus and the cursor
  // away from ProseMirror: the cursor could not leave the box). Everything else drawn around it is not editable.
  const content = frame.value?.querySelector('.ginko-live [data-node-view-content]')
  for (let el = content ?? null; el && el !== frame.value; el = el.parentElement) {
    for (const sibling of Array.from(el.parentElement?.children ?? [])) if (sibling !== el) sibling.setAttribute('contenteditable', 'false')
  }
  for (const node of frame.value?.querySelectorAll<HTMLElement>('a, button, summary, input, select, textarea, [tabindex]') ?? []) {
    if (node.closest('.ginko-settings, [data-node-view-content]')) continue
    node.tabIndex = -1
  }
}
onMounted(() => nextTick(lock))
onUpdated(lock)

/** Clicks on links and summaries of the drawn component do nothing in the editor. */
function noFollow(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.closest('a, summary')) event.preventDefault()
}
</script>

<template>
  <NodeViewWrapper
    class="ginko-block group/block relative my-3 rounded-md" :data-selected="selected || undefined" :data-component="tag" :data-mode="mode"
    @click="select"
  >
    <Popover v-model:open="open">
      <PopoverAnchor as-child>
        <div ref="frame" class="ginko-block-frame relative">
          <!-- contenteditable=false: the button is not part of the text. Visible on hover, on focus, while selected or open, and on touch. -->
          <div class="ginko-settings absolute top-1.5 right-1.5 z-10" contenteditable="false">
            <PopoverTrigger as-child>
              <Button
                type="button" variant="ghost" size="sm" :aria-label="t('editor.block.settingsFor', { label })"
                class="h-8 min-w-8 gap-1.5 bg-background/80 px-2 text-muted-foreground backdrop-blur-sm [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-11"
              >
                <Settings2 />
                <span v-if="selected" class="text-xs">{{ t('editor.block.settings') }}</span>
              </Button>
            </PopoverTrigger>
          </div>

          <component :is="live" v-if="live" v-bind="liveProps" class="ginko-live" @click.capture="noFollow">
            <NodeViewContent class="ginko-live-content" />
          </component>

          <div v-else class="ginko-block-card rounded-md border bg-card text-card-foreground">
            <div class="ginko-block-head flex cursor-pointer items-baseline gap-2 border-b py-1.5 pl-3 text-xs text-muted-foreground select-none" :class="selected ? 'pr-36' : 'pr-14'" contenteditable="false">
              <span class="shrink-0 font-medium whitespace-nowrap">{{ label }}</span>
              <span v-if="summary" class="min-w-0 truncate" :title="summary">{{ summary }}</span>
            </div>
            <div v-if="pictures.length" class="flex flex-wrap gap-2 px-3 pt-3" contenteditable="false">
              <img v-for="p in pictures" :key="p.name" :src="p.src" alt="" class="max-h-24 rounded-sm object-contain" @error="hidePicture(p.src)">
            </div>
            <p v-if="empty && describe" class="px-3 py-2 text-sm text-muted-foreground" contenteditable="false">{{ describe }}</p>
            <!-- It stays the editor's place for the content even when hidden. -->
            <NodeViewContent class="ginko-block-content p-3" :class="empty && 'hidden'" />
            <div v-if="childTags.length" class="flex flex-wrap gap-2 border-t px-3 py-2" contenteditable="false">
              <Button
                v-for="child in childTags" :key="child" type="button" variant="outline" size="sm" class="[@media(pointer:coarse)]:h-11"
                @click.stop="addChild(child)"
              >
                <Plus aria-hidden="true" />{{ t('editor.block.addChild', { label: childLabel(child) }) }}
              </Button>
            </div>
          </div>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="end" class="w-80 max-h-[min(32rem,var(--reka-popover-content-available-height))] overflow-y-auto" role="dialog" :aria-labelledby="titleId"
      >
        <ComponentSettings
          v-if="options.components"
          :tag="tag" :registry="options.components" :values="values" :required-first="requiredFirst" :title-id="titleId"
          @update="update" @convert="convert" @remove="remove"
        />
      </PopoverContent>
    </Popover>
  </NodeViewWrapper>
</template>
