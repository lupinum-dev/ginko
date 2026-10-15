<script setup lang="ts">
import { Leaf } from '@lucide/vue'

/** "vegetarian" or "vegan" as a word with a leaf; nothing for other dishes. */
const props = defineProps<{ veg: string }>()
const { t } = useI18n('menu')
const label = computed(() => (props.veg === 'vegan' ? t('diet.vegan') : props.veg === 'vegetarian' ? t('diet.vegetarian') : undefined))
</script>

<template>
  <span v-if="label" class="inline-flex items-center gap-1.5 text-small">
    <Leaf class="size-4 shrink-0 text-success" aria-hidden="true" />
    {{ label }}
  </span>
</template>
