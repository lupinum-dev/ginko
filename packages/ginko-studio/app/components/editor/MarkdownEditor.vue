<!-- A Markdown field as a rich-text editor (TipTap, headless core in @lupinum/ginko-editor). What it saves is
     always `handle.markdown()`: untouched blocks stay byte for byte. A text the editor cannot show without
     changing it opens as Markdown source instead; "Markdown" in the toolbar switches by hand, both ways.
     Pasted and dropped content is cleaned or uploaded by the core's paste hooks; problems show at their block. -->
<script setup lang="ts">
import { computed, inject, onBeforeUnmount, provide, reactive, ref, watch, watchEffect } from 'vue'
import { useI18n } from '#imports'
import type { Field, Json } from '@lupinum/ginko'
import { coreMessage, effectiveAlt, effectiveMax, effectiveProfile, type Msg } from '@lupinum/ginko/internal'
import {
  BLOCKERS, docProblems, FLUSHERS, GINKO_ASSETS, linkCardTag, makeLinkCard, missingRequired, slashItems, SLASH_COMPONENT_GROUP, sourceProblems, useFileImages, useGinkoEditor,
  type DocProblem, type SlashItem, type SourceProblem,
} from '@lupinum/ginko-editor'
import { GripVertical } from '@lucide/vue'
import { DragHandle } from '@tiptap/extension-drag-handle-vue-3'
import { EditorContent, type Editor as VueEditor } from '@tiptap/vue-3'
import { useToast } from '@studio/composables/useToast'
import { Alert } from '@studio/components/ui/alert'
import { Button } from '@studio/components/ui/button'
import { Textarea } from '@studio/components/ui/textarea'
import { TooltipProvider } from '@studio/components/ui/tooltip'
import { canHover, createSettingsBus, EDITOR_COMPONENTS, EDITOR_FILES, isCoarsePointer, useEditorTick } from './context.ts'
import EditorBubble from './EditorBubble.vue'
import EditorToolbar from './EditorToolbar.vue'
import FindBar from './FindBar.vue'
import { createSlashState, studioExtensions } from './extensions.ts'
import ImageDialog from './ImageDialog.vue'
import SlashMenu from './SlashMenu.vue'
import SourceToggle from './SourceToggle.vue'
import { useImageUploads } from './useImageUploads.ts'
import { useStudioSite } from '../../utils/labels'

const props = defineProps<{
  id: string; field: Extract<Field, { type: 'markdown' }>; modelValue: Json | undefined; invalid: boolean; describedBy?: string
  /** The language of the text (the Studio's own language is `locale`): pictures from the library take their description in it. */
  contentLocale?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: Json | undefined] }>()

const DEBOUNCE_MS = 300
/** Room kept around the caret when the page scrolls to it: the page header and the toolbar (top), the save bar (bottom). */
const SCROLL_MARGIN = { top: 120, bottom: 120, left: 0, right: 0 }
/** The counter shows from this share of the limit. */
const COUNTER_FROM = 0.8

const text = (v: Json | undefined) => (typeof v === 'string' ? v : '')
const profile = computed(() => effectiveProfile(props.field))
const registry = inject(EDITOR_COMPONENTS, undefined)
const multiline = computed(() => profile.value !== 'inline')
const toast = useToast()
const { t, locale } = useI18n()
/** The text of a core problem in the Studio language. */
const coreText = (m: Msg) => coreMessage(locale.value, m.key, m.params)

/** The text the editor was opened with, and the last text it handed to the parent (equal values coming back do nothing). */
let opened = text(props.modelValue)
let lastEmitted = opened
const count = ref(opened.length)
const limit = computed(() => effectiveMax(props.field))
const showCount = computed(() => Number.isFinite(limit.value) && count.value >= limit.value * COUNTER_FROM)
const reached = computed(() => count.value >= limit.value)
const over = computed(() => count.value > limit.value)

