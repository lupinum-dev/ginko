<!-- "Ändern" next to an entry's address, for owners and admins (SLUG_CHANGE): a small form with the address around the
     new slug. A live page keeps its old address as a forward (entries.changeSlug); the field shows the new slug once
     the entry comes back from the server. -->
<script setup lang="ts">
import { computed, inject, nextTick, ref } from 'vue'
import { useI18n } from '#imports'
import type { Locale } from '@lupinum/ginko'
import { slugify } from '@lupinum/ginko/internal'
import { Button } from '@studio/components/ui/button'
import { Input } from '@studio/components/ui/input'
import { opErrorOf } from '../../composables/useOps'
import { SLUG_CHANGE } from '../../utils/slugChange'

const props = defineProps<{ id: string; slug: string; locale: Locale; before: string; after: string }>()
const { t } = useI18n()
const ctx = inject(SLUG_CHANGE, undefined)
const enabled = computed(() => !!ctx?.enabled() && !!props.slug)

const open = ref(false)
const value = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const input = ref<{ $el: HTMLInputElement } | null>(null)
const opener = ref<{ $el: HTMLElement } | null>(null)

async function start() {
  value.value = props.slug
  error.value = null
  open.value = true
  await nextTick()
  input.value?.$el.focus()
}

async function close() {
  open.value = false
  await nextTick()
  opener.value?.$el.focus()
}

async function submit() {
  // Typed text becomes a slug the way a new entry's title does ("Sommer Fest" → "sommer-fest").
  const slug = slugify(value.value)
  if (!slug || slug === props.slug) return close()
  busy.value = true
  error.value = null
  try {
    await ctx!.change(props.locale, slug)
    await close()
  } catch (err) {
    error.value = opErrorOf(err).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <template v-if="enabled">
    <Button v-if="!open" ref="opener" type="button" variant="ghost" size="sm" class="-my-1 flex-none" :aria-describedby="id" @click="start">{{ t('fields.slug.change') }}</Button>
    <form v-else class="grid basis-full gap-2 pt-1" @submit.prevent="submit">
      <label :for="`${id}-new`" class="text-sm font-medium">{{ t('fields.slug.newAddress') }}</label>
      <div class="flex min-w-0 items-center gap-1 text-sm">
        <span class="flex-none text-muted-foreground">{{ before }}</span>
        <Input :id="`${id}-new`" ref="input" v-model="value" class="min-w-0 flex-1" autocomplete="off" spellcheck="false" :aria-invalid="!!error" :aria-describedby="`${id}-new-hint`" />
        <span v-if="after" class="flex-none text-muted-foreground">{{ after }}</span>
      </div>
      <p :id="`${id}-new-hint`" class="text-[13px] text-muted-foreground">{{ ctx!.live() ? t('fields.slug.forwards') : t('fields.slug.notOnline') }}</p>
      <p v-if="error" class="font-semibold text-destructive" role="alert">{{ error }}</p>
      <div class="flex flex-wrap gap-2">
        <Button type="submit" size="sm" :disabled="busy">{{ t('fields.slug.save') }}</Button>
        <Button type="button" variant="ghost" size="sm" :disabled="busy" @click="close">{{ t('site.common.cancel') }}</Button>
      </div>
    </form>
  </template>
</template>
