<!-- One prop of a component in the settings popover: label, hint, the control for its type, the message.
     It keeps what is typed (`draft`) apart from the applied value, so a refused value stays visible next to
     its message while the block keeps the last valid one. The parent checks the value (propProblem).
     An image prop: a picture from the Files library (stored as `$file.<id>`, shown as a thumbnail), or a web address. -->
<script setup lang="ts">
import { computed, defineAsyncComponent, inject, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from '#imports'
import { fileRefOf } from '@lupinum/ginko/internal'
import { BLOCKERS, propMax, shownSrc, type PropField, type PropValue } from '@lupinum/ginko-editor'
import { Button } from '@studio/components/ui/button'
import { Checkbox } from '@studio/components/ui/checkbox'
import { Input } from '@studio/components/ui/input'
import { Label } from '@studio/components/ui/label'
import { NumberField, NumberFieldContent, NumberFieldDecrement, NumberFieldIncrement, NumberFieldInput } from '@studio/components/ui/number-field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@studio/components/ui/select'
import { Switch } from '@studio/components/ui/switch'
import { TagsInput, TagsInputInput, TagsInputItem, TagsInputItemDelete, TagsInputItemText } from '@studio/components/ui/tags-input'
import { Textarea } from '@studio/components/ui/textarea'
import { useStudioSite } from '../../utils/labels'
import type { Chosen } from '../files/LibraryPickerBody.vue'
import { textAltOf } from '../files/util'
import { EDITOR_FILES } from './context.ts'

const props = defineProps<{ name: string; field: PropField; modelValue: PropValue; error?: string }>()
/** `pick`: a picture from the library, with the description it brings in the text's language (may be empty). */
const emit = defineEmits<{ change: [value: PropValue]; pick: [picked: { src: string; alt: string }] }>()

const { shown } = useStudioSite()
const { t } = useI18n()
const id = useId()
const hintId = `${id}-hint`
const errorId = `${id}-err`
const describedBy = computed(() => [props.field.hint ? hintId : '', props.error ? errorId : ''].filter(Boolean).join(' ') || undefined)
// An invalid value is never applied to the block; while it shows, saving the text waits, so a cut-off value is not saved unnoticed.
const blockers = inject(BLOCKERS, undefined)
watch(() => props.error, (error) => {
  if (error) blockers?.set(id, `${shown(props.field.label)}: ${error}`)
  else blockers?.delete(id)
}, { immediate: true })
onBeforeUnmount(() => blockers?.delete(id))

/** Stands for "not set" in the select (the select does not take an empty value). */
const UNSET = '__unset__'
/** Up to this many options a list of choices is shown as checkboxes, beyond that as tags. */
const CHECKBOX_LIMIT = 6

const text = ref(typeof props.modelValue === 'string' ? props.modelValue : '')
const number = ref<number | undefined>(typeof props.modelValue === 'number' ? props.modelValue : undefined)
// What the block has now wins when it differs from what was last handed out (undo, another edit).
let handedOut: PropValue = props.modelValue
watch(() => props.modelValue, (value) => {
  if (JSON.stringify(value) === JSON.stringify(handedOut)) return
  handedOut = value
  text.value = typeof value === 'string' ? value : ''
  number.value = typeof value === 'number' ? value : undefined
})
function send(value: PropValue) {
  handedOut = value
  emit('change', value)
}

const inputType = computed(() => (props.field.type === 'text' && props.field.format === 'url' ? 'url' : 'text'))
const max = computed(() => propMax(props.field))
const options = computed(() => ('options' in props.field ? props.field.options : []))
const chosen = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : []))
const defaultLabel = computed(() => {
  const field = props.field
  if (field.type !== 'choice' || field.default === undefined) return t('editor.prop.notSet')
  const label = field.options.find((o) => o.value === field.default)?.label
  return t('editor.prop.default', { value: label === undefined ? String(field.default) : shown(label) })
})

// --- image: the library picker and the thumbnail ------------------------------------------------------------------
const files = inject(EDITOR_FILES, undefined)
// The library loads when it is opened for the first time.
const LibraryPicker = defineAsyncComponent(() => import('../files/LibraryPicker.vue'))
const libraryOpen = ref(false)
/** True while the value is a library file: the address input then stays empty (it would show the bare ID). */
const isFile = computed(() => fileRefOf(text.value) !== undefined)
watch(text, (value) => files?.images.want(value), { immediate: true })
const thumbnail = computed(() => (isFile.value ? shownSrc(files?.images, text.value) : undefined))

function fromLibrary(chosen: Chosen) {
  libraryOpen.value = false
  const src = `$file.${chosen.id}`
  text.value = src
  handedOut = src
  emit('pick', { src, alt: textAltOf(chosen, files?.locale() ?? '') })
}

function toggle(value: string, on: boolean) {
  const next = on ? [...chosen.value, value] : chosen.value.filter((v) => v !== value)
  const order = options.value.map((o) => o.value)
  send(next.sort((a, b) => order.indexOf(a) - order.indexOf(b)))
}
</script>

