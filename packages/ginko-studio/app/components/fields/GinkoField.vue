<!-- One field of any type (UI.md 5): label, hint, the control, its errors. Translatable values are
     edited in `locale`; the rest of the Localized value stays as it is. -->
<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useI18n } from '#imports'
import type { Field, Json, Locale } from '@lupinum/ginko'
import { isTranslatable } from '@lupinum/ginko/internal'
import { messageOf } from '@studio/utils/messageOf'
import { ownIssues, TRANSLATION, type Issue } from '@lupinum/ginko-editor'
import GinkoFieldChoice from './GinkoFieldChoice.vue'
import GinkoFieldChoices from './GinkoFieldChoices.vue'
import GinkoFieldDate from './GinkoFieldDate.vue'
import GinkoFieldDaterange from './GinkoFieldDaterange.vue'
import GinkoFieldFile from './GinkoFieldFile.vue'
import GinkoFieldImage from './GinkoFieldImage.vue'
import GinkoFieldList from './GinkoFieldList.vue'
import GinkoFieldMoney from './GinkoFieldMoney.vue'
import GinkoFieldNumber from './GinkoFieldNumber.vue'
import GinkoFieldRef from './GinkoFieldRef.vue'
import FieldFrame from './FieldFrame.vue'
import { Badge } from '@studio/components/ui/badge'
import { Button } from '@studio/components/ui/button'
import { Input } from '@studio/components/ui/input'
import { Switch } from '@studio/components/ui/switch'
import { Textarea } from '@studio/components/ui/textarea'
import { useStudioSite } from '../../utils/labels'
import { languageName } from '../../utils/content'
import { useElementSize } from '@vueuse/core'
import MarkdownEditor from '@studio/components/editor/MarkdownEditor.vue'

const props = defineProps<{
  field: Field
  modelValue: Json | undefined
  path: string
  locale: Locale
  locales: readonly Locale[]
  issues: readonly Issue[]
  /** The value when the form opened, for lists that ask "Noch richtig?". */
  baseline?: Json
  /** A date that starts a week (task preset @workWeek/@nextWorkWeek). */
  weeks?: boolean
  /** The page address of the entry per language (`/veranstaltungen/[slug]`), for the preview under a slug field. */
  route?: Partial<Record<string, string>>
}>()
const emit = defineEmits<{ 'update:modelValue': [value: Json | undefined] }>()

const id = computed(() => `f-${props.path.replace(/[^a-zA-Z0-9_-]/g, '-')}`)
const translatable = computed(() => isTranslatable(props.field))
const errors = computed(() => ownIssues(props.issues, props.path, props.locales))

/** The value in the active locale for translatable fields, else the value itself. */
const value = computed<Json | undefined>(() => {
  if (!translatable.value) return props.modelValue
  const v = props.modelValue
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Json>)[props.locale] : undefined
})

function set(next: Json | undefined) {
  if (!translatable.value) return emit('update:modelValue', next)
  const current = props.modelValue && typeof props.modelValue === 'object' && !Array.isArray(props.modelValue) ? { ...(props.modelValue as Record<string, Json>) } : {}
  if (next === undefined || next === '') delete current[props.locale]
  else current[props.locale] = next
  emit('update:modelValue', Object.keys(current).length ? current : undefined)
}

const text = computed(() => (typeof value.value === 'string' ? value.value : ''))
// A slug is the web address of the entry: the Studio names it that way, whatever the schema calls it.
const isSlug = computed(() => props.field.type === 'slug')
const { t, locale: uiLocale } = useI18n()
const label = computed(() => (isSlug.value ? t('fields.slug.label') : shown(props.field.label)))
const hint = computed(() => {
  const pattern = props.route?.[props.locale] ?? Object.values(props.route ?? {})[0]
  if (isSlug.value && pattern && text.value) return t('fields.slug.pageAt', { address: pattern.replace('[slug]', text.value) })
  return props.field.hint === undefined ? undefined : shown(props.field.hint)
})
const max = computed(() => ('max' in props.field && typeof props.field.max === 'number' ? props.field.max : undefined))
const showCount = computed(() => (props.field.type === 'text' || props.field.type === 'longtext') && max.value !== undefined && text.value.length >= max.value * 0.8)
const inputType = computed(() => (props.field.type === 'text' && props.field.format ? ({ url: 'url', email: 'email', tel: 'tel' } as const)[props.field.format] : 'text'))
// A choice with up to five options shows radio buttons (GinkoFieldChoice), more a select.
const radios = computed(() => props.field.type === 'choice' && props.field.options.length <= 5)
// Single-line controls carry their label inside the box (Prime look). Groups, Markdown, switches and dates (their
// Today/Tomorrow buttons sit next to the box) keep it above.
const contained = computed(() => ['text', 'longtext', 'number', 'money', 'time'].includes(props.field.type) || (props.field.type === 'choice' && !radios.value))
const isGroup = computed(() => ['list', 'choices', 'daterange', 'image', 'file'].includes(props.field.type))

