<script setup lang="ts">
import { safeHref } from '@lupinum/ginko'

/** A navigation link that marks the current page with aria-current, so it can be styled and announced. An address on
 *  another site (`https://…`, a nav item with `url`) is a plain link: it is never the current page. */
defineOptions({ inheritAttrs: false })
const props = defineProps<{ to: string }>()
const external = computed(() => /^https?:\/\//.test(props.to))
</script>

<template>
  <a v-if="external" :href="safeHref(to)" v-bind="$attrs"><slot /></a>
  <NuxtLink v-else v-slot="{ href, navigate, isExactActive }" :to="to" custom>
    <a :href="href ?? undefined" :aria-current="isExactActive ? 'page' : undefined" v-bind="$attrs" @click="navigate">
      <slot />
    </a>
  </NuxtLink>
</template>
