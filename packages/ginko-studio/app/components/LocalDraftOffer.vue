<!-- Input this browser kept from an earlier visit (N2): offered back above the form, never applied without a yes. -->
<script setup lang="ts">
import { HistoryIcon } from '@lucide/vue'
import { Alert, AlertDescription, AlertTitle } from '@studio/components/ui/alert'
import { Button } from '@studio/components/ui/button'

const props = defineProps<{ savedAt: number; busy?: boolean }>()
const emit = defineEmits<{ restore: []; discard: [] }>()
const { t, format } = useI18n()
// The device's own clock: the person typed it here.
const time = computed(() => format.date(props.savedAt, { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))
</script>

<template>
  <!-- The notice look of the editor (gone, conflict, this offer): a tinted box with icon, title, text and actions. -->
  <Alert role="status" class="gap-y-2 rounded-lg border-0 bg-primary/10 p-4 [&>svg]:text-primary">
    <HistoryIcon aria-hidden="true" />
    <AlertTitle class="line-clamp-none font-semibold">{{ t('entry.localDraft.offer', { time }) }}</AlertTitle>
    <AlertDescription class="flex flex-wrap gap-2 pt-1">
      <Button type="button" size="sm" :disabled="busy" @click="emit('restore')">{{ t('entry.localDraft.restore') }}</Button>
      <Button type="button" variant="ghost" size="sm" :disabled="busy" @click="emit('discard')">{{ t('entry.localDraft.discard') }}</Button>
    </AlertDescription>
  </Alert>
</template>
