<!-- Synced from templates/_features/downloads/app/components/downloads/List.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import { Download } from '@lucide/vue'

/** Files to download as rows: title (a direct link to the file), summary, and date, file type and size. The language
 *  of a document shows when it is not the language of the page ("English" on the German page); a document without
 *  one is in the site's main language. */
defineProps<{ items: GinkoItem<'downloads'>[] }>()
const { t, format } = useI18n('downloads')
const { type, size, languageName, hreflang, mediaType } = useDownloadText()
</script>

<template>
  <ul class="flex flex-col border-b">
    <li v-for="item in items" :key="item.id" class="group relative flex items-start gap-4 border-t py-6">
      <div class="flex min-w-0 flex-1 flex-col gap-1.5">
        <h2 class="text-h3">
          <a
            :href="item.data.file.url"
            :type="mediaType(item.data)"
            :hreflang="hreflang(item.data)"
            class="underline-offset-4 after:absolute after:inset-0 group-hover:underline"
          >{{ item.data.title }}</a>
        </h2>
        <p v-if="item.data.summary" class="text-muted-foreground">{{ item.data.summary }}</p>
        <!-- Each part in its own bdi, so a Latin file type next to a number keeps its order on a right-to-left page. -->
        <p class="text-small text-muted-foreground tabular-nums">
          <time :datetime="item.data.date">{{ format.date(item.data.date) }}</time>
          <template v-for="part in [type(item.data), size(item.data), languageName(item.data) && t('in', { language: languageName(item.data)! })].filter(Boolean)" :key="part">
            <span aria-hidden="true"> · </span><span class="sr-only">, </span><bdi>{{ part }}</bdi>
          </template>
        </p>
      </div>
      <Download class="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </li>
  </ul>
</template>
