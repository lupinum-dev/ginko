<script setup lang="ts">
import type { ImageValue } from '@lupinum/ginko'

/**
 * Photos in justified rows (each row fills the width; every photo keeps its ratio, so nothing jumps while loading)
 * and one lightbox for all of them. Each photo is a button that opens the lightbox at that photo.
 */
const props = defineProps<{ images: ImageValue[] }>()
const { t } = useI18n('gallery')
const list = useTemplateRef<HTMLUListElement>('list')
const open = ref(false)
const index = ref(0)
const ratio = (image: ImageValue) => (image.width && image.height ? image.width / image.height : 1.5)
function show(i: number) {
  index.value = i
  open.value = true
}
/** After the lightbox closes: the photo shown last, in this gallery (a page may hold more than one). */
function focusPhoto(i: number) {
  list.value?.querySelectorAll<HTMLElement>(':scope > li > button')[i]?.focus()
}
</script>

<template>
  <div>
    <ul ref="list" class="flex flex-wrap gap-2 md:gap-3 after:grow-10">
      <li
        v-for="(image, i) in props.images"
        :key="image.url"
        class="basis-(--basis) grow-(--grow) md:basis-(--basis-md)"
        :style="{ '--grow': ratio(image), '--basis': `${ratio(image) * 160}px`, '--basis-md': `${ratio(image) * 260}px` }"
      >
        <button
          type="button"
          aria-haspopup="dialog"
          :aria-label="t('open', { n: i + 1, count: props.images.length, alt: image.alt ?? '' })"
          class="block w-full overflow-hidden rounded-md bg-muted"
          @click="show(i)"
        >
          <GinkoImage
            :image="image"
            sizes="(min-width: 768px) 40vw, 80vw"
            class="w-full object-cover"
            :style="{ aspectRatio: String(ratio(image)) }"
          />
        </button>
      </li>
    </ul>
    <SiteLightbox v-model:open="open" v-model:index="index" :images="props.images" :focus-photo="focusPhoto" />
  </div>
</template>