// Translation view (UI.md 4): the main language's value next to the input, and whether it changed
// since the translation was saved. The state comes from the editor (EntryEditor); lists reuse it per cell.
const { shown } = useStudioSite()
const translation = inject(TRANSLATION, undefined)
const hasPhoto = computed(() => props.field.type === 'image' && !!value.value && typeof value.value === 'object' && !Array.isArray(value.value) && 'file' in value.value)
const leaf = computed(() => {
  if (!translation) return undefined
  if (isTranslatable(props.field) && props.field.type !== 'slug') return props.path
  if (hasPhoto.value) return `${props.path}.alt`
  return undefined
})
const trState = computed(() => (leaf.value ? translation?.state(leaf.value) : undefined))
const foreignTab = computed(() => !!translation && props.locale !== props.locales[0])
const foreignName = computed(() => languageName(props.locale, uiLocale.value))
// A picture applies to every language: a translation edits only its description (new-picture-alt).
const altOnly = computed(() => (foreignTab.value ? translation!.mainName() : undefined))

// The whole main-language text: Markdown as the editor shows it (headings, links, pictures), long texts folded to
// about twelve lines with "Ganzen Text zeigen". The fold shows only when the text is longer than that.
const source = computed(() => (leaf.value && translation ? translation.source(leaf.value) : ''))
const sourceInner = ref<HTMLElement>()
const { height: sourceHeight } = useElementSize(sourceInner)
const FOLD_PX = 288
const foldable = computed(() => (props.field.type === 'markdown' || props.field.type === 'longtext') && sourceHeight.value > FOLD_PX)
const folded = ref(true)
// A missing text can start from the main-language one: names and years that stay, or a Markdown body with its
// headings, links and pictures, translated in place. Never for pictures or choices.
const copyable = computed(() => trState.value === 'missing' && !!source.value && ['text', 'longtext', 'markdown'].includes(props.field.type))
</script>