const linkOpen = ref(false)
const imageOpen = ref(false)
const findOpen = ref(false)
/** The drag handle at a block: pointer devices only, and only where blocks exist (not in a one-line field). */
const dragHandle = canHover()
/** Position of an image that waits for its description (the dialog then asks for the description only). */
const describePos = ref<number | null>(null)
watch(imageOpen, (isOpen) => { if (!isOpen) describePos.value = null })
const slash = reactive(createSlashState())
const bus = createSettingsBus()
// The core names the entries of the built-in blocks in German; the Studio shows them in the person's language, so the
// filter (which reads the shown text) works in that language too. Component entries carry the schema's own texts.
const BUILT_IN = ['heading2', 'heading3', 'heading4', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'horizontalRule', 'table', 'codeBlock', 'image'] as const
const isBuiltIn = (id: string): id is (typeof BUILT_IN)[number] => (BUILT_IN as readonly string[]).includes(id)
const localized = (item: SlashItem): SlashItem => {
  if (!isBuiltIn(item.id)) return item.group === SLASH_COMPONENT_GROUP ? { ...item, group: t('editor.slash.groupComponents') } : item
  return { ...item, label: t(`editor.slash.items.${item.id}.label`), describe: t(`editor.slash.items.${item.id}.describe`), group: t('editor.slash.groupText') }
}
const items = () => slashItems({
  profile: profile.value,
  components: registry?.(),
  locale: locale.value,
  pickImage: () => { describePos.value = null; imageOpen.value = true },
  // A component whose example leaves a required prop empty: select it and ask for those props at once.
  onNeedsProps: ({ editor: target, pos, missing }) => { target.commands.setNodeSelection(pos); bus.request = { pos, missing } },
}).map(localized)

/** True while the person looks at the Markdown source by choice ("Markdown" in the toolbar). */
const wantSource = ref(false)

// Pictures from the Files library: the text keeps `$file.<id>`, the editor and the component settings show the file.
const assets = inject(GINKO_ASSETS, undefined)
const fileImages = assets ? useFileImages(assets, () => t('editor.image.missing')) : undefined
if (fileImages) provide(EDITOR_FILES, { images: fileImages, locale: () => props.contentLocale ?? '' })
/** A picture without its own text is described when its library file has a text in this text's language (the save's rule). */
const described = (src: string) => Boolean(props.contentLocale && effectiveAlt(undefined, fileImages?.file(src)?.alt, props.contentLocale))

const uploads = useImageUploads({
  id: () => props.id,
  editor: () => editor.value,
  describe: (pos) => { describePos.value = pos; imageOpen.value = true },
  fail: (message) => toast.show(message, { tone: 'err' }),
})
/** "Bild hochladen" in the image dialog: the picture goes in at the cursor, like a dropped one. */
const uploadAtCursor = assets ? (file: File) => { const current = editor.value; if (current) uploads.handle([file], current.state.selection.from) } : undefined

/** A bare address pasted on an empty line: the chip near the caret offers a link card (when the site has one). */
const cardTag = computed(() => linkCardTag(registry?.()))
const chip = ref<{ url: string; pos: number; top: number; left: number } | null>(null)

const { handle, mode, editor, problemMessages, open, markdown } = useGinkoEditor(() => ({
  text: opened,
  profile: profile.value,
  components: registry?.(),
  forceSource: wantSource.value,
  // TipTap mounts into this element; EditorContent moves it into the page.
  element: document.createElement('div'),
  onImageFiles: (files, pos) => uploads.handle(files, pos),
  fileImages,
  onUrlPasted: ({ url, pos }) => showChip(url, pos),
  extend: studioExtensions({ slashItems: items, slash, bus, openLink: () => { linkOpen.value = true }, problems: { registry: () => registry?.(), fix, t, text: coreText, described } }),
}))

let timer: ReturnType<typeof setTimeout> | undefined
/** True from the first change of a burst of typing until the debounce ends. */
let burst = false
function schedule() {
  clearTimeout(timer)
  // The first change of a burst goes out at once, so the form knows it is changed (and enables "Speichern")
  // with the first keystroke; the rest of the burst waits for the pause.
  if (!burst) { burst = true; void emitMarkdown() }
  timer = setTimeout(flush, DEBOUNCE_MS)
}

