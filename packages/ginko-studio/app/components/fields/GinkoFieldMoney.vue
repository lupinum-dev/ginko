<!-- Money as the person types it ("12,5", "12.50", "12"); stored as { amount } in the minor units of the currency (SPEC 2.2). -->
<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch, watchEffect } from 'vue'
import { useI18n } from '#imports'
import type { Field, Json } from '@lupinum/ginko'
import { minorDigits } from '@lupinum/ginko/internal'
import { BLOCKERS, currencySign, formatAmount, parseMoney } from '@lupinum/ginko-editor'
import { Input } from '@studio/components/ui/input'
import { useStudioSite } from '../../utils/labels'

const props = defineProps<{ id: string; field: Extract<Field, { type: 'money' }>; modelValue: Json | undefined; invalid: boolean; describedBy?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: Json | undefined] }>()

const amountOf = (v: Json | undefined) => (v && typeof v === 'object' && !Array.isArray(v) && typeof (v as { amount?: unknown }).amount === 'number' ? (v as { amount: number }).amount : undefined)
const site = useStudioSite()
const { t } = useI18n()
// The field's own currency, else the site's; typed and shown in the notation of the Studio language.
const currency = computed(() => props.field.currency ?? site.currency())
const locale = computed(() => site.locale() || 'de')
const show = (amount: number) => formatAmount(amount, currency.value, locale.value)
const text = ref(amountOf(props.modelValue) !== undefined ? show(amountOf(props.modelValue)!) : '')
const bad = ref(false)
// Only a change from outside (undo, a conflict, a new form) rewrites the text; the value this field
// emitted itself never does, so a half-typed "23," stays as typed.
let emitted: number | undefined | null = null
watch(() => props.modelValue, (v) => {
  const a = amountOf(v)
  const own = emitted !== null && a === emitted
  // The guard covers exactly the next update, the one this emit causes.
  emitted = null
  if (own) return
  text.value = a !== undefined ? show(a) : ''
  // A value from outside (undo, "Neuen Stand übernehmen") replaces the unreadable text, and with it the hint (Astra 9).
  bad.value = false
})
function input(raw: string) {
  text.value = raw
  const amount = parseMoney(raw, currency.value, locale.value)
  bad.value = raw.trim() !== '' && amount === null
  emitted = amount ?? undefined
  emit('update:modelValue', amount === null ? undefined : { amount })
}
/** What is wrong with the typed text, in the person's words; empty when it is a valid amount or empty. */
const hint = computed(() => !bad.value ? '' : text.value.includes('-') ? t('fields.money.negative') : t('fields.money.invalid', { example: show(Math.round(12.5 * 10 ** minorDigits(currency.value))) }))
// Unreadable text blocks saving with this hint, instead of the server's "fehlt" for a value never sent (break-it 9).
const blockers = inject(BLOCKERS, undefined)
watchEffect(() => {
  if (!blockers) return
  if (hint.value) blockers.set(props.id, `${site.shown(props.field.label)}: ${hint.value}`)
  else blockers.delete(props.id)
})
onBeforeUnmount(() => blockers?.delete(props.id))
function tidy() {
  const a = amountOf(props.modelValue)
  if (a !== undefined) text.value = show(a)
}
</script>

<template>
  <div class="flex items-center gap-2">
    <Input :id="id" inputmode="decimal" autocomplete="off" class="min-w-0 flex-1" :model-value="text" :aria-invalid="invalid || bad" :aria-describedby="[describedBy, bad ? `${id}-bad` : ''].filter(Boolean).join(' ') || undefined" @update:model-value="input(String($event))" @blur="tidy" />
    <span class="font-medium text-muted-foreground">{{ currencySign(currency, locale) }}</span>
  </div>
  <p v-if="hint" :id="`${id}-bad`" role="alert" class="text-sm font-medium text-destructive">{{ hint }}</p>
</template>
