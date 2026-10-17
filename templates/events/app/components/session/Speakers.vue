<!-- Synced from templates/_features/sessions/app/components/session/Speakers.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
/**
 * Speakers as a grid: photo (4:5) or initials, name linked to the speaker's page, role. Never a stock face for a named
 * person: without a photo the initials stand in. `heading`: h2 on the speakers page, h3 under a section's h2.
 */
withDefaults(defineProps<{ items: GinkoItem<'people'>[], heading?: 'h2' | 'h3' }>(), { heading: 'h3' })
</script>

<template>
  <ul class="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
    <li v-for="person in items" :key="person.id" class="group relative flex flex-col gap-4 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-3 has-[a:focus-visible]:outline-ring">
      <GinkoImage
        v-if="person.data.photo"
        :image="person.data.photo"
        sizes="(min-width: 1024px) 288px, (min-width: 640px) 33vw, 50vw"
        class="aspect-4/5 w-full rounded-block bg-muted object-cover"
      />
      <InitialsAvatar v-else :name="person.data.name" size="lg" />
      <div class="flex flex-col gap-1">
        <component :is="heading" class="text-body font-semibold">
          <NuxtLink :to="person.url" class="outline-none underline-offset-4 group-hover:underline after:absolute after:inset-0">{{ person.data.name }}</NuxtLink>
        </component>
        <p v-if="person.data.role" class="text-small text-muted-foreground">{{ person.data.role }}</p>
      </div>
    </li>
  </ul>
</template>