/** Hands the pending Markdown to the parent now (blur, unmount, end of the pause). */
async function flush() {
  clearTimeout(timer)
  timer = undefined
  burst = false
  await emitMarkdown()
}

/** Hands the current Markdown to the parent when it differs from what the parent has. */
async function emitMarkdown() {
  const current = handle.value
  if (!current) return
  // Nothing was changed since the text was opened, and nothing was handed out: leave the stored text alone.
  if (!current.dirty && lastEmitted === opened) return
  const next = await markdown()
  if (current !== handle.value || next === lastEmitted) return
  lastEmitted = next
  count.value = next.length
  emit('update:modelValue', next === '' ? undefined : next)
}

let unsubscribe: (() => void) | undefined
const sourceText = ref('')
watch(handle, (next) => {
  unsubscribe?.()
  unsubscribe = next?.onChange(schedule)
  if (next?.mode === 'source') sourceText.value = next.source
  if (next?.mode !== 'rich') chip.value = null
}, { immediate: true })

function onSource(value: string | number) {
  sourceText.value = String(value)
  const current = handle.value
  if (current?.mode === 'source') current.source = String(value)
}

/** Rich to source and back. The text is handed over first, so typing is never lost; the other view parses it again. */
async function toggleSource() {
  const current = handle.value
  if (!current) return
  await flush()
  const next = await current.markdown()
  clearTimeout(timer)
  timer = undefined
  burst = false
  // From rich: the source view. From source: try rich; a text it cannot show stays in source, with the reason.
  wantSource.value = current.mode === 'rich'
  opened = next
  await open()
}

watch(() => props.modelValue, (value) => {
  const next = text(value)
  if (next === lastEmitted) return
  clearTimeout(timer)
  timer = undefined
  burst = false
  opened = lastEmitted = next
  count.value = next.length
  void open()
})

// The ProseMirror element is the textbox: label, id (the label's `for`), validity and hints.
watchEffect(() => {
  editor.value?.setOptions({
    editorProps: {
      attributes: {
        id: props.id,
        role: 'textbox',
        ...(multiline.value ? { 'aria-multiline': 'true' } : {}),
        'aria-labelledby': `${props.id}-label`,
        'aria-invalid': String(props.invalid),
        ...(props.describedBy ? { 'aria-describedby': props.describedBy } : {}),
        class: 'ginko-prose',
      },
      // The caret and a new block stay clear of the sticky toolbar above and the sticky save bar of the form below.
      scrollMargin: SCROLL_MARGIN,
      scrollThreshold: SCROLL_MARGIN,
    },
  })
})

// The form awaits this before it saves, so nothing typed in the pause is lost.
const flushers = inject(FLUSHERS, undefined)
flushers?.add(flush)
onBeforeUnmount(() => { flushers?.delete(flush); void flush() })

// Things that stop a save: a text over the limit, a picture without description. (The upload itself blocks in useImageUploads.)
const blockers = inject(BLOCKERS, undefined)
const tick = useEditorTick(() => editor.value)
const undescribed = computed(() => { void tick.value; return editor.value ? docProblems(editor.value.state.doc, undefined, described).some((p) => p.kind === 'image') : false })
watchEffect(() => {
  if (!blockers) return
  const set = (key: string, message: string | false) => { if (message) blockers.set(key, message); else blockers.delete(key) }
  set(`${props.id}-max`, over.value && t('editor.text.tooLong', { max: limit.value }))
  set(`${props.id}-alt`, undescribed.value && t('editor.image.noDescription'))
})
onBeforeUnmount(() => { blockers?.delete(`${props.id}-max`); blockers?.delete(`${props.id}-alt`) })

/** "Beheben" at a block: a component opens its settings (the missing props first), a picture asks for its description. */
function fix(problem: DocProblem) {
  const current = editor.value
  if (!current) return
  if (problem.kind === 'image') { describePos.value = problem.pos; imageOpen.value = true; return }
  const node = current.state.doc.nodeAt(problem.pos)
  if (!node) return
  current.commands.setNodeSelection(problem.pos)
  const registered = registry?.()
  bus.request = { pos: problem.pos, missing: registered ? missingRequired(registered, String(node.attrs.tag), node.attrs.props) : [] }
}

