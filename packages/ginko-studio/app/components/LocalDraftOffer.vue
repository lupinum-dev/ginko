<!-- Input this browser kept from an earlier visit (N2): offered back above the form, never applied without a yes. -->
<script setup lang="ts">
import { Button } from '@studio/components/ui/button'

const props = defineProps<{ savedAt: number; busy?: boolean }>()
const emit = defineEmits<{ restore: []; discard: [] }>()
const { t, format } = useI18n()
// The device's own clock: the person typed it here.
const time = computed(() => format.date(props.savedAt, { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))
</script>

<template>
  <div class="grid gap-2 rounded-md bg-primary/10 p-3" role="status">
    <p class="font-medium">{{ t('entry.localDraft.offer', { time }) }}</p>
    <div class="flex flex-wrap gap-2">
      <Button type="button" :disabled="busy" @click="emit('restore')">{{ t('entry.localDraft.restore') }}</Button>
      <Button type="button" variant="ghost" :disabled="busy" @click="emit('discard')">{{ t('entry.localDraft.discard') }}</Button>
    </div>
  </div>
</template>
