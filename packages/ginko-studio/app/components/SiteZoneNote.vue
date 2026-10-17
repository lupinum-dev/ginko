<!-- Studio times are the site's. Said once per screen, and only to a person whose device is in another zone. -->
<script setup lang="ts">
import { useI18n } from '#imports'
import { onMounted, ref } from 'vue'
import { deviceZone } from '../utils/when'

const props = defineProps<{
  zone: string
  /** Under a time input: "Time of the website (…), not the time on your device." */
  input?: boolean
}>()
const { t } = useI18n()

// Read after mounting: the server renders without the device's zone, so hydration stays equal.
const other = ref(false)
onMounted(() => { other.value = deviceZone() !== props.zone })
</script>

<template>
  <p v-if="other" class="text-sm text-muted-foreground">{{ input ? t('entry.publish.siteZone', { zone }) : t('site.zoneNote', { zone }) }}</p>
</template>