// --- the chip for a pasted address ---------------------------------------------------------------------------------
const frameEl = ref<HTMLElement>()
function showChip(url: string, pos: number) {
  const current = editor.value
  if (!cardTag.value || !current || !frameEl.value) return
  const caret = current.view.coordsAtPos(current.state.selection.from)
  const box = frameEl.value.getBoundingClientRect()
  chip.value = { url, pos, top: caret.bottom - box.top + 6, left: Math.max(8, caret.left - box.left) }
  // Any typing (a change of the text) dismisses it, and so does moving the caret out of that line.
  const docAtPaste = current.state.doc
  const check = () => {
    if (!current.state.doc.eq(docAtPaste) || current.state.selection.$from.parent !== docAtPaste.nodeAt(pos)) {
      chip.value = null
      current.off('transaction', check)
    }
  }
  current.on('transaction', check)
}
function makeCard() {
  const current = editor.value
  const shown = chip.value
  chip.value = null
  if (current && shown && cardTag.value) makeLinkCard(current, shown.pos, shown.url, cardTag.value)
}
const { shown } = useStudioSite()
const cardLabel = computed(() => { const label = cardTag.value ? registry?.()?.[cardTag.value]?.label : undefined; return label === undefined ? (cardTag.value ? t('editor.card.fallbackLabel') : '') : shown(label) })

// Ctrl/Cmd+F inside the field opens find and replace instead of the browser's page search.
function onFrameKey(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); findOpen.value = true }
}

// --- phone: the toolbar above the keyboard -------------------------------------------------------------------------
const coarse = isCoarsePointer()
const focused = ref(false)
let leaving: ReturnType<typeof setTimeout> | undefined
const insidePortal = (el: Element | null) => !!el?.closest('[role="listbox"], [role="dialog"], [data-reka-popper-content-wrapper]')
function onFocusIn() { clearTimeout(leaving); focused.value = true }
function onFocusOut() {
  clearTimeout(leaving)
  // Focus moves through the select list or a dialog of the toolbar and comes back: wait for where it lands.
  leaving = setTimeout(() => { focused.value = !!frameEl.value?.contains(document.activeElement) || insidePortal(document.activeElement) }, 150)
}
onBeforeUnmount(() => { clearTimeout(leaving) })
const docked = computed(() => coarse && (focused.value || linkOpen.value || imageOpen.value))

// --- problems in the source view -----------------------------------------------------------------------------------
const sourceIssues = ref<SourceProblem[]>([])
let checking: ReturnType<typeof setTimeout> | undefined
watch([sourceText, mode], () => {
  clearTimeout(checking)
  if (mode.value !== 'source') { sourceIssues.value = []; return }
  checking = setTimeout(async () => {
    const found = await sourceProblems(sourceText.value, { profile: profile.value, components: registry?.() })
    if (mode.value === 'source') sourceIssues.value = found
  }, 250)
}, { immediate: true })
onBeforeUnmount(() => { clearTimeout(checking) })

/** Puts the cursor on the block of the problem in the textarea. */
function goTo(issue: SourceProblem) {
  const area = document.getElementById(props.id) as HTMLTextAreaElement | null
  if (!area) return
  area.focus()
  area.setSelectionRange(issue.from, issue.from + issue.excerpt.length)
  const lineHeight = Number.parseFloat(getComputedStyle(area).lineHeight) || 20
  area.scrollTop = Math.max(0, (issue.line - 2) * lineHeight)
}

const frame = 'relative rounded-md border border-input bg-background transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/80 data-[invalid=true]:border-destructive data-[invalid=true]:ring-destructive/20 dark:data-[invalid=true]:ring-destructive/40'
</script>

