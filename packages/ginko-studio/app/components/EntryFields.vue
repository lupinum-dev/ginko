<!-- A run of fields of one entry form. Fields whose `showWhen` does not match stay mounted and hidden (their input stays).
     A choices field with `askAgainWhen` asks "Noch richtig?" when the text it names changed and the choice did not. -->
<script setup lang="ts">
import { computed, inject, onBeforeUnmount, watchEffect } from 'vue'
import { useI18n } from '#imports'
import type { Field, Json, Locale } from '@lupinum/ginko'
import { isShown } from '@lupinum/ginko/internal'
import { BLOCKERS, textIn, type Issue } from '@lupinum/ginko-editor'
import { Button } from '@studio/components/ui/button'
import GinkoField from './fields/GinkoField.vue'
import type { WeekOffset } from '../utils/content'
import { useStillRight } from '../composables/useStillRight'
import { useStudioSite } from '../utils/labels'

const props = defineProps<{
  entries: [string, Field][]
  /** All fields of the entry: the text a field asks about may sit in another group. */
  all: Record<string, Field>
  draft: Record<string, Json | undefined>
  baseline: Record<string, Json | undefined>
  locale: Locale
  locales: readonly Locale[]
  issues: Issue[]
  route?: Partial<Record<Locale, string>>
  /** The week shortcuts of a field that takes a week start (`weekShortcuts`); undefined for any other field. */
  weeks?: (key: string) => readonly WeekOffset[] | undefined
}>()
const emit = defineEmits<{ update: [key: string, value: Json | undefined] }>()

const { t } = useI18n()
const { shown: labelText } = useStudioSite()
const blockers = inject(BLOCKERS, undefined)
const stillRight = useStillRight()
const main = computed(() => props.locales[0] ?? props.locale)
const blockerKey = (key: string) => `${key}.askAgain`
/** The text a choices field asks again about, or undefined. */
const askedKey = (field: Field) => field.type === 'choices' ? field.askAgainWhen : undefined
// Only a change in the main language asks: a translation does not change the dish.
const asking = computed(() => new Set(props.entries.filter(([key, field]) => {
  const asked = askedKey(field)
  if (asked === undefined || !isShown(field, props.draft)) return false
  const saved = key in props.baseline ? { text: textIn(props.baseline[asked], main.value), choice: props.baseline[key] } : undefined
  return stillRight.asks(blockerKey(key), { text: textIn(props.draft[asked], main.value), choice: props.draft[key] }, saved)
}).map(([key]) => key)))
const showAsk = (key: string) => asking.value.has(key) && props.locale === main.value
const askedLabel = (field: Field) => labelText(props.all[askedKey(field)!]!.label)
const confirm = (key: string, field: Field) => stillRight.confirm(blockerKey(key), textIn(props.draft[askedKey(field)!], main.value))

watchEffect(() => {
  if (!blockers) return
  for (const [key, field] of props.entries) {
    if (asking.value.has(key)) blockers.set(blockerKey(key), t('fields.confirmBlocker', { label: labelText(field.label) }))
    else blockers.delete(blockerKey(key))
  }
})
onBeforeUnmount(() => { if (blockers) for (const [key] of props.entries) blockers.delete(blockerKey(key)) })
</script>

<template>
  <template v-for="[key, field] in entries" :key="key">
    <div v-if="askedKey(field) !== undefined" v-show="isShown(field, draft)" :class="{ 'rounded-md bg-warning/10 p-3': showAsk(key) }">
      <GinkoField
        :field="field" :model-value="draft[key]" :baseline="baseline[key]" :path="key"
        :locale="locale" :locales="locales" :issues="issues" :route="route" :weeks="weeks?.(key)" @update:model-value="emit('update', key, $event)"
      />
      <div v-if="showAsk(key)" class="check mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-warning">
        <p>{{ t('fields.list.changed', { changed: askedLabel(field), label: labelText(field.label) }) }}</p>
        <Button type="button" variant="outline" size="sm" @click="confirm(key, field)">{{ t('fields.list.confirm') }}</Button>
      </div>
    </div>
    <GinkoField
      v-else v-show="isShown(field, draft)" :field="field" :model-value="draft[key]" :baseline="baseline[key]" :path="key"
      :locale="locale" :locales="locales" :issues="issues" :route="route" :weeks="weeks?.(key)" @update:model-value="emit('update', key, $event)"
    />
  </template>
</template>
