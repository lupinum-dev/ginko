<script setup lang="ts">
import { computed } from 'vue'
import { fileIcon } from './file-icons'
import type { IconName } from './icons'
import SvgIcon from './SvgIcon.vue'

// `file`: a file name or code language; its type icon (TypeScript, Vue, JSON …) wins over `name` when one fits.
const props = defineProps<{ name: IconName; file?: string }>()
const typed = computed(() => fileIcon(props.file))
</script>

<template>
  <SvgIcon
    class="ginko-code-icon"
    :name="typed && 'name' in typed ? typed.name : typed ? undefined : name"
    :view-box="typed && 'body' in typed ? typed.viewBox : undefined"
    :body="typed && 'body' in typed ? typed.body : undefined"
  />
</template>
