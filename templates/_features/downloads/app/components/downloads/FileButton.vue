<script setup lang="ts">
import { Download } from '@lucide/vue'

/** One document of the downloads brick, by id, as a secondary button: `label`, then file type, size and the document's
 *  language when it is not the page's ("PDF, 240 kB, English"). Another feature shows it without knowing the brick:
 *  the services page finds this file and passes a product's `sheet`. Nothing when the id names no document. */
const props = defineProps<{ id: string, label: string }>()
const downloads = useGinko('downloads')
const { type, size, languageName, hreflang, mediaType } = useDownloadText()
const doc = computed(() => downloads.value.items.find((item) => item.id === props.id)?.data)
</script>

<template>
  <Button v-if="doc" as-child size="lg" variant="outline" class="max-sm:w-full">
    <a :href="doc.file.url" :type="mediaType(doc)" :hreflang="hreflang(doc)">
      <Download aria-hidden="true" />{{ label }}
      <span class="font-normal text-muted-foreground tabular-nums">{{ [type(doc), size(doc), languageName(doc)].filter(Boolean).join(', ') }}</span>
    </a>
  </Button>
</template>
