<!-- Node view of an inline Markdown component (`:badge[neu]`, `:fact{name="practice.price"}`). One with text of its own
     keeps the text editable in place. One without text (isChip) is a chip; a click on it, or Enter while it is selected,
     opens its settings. A fact's chip shows what the website shows there ("€ 98"), so the text reads as visitors read
     it; its field label is the tooltip and part of its name for screen readers, and its panel is FactSettings. -->
<script setup lang="ts">
import { computed, ref, toRaw, useId, watch } from 'vue'
import { useI18n } from '#imports'
import { FACT_TAG, type ComponentRegistry } from '@lupinum/ginko/internal'
import { blockSummary, type ComponentProps } from '@lupinum/ginko-editor'
import { Braces } from '@lucide/vue'
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { Popover, PopoverContent, PopoverTrigger } from '@studio/components/ui/popover'
import { isChip, type SettingsBus } from './context.ts'
import ComponentSettings from './ComponentSettings.vue'
import FactSettings from './FactSettings.vue'
import type { EditorFacts } from '../../utils/facts'
import { useStudioSite } from '../../utils/labels'

const props = defineProps(nodeViewProps)
const { t } = useI18n()
const options = props.extension.options as { components?: ComponentRegistry; bus?: SettingsBus; facts?: EditorFacts }

const tag = computed(() => String(props.node.attrs.tag ?? ''))
const def = computed(() => (options.components && Object.hasOwn(options.components, tag.value) ? options.components[tag.value] : undefined))
const { shown } = useStudioSite()
const label = computed(() => (def.value ? shown(def.value.label) : tag.value))
const values = computed(() => (props.node.attrs.props ?? {}) as ComponentProps)
const summary = computed(() => blockSummary(values.value, def.value, { label: shown }))
/** What the chip says after the label: the chosen options, else the first text prop. */
const detail = computed(() => summary.value.facts[0] ?? summary.value.title ?? '')
// Text typed into a chip by some other way (a paste of `:fact[x]`) stays visible as text rather than hidden.
const chip = computed(() => isChip(options.components, tag.value) && props.node.childCount === 0)

const isFact = computed(() => tag.value === FACT_TAG)
const factName = computed(() => (typeof values.value.name === 'string' ? values.value.name : ''))
const facts = computed(() => options.facts?.values())
const fact = computed(() => facts.value?.find((f) => f.name === factName.value))
/** The chip's text: a fact's value, else what it is (the fact's label while the values load, or when it is empty). */
const chipText = computed(() => (isFact.value && fact.value?.text) || detail.value || label.value)
/** Name and tooltip: a fact says which value it is ("Preis pro Sitzung"), and that it is empty when it is. */
const factTitle = computed(() => {
  if (!isFact.value) return label.value
  if (facts.value !== undefined && !fact.value?.text) return t('editor.fact.chipEmpty', { label: detail.value || label.value })
  return detail.value || label.value
})
const chipName = computed(() => (isFact.value && fact.value?.text ? t('editor.fact.chipName', { label: detail.value || label.value, value: fact.value.text }) : detail.value ? `${label.value}: ${detail.value}` : label.value))
const slug = computed(() => options.facts?.slug() ?? '')

const editable = props.editor.isEditable
const open = ref(false)
const requiredFirst = ref(false)
const titleId = useId()
watch(open, (isOpen) => { if (!isOpen) requiredFirst.value = false })

// Asked by the slash menu after an insert that still misses a required prop.
watch(() => options.bus?.request, (request) => {
  if (!request || request.pos !== props.getPos()) return
  requiredFirst.value = request.missing.length > 0
  if (options.bus) options.bus.request = null
  setTimeout(() => { open.value = true }, 100)
}, { immediate: true, flush: 'post' })

const update = (next: ComponentProps) => props.updateAttributes({ props: next })
const convert = (target: string, next: ComponentProps) => props.updateAttributes({ tag: target, props: next })

function remove() {
  open.value = false
  const from = props.getPos()
  if (from === undefined) return
  const editor = toRaw(props.editor)
  editor.chain().deleteRange({ from, to: from + props.node.nodeSize }).focus().run()
}
</script>

<template>
  <NodeViewWrapper as="span" class="ginko-inline" :data-component="tag" :data-selected="selected || undefined">
    <Popover v-if="chip" v-model:open="open">
      <PopoverTrigger as-child :disabled="!editable">
        <!-- contenteditable=false: the chip is one unit of the text, like a picture; the cursor moves around it. -->
        <button
          type="button" contenteditable="false"
          class="ginko-chip inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted px-1.5 align-baseline text-[0.9em] leading-snug font-medium text-foreground"
          :aria-label="t('editor.block.settingsFor', { label: chipName })" :title="factTitle" :data-empty="(isFact && facts !== undefined && !fact?.text) || undefined"
        >
          <Braces class="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span class="truncate">{{ chipText }}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent class="w-80" role="dialog" :aria-labelledby="titleId">
        <FactSettings
          v-if="isFact && options.components"
          :name="factName" :registry="options.components" :facts="facts" :slug="slug" :title-id="titleId"
          @pick="(name) => update({ ...values, name })" @remove="remove"
        />
        <ComponentSettings
          v-else-if="options.components"
          :tag="tag" :registry="options.components" :values="values" :required-first="requiredFirst" :title-id="titleId"
          @update="update" @convert="convert" @remove="remove"
        />
      </PopoverContent>
    </Popover>
    <NodeViewContent v-else as="span" class="ginko-inline-content rounded bg-muted px-1" />
  </NodeViewWrapper>
</template>

<style scoped>
.ginko-inline[data-selected] .ginko-chip { outline: 2px solid var(--ring); outline-offset: 1px; }
.ginko-chip { cursor: pointer; }
/* A fact without a value shows its label, dashed, so the gap on the page is visible in the text. */
.ginko-chip[data-empty] { border-style: dashed; color: var(--muted-foreground); }
.ginko-chip:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
</style>