<template>
  <!-- minmax(0, 1fr): the toolbar scrolls inside the frame instead of making the frame (and the page) wider than the screen. -->
  <div class="grid grid-cols-[minmax(0,1fr)] gap-1.5">
    <!-- Markdown source -->
    <div v-if="mode === 'source'" class="grid gap-3">
      <div class="flex items-start gap-2">
        <Alert v-if="!wantSource" role="note" class="flex-1">
          <div class="col-start-2 grid gap-0.5">
            <p>{{ t('editor.source.note') }}</p>
            <p v-if="problemMessages[0] && !sourceIssues.length" class="text-muted-foreground">{{ coreText(problemMessages[0]) }}</p>
          </div>
        </Alert>
        <div v-else class="flex-1" />
        <TooltipProvider :delay-duration="300"><SourceToggle pressed @toggle="toggleSource" /></TooltipProvider>
      </div>
      <Textarea
        :id="id" class="min-h-[12rem] font-mono" rows="8" spellcheck="true" :model-value="sourceText" :aria-invalid="invalid" :aria-describedby="describedBy"
        @update:model-value="onSource" @blur="flush"
      />
      <ul v-if="sourceIssues.length" class="grid gap-2" :aria-label="t('editor.source.problems')">
        <li v-for="(issue, i) in sourceIssues" :key="i" class="flex items-center gap-3 border-l-2 border-destructive py-1 pl-3 text-sm">
          <span class="min-w-0 flex-1"><span class="text-muted-foreground">{{ t('editor.source.line', { line: issue.line }) }}</span>{{ coreText(issue) }}</span>
          <Button type="button" variant="outline" size="sm" class="shrink-0 [@media(pointer:coarse)]:h-11" :aria-label="t('editor.source.fixLine', { line: issue.line, message: coreText(issue) })" @click="goTo(issue)">{{ t('editor.fix') }}</Button>
        </li>
      </ul>
    </div>

    <!-- Rich text -->
    <div v-else-if="mode === 'rich' && editor" ref="frameEl" :data-invalid="invalid" :class="frame" @focusin="onFocusIn" @focusout="onFocusOut(); flush()" @keydown.capture="onFrameKey">
      <EditorToolbar v-model:link-open="linkOpen" v-model:image-open="imageOpen" v-model:find-open="findOpen" :editor="editor" :profile="profile" :docked="docked" @source="toggleSource" />
      <FindBar v-model:open="findOpen" :editor="editor" />
      <!-- EditorContent wants the Vue flavour of Editor; it only adds fields that EditorContent fills itself. -->
      <EditorContent :editor="editor as VueEditor" :class="['ginko-editor', multiline ? 'is-multiline' : 'is-inline', dragHandle && multiline && 'has-handle']" />
      <DragHandle v-if="dragHandle && multiline" :editor="editor" class="ginko-drag-handle">
        <GripVertical class="size-4 text-muted-foreground" aria-hidden="true" />
      </DragHandle>
      <EditorBubble :editor="editor" :profile="profile" @link="linkOpen = true" />
      <ImageDialog
        v-if="'image' in editor.schema.nodes" v-model:open="imageOpen" :editor="editor" :describe="describePos" :images="fileImages" :locale="contentLocale ?? ''" :upload="uploadAtCursor"
      />
      <SlashMenu :state="slash" />
      <Button
        v-if="chip && cardTag" type="button" variant="secondary" size="sm" class="absolute z-10 shadow-md [@media(pointer:coarse)]:h-11"
        :style="{ top: `${chip.top}px`, left: `${chip.left}px` }" @mousedown.prevent @click="makeCard"
      >{{ t('editor.card.show', { label: cardLabel }) }}</Button>
    </div>

    <!-- Until the editor is open: a box of the same size, so the page does not jump. -->
    <div v-else :class="[frame, multiline ? 'min-h-[11.5rem]' : 'min-h-10']" aria-hidden="true" />

    <p v-if="showCount" :class="['justify-self-end text-xs', reached ? 'font-medium text-destructive' : 'text-muted-foreground']" aria-live="polite">{{ t('editor.text.counter', { count, limit }) }}</p>
  </div>
</template>

