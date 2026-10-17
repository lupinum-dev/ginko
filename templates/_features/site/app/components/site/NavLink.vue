<script setup lang="ts">
/** A navigation link that marks the current page with aria-current, so it can be styled and announced. */
defineOptions({ inheritAttrs: false })
defineProps<{ to: string }>()
</script>

<template>
  <NuxtLink v-slot="{ href, navigate, isExactActive }" :to="to" custom>
    <a :href="href ?? undefined" :aria-current="isExactActive ? 'page' : undefined" v-bind="$attrs" @click="navigate">
      <slot />
    </a>
  </NuxtLink>
</template>
