<!-- Synced from templates/_features/gallery/app/components/block/Gallery.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import type { ImageValue } from '@lupinum/ginko'

/**
 * Photos and one lightbox for all of them. On phones one column at full width, each photo cropped to 3:2, so no photo
 * stands narrower than the page. From `sm` justified rows: each row fills the width and every photo keeps its ratio,
 * so nothing jumps while loading; a photo grows at most to about 1.6 times its row height, so a last row with one or
 * two photos ends short instead of blowing them up. Each photo is a button that opens the lightbox at that photo.
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
    <ul ref="list" class="flex flex-col gap-2 sm:flex-row sm:flex-wrap md:gap-3">
      <li
        v-for="(image, i) in props.images"
        :key="image.url"
        class="sm:max-w-(--max) sm:grow-(--grow) sm:basis-(--basis) md:max-w-(--max-md) md:basis-(--basis-md)"
        :style="{
          '--grow': ratio(image),
          '--ratio': String(ratio(image)),
          '--basis': `${ratio(image) * 160}px`,
          '--max': `${ratio(image) * 260}px`,
          '--basis-md': `${ratio(image) * 260}px`,
          '--max-md': `${ratio(image) * 420}px`,
        }"
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
            sizes="(min-width: 768px) 40vw, (min-width: 640px) 50vw, calc(100vw - 2rem)"
            class="aspect-3/2 w-full object-cover sm:aspect-(--ratio)"
          />
        </button>
      </li>
    </ul>
    <SiteLightbox v-model:open="open" v-model:index="index" :images="props.images" :focus-photo="focusPhoto" />
  </div>
</template>
