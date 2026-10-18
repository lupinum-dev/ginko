<script setup lang="ts">
/**
 * The work as large photos (3:2), each with its title and the client and year below; the whole item is one link. Two
 * per row from `md`. `feature`: with an odd count the first project spans the row from `md` (16:9), as the home page's
 * opening; with an even count all stay half width, so no project is left alone in a half row. The projects feature
 * shows this list on the projects page instead of its cards. A project without a photo keeps its title and facts,
 * without a gap.
 */
const props = withDefaults(defineProps<{ items: GinkoItem<'projects'>[], feature?: boolean, headingLevel?: 'h2' | 'h3' }>(), { headingLevel: 'h2' })
const meta = (project: GinkoItem<'projects'>) => [project.data.client, project.data.year].filter(Boolean).join(' · ')
const wide = (i: number) => props.feature && i === 0 && props.items.length % 2 === 1
</script>

<template>
  <ul class="grid gap-x-6 gap-y-12 md:grid-cols-2 md:gap-y-16">
    <li
      v-for="(project, i) in items"
      :key="project.id"
      class="group relative flex flex-col gap-4 rounded-block has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-3 has-[a:focus-visible]:outline-ring"
      :class="wide(i) && 'md:col-span-2'"
    >
      <GinkoImage
        v-if="project.data.image"
        :image="project.data.image"
        :eager="i === 0"
        :sizes="wide(i) ? '(min-width: 1216px) 1152px, calc(100vw - 2rem)' : '(min-width: 1216px) 564px, (min-width: 768px) 50vw, calc(100vw - 2rem)'"
        class="aspect-3/2 w-full rounded-block bg-muted object-cover"
        :class="wide(i) && 'md:aspect-video'"
      />
      <div class="flex flex-col gap-1">
        <component :is="headingLevel" class="text-h3">
          <NuxtLink :to="project.url" class="outline-none underline-offset-4 after:absolute after:inset-0 group-hover:underline">{{ project.data.title }}</NuxtLink>
        </component>
        <p v-if="meta(project)" class="text-small text-muted-foreground tabular-nums">{{ meta(project) }}</p>
      </div>
    </li>
  </ul>
</template>
