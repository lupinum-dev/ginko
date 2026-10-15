<!-- How full the site is (SPEC 3 budget), on every page and for every role: from 80 % of the storage or of the
     entry count a warning band, at 100 % a red one. An owner or admin can hide the warning for this browser session;
     the full band stays, because new entries and growing saves now fail. Removed entries count neither. -->
<script setup lang="ts">
import { useI18n } from '#imports'
import { computed, onMounted, ref } from 'vue'
import { SITE_BUDGET } from '@lupinum/ginko/internal'
import { XIcon } from '@lucide/vue'
import { Button } from '@studio/components/ui/button'
import { sizeText } from '../utils/size'

const props = defineProps<{ slug: string; bytes: number; entryCount: number; /** Owner or admin. */ manager: boolean }>()
const { t, format } = useI18n()

type Level = 'near' | 'full' | undefined
const levelOf = (used: number, limit: number): Level => (used >= limit ? 'full' : used >= limit * 0.8 ? 'near' : undefined)
const storage = computed(() => levelOf(props.bytes, SITE_BUDGET.siteBytes))
const entries = computed(() => levelOf(props.entryCount, SITE_BUDGET.entries))
const level = computed<Level>(() => (storage.value === 'full' || entries.value === 'full' ? 'full' : storage.value ?? entries.value))

const text = computed(() => {
  const size = (bytes: number) => sizeText(bytes, format.number)
  const lines: string[] = []
  if (storage.value) lines.push(t(storage.value === 'full' ? 'site.storage.full' : 'site.storage.near', { used: size(props.bytes), limit: size(SITE_BUDGET.siteBytes) }))
  // The limit that is reached comes first: a full entry count leads, a storage only near comes after it.
  const count = t(entries.value === 'full' ? 'site.storage.entriesFull' : 'site.storage.entries', { count: format.number(props.entryCount), limit: format.number(SITE_BUDGET.entries) })
  if (entries.value === 'full' && storage.value !== 'full') lines.unshift(count)
  else if (entries.value) lines.push(count)
  // Shorter texts free storage, not entries: with only the count high, the hint names removing alone.
  lines.push(t(storage.value ? 'site.storage.hint' : 'site.storage.entriesHint'))
  return lines.join(' ')
})

// Hidden for the session per site. Storage may be blocked (private mode): then the warning simply shows again.
const key = computed(() => `ginko:storage-notice:${props.slug}`)
const dismissed = ref(false)
onMounted(() => {
  try { dismissed.value = sessionStorage.getItem(key.value) === 'near' } catch { /* storage blocked */ }
})
function dismiss() {
  dismissed.value = true
  try { sessionStorage.setItem(key.value, 'near') } catch { /* storage blocked */ }
}
const shown = computed(() => level.value === 'full' || (level.value === 'near' && !(props.manager && dismissed.value)))
</script>

<template>
  <div v-if="shown" :class="['flex items-start gap-2 rounded-md p-3', level === 'full' ? 'bg-destructive/10 font-medium text-destructive' : 'bg-warning/10']" role="status">
    <p class="min-w-0 flex-1">{{ text }}</p>
    <Button v-if="level === 'near' && manager" type="button" variant="ghost" size="icon-sm" class="-my-1 -mr-1" :aria-label="t('site.storage.dismiss')" @click="dismiss"><XIcon aria-hidden="true" /></Button>
  </div>
</template>
