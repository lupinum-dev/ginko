<!-- Synced from templates/_features/people/app/components/people/List.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
/** People as a grid: photo (4:5) or initials, name, role, short bio and contact. Never a stock face for a named
 *  person: without a photo the initials stand in. */
defineProps<{ items: GinkoItem<'people'>[] }>()
const { t } = useI18n('people')
</script>

<template>
  <ul class="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
    <li v-for="person in items" :key="person.id" class="flex flex-col gap-4">
      <GinkoImage
        v-if="person.data.photo"
        :image="person.data.photo"
        sizes="(min-width: 1024px) 384px, (min-width: 640px) 50vw, 100vw"
        class="aspect-4/5 w-full rounded-block bg-muted object-cover"
      />
      <InitialsAvatar v-else :name="person.data.name" size="lg" />
      <div class="flex flex-col gap-1">
        <h2 class="text-h3">{{ person.data.name }}</h2>
        <p v-if="person.data.role" class="text-muted-foreground">{{ person.data.role }}</p>
      </div>
      <p v-if="person.data.bio">{{ person.data.bio }}</p>
      <ul v-if="person.data.email || person.data.phone" class="flex flex-col text-small" :aria-label="t('contact', { name: person.data.name })">
        <li v-if="person.data.email">
          <a :href="`mailto:${person.data.email}`" dir="ltr" class="inline-flex min-h-11 items-center text-primary underline underline-offset-4 wrap-anywhere">{{ person.data.email }}</a>
        </li>
        <li v-if="person.data.phone">
          <a :href="telHref(person.data.phone)" dir="ltr" class="inline-flex min-h-11 items-center tabular-nums text-primary underline underline-offset-4">{{ person.data.phone }}</a>
        </li>
      </ul>
    </li>
  </ul>
</template>