<style scoped>
/* Content styles, from the Studio tokens. Scoped to this editor. */
.ginko-editor :deep(.ginko-prose) { padding: 0.5rem 0.75rem; outline: none; overflow-wrap: anywhere; font-size: 1rem; line-height: 1.6; }
@media (min-width: 768px) { .ginko-editor :deep(.ginko-prose) { font-size: 0.875rem; } }
.is-multiline :deep(.ginko-prose) { min-height: 8rem; }
.is-inline :deep(.ginko-prose) { min-height: 2.5rem; }
.ginko-editor :deep(.ginko-prose > :first-child) { margin-top: 0; }
.ginko-editor :deep(.ginko-prose > :last-child) { margin-bottom: 0; }
.ginko-editor :deep(p) { margin: 0.75em 0; }
.ginko-editor :deep(h2) { margin: 1.25em 0 0.5em; font-size: 1.375rem; font-weight: 600; line-height: 1.3; }
.ginko-editor :deep(h3) { margin: 1.25em 0 0.5em; font-size: 1.125rem; font-weight: 600; line-height: 1.35; }
.ginko-editor :deep(h4) { margin: 1.25em 0 0.5em; font-size: 1rem; font-weight: 600; line-height: 1.4; }
.ginko-editor :deep(ul), .ginko-editor :deep(ol) { margin: 0.75em 0; padding-left: 1.5rem; }
.ginko-editor :deep(ul) { list-style: disc; }
.ginko-editor :deep(ol) { list-style: decimal; }
.ginko-editor :deep(li > p) { margin: 0.25em 0; }
.ginko-editor :deep(li > :is(ul, ol)) { margin: 0.25em 0; }
.ginko-editor :deep(blockquote) { margin: 0.75em 0; border-left: 2px solid var(--border); padding-left: 1rem; color: var(--muted-foreground); }
.ginko-editor :deep(a) { color: var(--primary); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.ginko-editor :deep(code) { border-radius: 0.25rem; background: var(--muted); padding: 0 0.25rem; font-family: ui-monospace, monospace; font-size: 0.9em; }
.ginko-editor :deep(pre) { margin: 0.75em 0; overflow-x: auto; border-radius: 0.375rem; background: var(--muted); padding: 0.75rem; font-family: ui-monospace, monospace; font-size: 0.875rem; }
.ginko-editor :deep(pre code) { background: none; padding: 0; font-size: inherit; }
.ginko-editor :deep(hr) { margin: 1em 0; border: 0; border-top: 1px solid var(--border); }
.ginko-editor :deep(hr.ProseMirror-selectednode) { border-top-color: var(--ring); }
.ginko-editor :deep(img) { max-width: 100%; height: auto; }
.ginko-editor :deep(table) { margin: 0.75em 0; border-collapse: collapse; table-layout: fixed; width: 100%; }
.ginko-editor :deep(th), .ginko-editor :deep(td) { border: 1px solid var(--border); padding: 0.25rem 0.5rem; text-align: left; vertical-align: top; }
.ginko-editor :deep(th) { background: var(--muted); font-weight: 600; }
.ginko-editor :deep(.selectedCell) { background: var(--accent); }
/* Nodes the editor shows but has no design for yet. */
.ginko-editor :deep([data-ginko-alert]) { margin: 0.75em 0; border: 1px solid var(--border); border-radius: 0.375rem; padding: 0.5rem 0.75rem; }
.ginko-editor :deep([data-ginko-raw]) { white-space: pre-wrap; color: var(--muted-foreground); }
.ginko-editor :deep([data-ginko-slot]) { margin: 0.5em 0; border-left: 2px solid var(--border); padding-left: 0.75rem; }
.ginko-editor :deep([data-ginko-slot])::before { content: attr(data-ginko-slot); display: block; font-size: 0.75rem; color: var(--muted-foreground); }
.ginko-editor :deep([data-ginko-slot='default'])::before { content: none; }
.ginko-editor :deep([data-ginko-inline-component]) { border-radius: 0.25rem; background: var(--muted); padding: 0 0.25rem; }
/* Component blocks (ComponentView). The class names of the card here are not `ginko-card`: that is a component of ginko-components. */
.ginko-editor :deep(.ginko-block[data-selected]) { outline: 2px solid var(--ring); outline-offset: 2px; }
.ginko-editor :deep(.ginko-block-content > :first-child), .ginko-editor :deep(.ginko-live-content > :first-child) { margin-top: 0; }
.ginko-editor :deep(.ginko-block-content > :last-child), .ginko-editor :deep(.ginko-live-content > :last-child) { margin-bottom: 0; }
/* The settings button: shown on hover, on focus, while the block is selected or its popover is open; always on touch. */
.ginko-editor :deep(.ginko-settings) { opacity: 0; transition: opacity 120ms; }
.ginko-editor :deep(.ginko-block:hover .ginko-settings), .ginko-editor :deep(.ginko-block:focus-within .ginko-settings), .ginko-editor :deep(.ginko-block[data-selected] .ginko-settings), .ginko-editor :deep(.ginko-settings:has([data-state='open'])) { opacity: 1; }
@media (hover: none) { .ginko-editor :deep(.ginko-settings) { opacity: 1; } }
/* Find and replace: matches (core search.ts), the current one stronger. */
.ginko-editor :deep(.ginko-match) { border-radius: 0.125rem; background: color-mix(in oklab, var(--ring) 25%, transparent); }
.ginko-editor :deep(.ginko-match-current) { background: color-mix(in oklab, var(--ring) 55%, transparent); outline: 1px solid var(--ring); }
/* The grip at the hovered block (extension-drag-handle): never on touch screens, where blocks are not dragged. */
.ginko-drag-handle { display: flex; align-items: center; justify-content: center; width: 1.25rem; height: 1.5rem; border-radius: 0.25rem; cursor: grab; }
.ginko-drag-handle:hover { background: var(--accent); }
.ginko-drag-handle:active { cursor: grabbing; }
@media (hover: none) { .ginko-drag-handle { display: none; } }
/* A gutter for the drag handle inside the field, so it never sits on the border or touches the text. */
@media (hover: hover) { .ginko-editor.has-handle :deep(.ginko-prose) { padding-left: 2rem; } }
/* The sample text of an inserted component: shown muted while its block is empty. */
.ginko-editor :deep([data-placeholder]:has(> br.ProseMirror-trailingBreak:only-child))::before { content: attr(data-placeholder); float: left; height: 0; pointer-events: none; color: var(--muted-foreground); }
/* A drawn component is not operated in the editor: only its text takes the pointer; links and summaries do nothing. */
.ginko-editor :deep(.ginko-live :is(a, summary, button, input, select, textarea)) { pointer-events: none; }
.ginko-editor :deep(.ginko-live [data-node-view-content], .ginko-live [data-node-view-content] *) { pointer-events: auto; }
.ginko-editor :deep(.ginko-live [data-node-view-content]) { white-space: normal; cursor: text; }
/* Problems at the block (extensions.ts): a red left border on the block, the note under it. */
.ginko-editor :deep(.ginko-problem) { border-left: 2px solid var(--destructive); padding-left: 0.75rem; }
.ginko-editor :deep(.ginko-problem-note) { display: flex; align-items: center; gap: 0.75rem; margin: 0.25rem 0 0.75rem; border-left: 2px solid var(--destructive); padding-left: 0.75rem; font-size: 0.875rem; color: var(--destructive); }
.ginko-editor :deep(.ginko-problem-note button) { flex-shrink: 0; min-height: 2rem; border: 1px solid var(--border); border-radius: 0.375rem; background: var(--background); padding: 0 0.75rem; color: var(--foreground); font-size: 0.875rem; cursor: pointer; }
@media (pointer: coarse) { .ginko-editor :deep(.ginko-problem-note button) { min-height: 2.75rem; min-width: 2.75rem; } }
/* A picture on its way into the library (uploads.ts), and one whose library file is gone (file-images.ts). */
.ginko-editor :deep(:is(.ginko-uploading, .ginko-image-missing)) { display: inline-block; border-radius: 0.25rem; background: var(--muted); padding: 0 0.5rem; color: var(--muted-foreground); font-size: 0.875em; }
</style>
