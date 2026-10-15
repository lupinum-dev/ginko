<!-- Synced from templates/_features/menu/app/components/menu/Allergens.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
/**
 * The allergen letters of a dish (EU letters as the menu stores them). Each letter is shown, its name is read out and
 * shown on hover; the page also shows the key (MenuAllergenKey). No letters: "no allergens".
 */
const props = defineProps<{ codes: readonly string[] }>()
const { t } = useI18n('menu')
const codes = computed(() => allergenList(props.codes))
</script>

<template>
  <span v-if="codes.length" class="inline-flex flex-wrap gap-1">
    <abbr
      v-for="code in codes"
      :key="code"
      :title="t(`allergens.${code}`)"
      class="inline-grid h-6 min-w-6 place-items-center rounded-sm border px-1 text-xs font-medium text-muted-foreground no-underline"
    ><span aria-hidden="true">{{ code }}</span><span class="sr-only">{{ t(`allergens.${code}`) }}</span></abbr>
  </span>
  <span v-else class="text-small text-muted-foreground">{{ t('allergens.none') }}</span>
</template>