<template>
  <FieldFrame :id="id" :label="label" :hint="hint" :optional="!!field.optional" :errors="errors.map((e) => messageOf(e))" :group="isGroup" :inline="field.type === 'boolean'" :contained="contained" :short="['number', 'money', 'time'].includes(field.type)" :count="showCount ? `${text.length}/${max}` : undefined">
    <template v-if="trState && translation" #source>
      <div class="grid gap-2 rounded-md bg-muted p-3 text-sm" data-slot="translation-source">
        <p class="text-xs font-semibold text-muted-foreground">{{ translation.mainName() }}</p>
        <div :id="`${id}-source-text`" :class="foldable && folded && 'max-h-72 overflow-hidden [mask-image:linear-gradient(to_bottom,black_80%,transparent)]'">
          <div ref="sourceInner">
            <ClientOnly v-if="field.type === 'markdown' && source">
              <MarkdownEditor :id="`${id}-source`" readonly :field="field" :model-value="source" :invalid="false" :content-locale="locales[0]" />
            </ClientOnly>
            <p v-else class="whitespace-pre-wrap [overflow-wrap:anywhere]">{{ source || '–' }}</p>
          </div>
        </div>
        <Button v-if="foldable" type="button" variant="link" size="sm" class="h-auto justify-self-start px-0" :aria-expanded="!folded" :aria-controls="`${id}-source-text`" @click="folded = !folded">
          {{ folded ? t('fields.translation.showAll') : t('fields.translation.showLess') }}
        </Button>
        <div v-if="trState === 'stale'" class="flex flex-wrap items-center gap-2">
          <Badge variant="outline" class="h-auto border-warning py-1 whitespace-normal text-warning">{{ t('fields.translation.changedSince', { name: translation.mainName() }) }}</Badge>
          <Button type="button" variant="outline" size="sm" @click="translation.confirm(leaf!)">{{ t('fields.translation.fitsAsIs', { lang: foreignName }) }}</Button>
          <Button v-if="translation.changesUrl()" as-child variant="link" size="sm" class="px-0">
            <NuxtLink :to="translation.changesUrl()">{{ t('fields.translation.whatChanged') }}</NuxtLink>
          </Button>
        </div>
        <template v-else-if="trState === 'missing'">
          <p class="text-warning">{{ translation.missingNote(leaf!) }}</p>
          <Button v-if="copyable" type="button" variant="outline" size="sm" class="justify-self-start" @click="set(source)">{{ t('fields.translation.useSource', { name: translation.mainName() }) }}</Button>
        </template>
      </div>
    </template>

    <template #default="{ describedBy, invalid }">
      <Input v-if="field.type === 'text'" :id="id" :type="inputType" :model-value="text" :maxlength="max" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="set(String($event))" />
      <Textarea v-else-if="field.type === 'longtext'" :id="id" class="min-h-24" :model-value="text" :maxlength="max" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="set(String($event))" />
      <GinkoFieldNumber v-else-if="field.type === 'number'" :id="id" :field="field" :model-value="value" :invalid="invalid" :described-by="describedBy" @update:model-value="set" />
      <GinkoFieldMoney v-else-if="field.type === 'money'" :id="id" :field="field" :model-value="value" :invalid="invalid" :described-by="describedBy" @update:model-value="set" />
      <Switch v-else-if="field.type === 'boolean'" :id="id" :model-value="value === true" :aria-describedby="describedBy" @update:model-value="set($event === true)" />
      <GinkoFieldDate v-else-if="field.type === 'date'" :id="id" :model-value="value" :invalid="invalid" :described-by="describedBy" :optional="!!field.optional" :weeks="weeks" @update:model-value="set" />
      <Input v-else-if="field.type === 'time'" :id="id" type="time" :model-value="typeof value === 'string' ? value : ''" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="set(String($event) || undefined)" />
      <GinkoFieldDaterange v-else-if="field.type === 'daterange'" :id="id" :model-value="value" :invalid="invalid" :described-by="describedBy" @update:model-value="set" />
      <GinkoFieldChoice v-else-if="field.type === 'choice'" :id="id" :field="field" :model-value="value" :invalid="invalid" :described-by="describedBy" @update:model-value="set" />
      <GinkoFieldChoices v-else-if="field.type === 'choices'" :id="id" :field="field" :model-value="value" :invalid="invalid" :described-by="describedBy" @update:model-value="set" />
      <GinkoFieldList v-else-if="field.type === 'list'" :id="id" :field="field" :model-value="value" :baseline="baseline" :path="path" :locale="locale" :locales="locales" :issues="issues" @update:model-value="set" />
      <!-- The editor needs the browser (TipTap mounts into a DOM element), so it is not rendered on the server. -->
      <ClientOnly v-else-if="field.type === 'markdown'">
        <MarkdownEditor :id="id" :field="field" :model-value="value" :invalid="invalid" :described-by="describedBy" :content-locale="locale" @update:model-value="set" />
        <template #fallback><div class="min-h-[11.5rem] rounded-md border border-input bg-background" aria-hidden="true" /></template>
      </ClientOnly>
      <GinkoFieldImage v-else-if="field.type === 'image'" :id="id" :field="field" :model-value="value" :locale="locale" :alt-only="altOnly" :invalid="invalid" :described-by="describedBy" @update:model-value="set" />
      <GinkoFieldFile v-else-if="field.type === 'file'" :id="id" :field="field" :model-value="value" :invalid="invalid" :described-by="describedBy" @update:model-value="set" />
      <GinkoFieldRef v-else-if="field.type === 'ref'" :id="id" :field="field" :model-value="value" :invalid="invalid" :described-by="describedBy" @update:model-value="set" />
      <p v-else-if="field.type === 'slug'" :id="id" class="rounded-md bg-muted px-3 py-2.5 font-mono text-sm text-muted-foreground">{{ text || t('fields.slug.generated') }}</p>
    </template>
  </FieldFrame>
</template>