<template>
  <div class="grid gap-1.5" :data-prop="name">
    <div v-if="field.type === 'boolean'" class="flex items-center justify-between gap-3">
      <Label :for="id">{{ shown(field.label) }}</Label>
      <Switch :id="id" :model-value="modelValue === true" :aria-describedby="describedBy" @update:model-value="send(Boolean($event))" />
    </div>
    <template v-else>
      <Label :for="field.type === 'choices' && options.length <= CHECKBOX_LIMIT ? undefined : id" :id="`${id}-label`">
        {{ shown(field.label) }}<span v-if="field.optional" class="font-normal text-muted-foreground">{{ t('editor.prop.optional') }}</span>
      </Label>

      <div v-if="field.type === 'image'" class="grid gap-2">
        <img v-if="thumbnail" :src="thumbnail" alt="" class="max-h-32 w-fit max-w-full rounded-md border object-contain">
        <p v-else-if="thumbnail === null" class="text-sm text-muted-foreground">{{ t('editor.image.missing') }}</p>
        <div class="flex flex-wrap gap-2">
          <Button v-if="files" type="button" variant="secondary" size="sm" @click="libraryOpen = true">
            {{ isFile ? t('editor.prop.changeImage') : t('editor.prop.chooseImage') }}
          </Button>
          <Button v-if="isFile && field.optional" type="button" variant="ghost" size="sm" @click="text = ''; send(undefined)">{{ t('fields.remove') }}</Button>
        </div>
        <Input
          :id="id" :model-value="isFile ? '' : text" type="url" inputmode="url" autocomplete="off" :spellcheck="false" class="h-8 text-sm"
          :aria-invalid="error !== undefined" :aria-describedby="describedBy" :placeholder="t('editor.prop.imagePlaceholder')"
          @update:model-value="text = String($event); send(text)"
        />
        <LibraryPicker v-if="libraryOpen" v-model:open="libraryOpen" kind="image" :locale="files?.locale() ?? ''" @choose="fromLibrary" />
      </div>
      <Input
        v-else-if="field.type === 'text' || field.type === 'ref'"
        :id="id" v-model="text" :type="inputType" :inputmode="inputType === 'url' ? 'url' : undefined" :maxlength="undefined" autocomplete="off" :spellcheck="inputType !== 'url'"
        :aria-invalid="error !== undefined" :aria-describedby="describedBy"
        @update:model-value="send(String($event))"
      />
      <Textarea
        v-else-if="field.type === 'longtext'"
        :id="id" v-model="text" rows="3" :aria-invalid="error !== undefined" :aria-describedby="describedBy" @update:model-value="send(String($event))"
      />

      <Select
        v-else-if="field.type === 'choice'"
        :model-value="typeof modelValue === 'string' ? modelValue : field.optional ? UNSET : undefined"
        @update:model-value="send($event === UNSET ? undefined : String($event))"
      >
        <SelectTrigger :id="id" class="w-full" :aria-invalid="error !== undefined" :aria-describedby="describedBy">
          <SelectValue :placeholder="t('editor.prop.choose')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-if="field.optional" :value="UNSET">{{ defaultLabel }}</SelectItem>
          <SelectItem v-for="o in options" :key="o.value" :value="o.value">{{ shown(o.label) }}</SelectItem>
        </SelectContent>
      </Select>

      <div v-else-if="field.type === 'choices' && options.length <= CHECKBOX_LIMIT" role="group" :aria-labelledby="`${id}-label`" :aria-describedby="describedBy" class="grid gap-2">
        <div v-for="o in options" :key="o.value" class="flex items-center gap-2">
          <Checkbox :id="`${id}-${o.value}`" :model-value="chosen.includes(o.value)" @update:model-value="toggle(o.value, $event === true)" />
          <Label :for="`${id}-${o.value}`" class="font-normal">{{ shown(o.label) }}</Label>
        </div>
      </div>
      <TagsInput
        v-else-if="field.type === 'choices'"
        :model-value="chosen" :aria-invalid="error !== undefined" @update:model-value="send($event.map(String))"
      >
        <TagsInputItem v-for="v in chosen" :key="v" :value="v">
          <TagsInputItemText class="px-2 text-xs" />
          <TagsInputItemDelete />
        </TagsInputItem>
        <TagsInputInput :id="id" :aria-describedby="describedBy" class="min-w-24 flex-1 bg-transparent outline-none" />
      </TagsInput>

      <NumberField
        v-else-if="field.type === 'number'"
        :id="id" v-model="number" :min="field.min" :max="field.max" :step="field.step" :allow-invalid="true" :step-snapping="false"
        :aria-invalid="error !== undefined" :aria-describedby="describedBy"
        @update:model-value="send($event === undefined || $event === null || Number.isNaN($event) ? undefined : $event)"
      >
        <NumberFieldContent>
          <NumberFieldDecrement />
          <NumberFieldInput :aria-invalid="error !== undefined" :aria-describedby="describedBy" />
          <NumberFieldIncrement />
        </NumberFieldContent>
      </NumberField>
    </template>

    <p v-if="field.hint" :id="hintId" class="text-xs text-muted-foreground">{{ shown(field.hint) }}</p>
    <p v-if="max !== undefined && (field.type === 'text' || field.type === 'longtext') && text.length >= max * 0.8" class="justify-self-end text-xs text-muted-foreground" aria-live="polite">{{ text.length }}/{{ max }}</p>
    <p v-if="error" :id="errorId" role="alert" class="text-sm text-destructive">{{ error }}</p>
  </div>
</template>
