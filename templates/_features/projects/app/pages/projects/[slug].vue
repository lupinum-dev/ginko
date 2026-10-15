<script setup lang="ts">
// One project: title, summary, for a campaign its last day, photo (3:2) and text.
const route = useRoute()
const project = useGinkoEntry('projects', () => route.params.slug)
const { t, format } = useI18n('projects')
usePageSeo(() => ({
  title: project.value.data.title,
  description: project.value.data.summary,
  image: project.value.data.image,
}))
</script>

<template>
  <article>
    <BlockPageHeader
      :title="project.data.title"
      :lead="project.data.summary"
      :meta="project.data.ends ? t('until', { date: format.date(project.data.ends) }) : undefined"
    />
    <div v-if="project.data.image" class="mx-auto max-w-page px-gutter pb-10">
      <GinkoImage :image="project.data.image" eager sizes="(min-width: 1216px) 896px, 100vw" class="aspect-3/2 w-full max-w-4xl rounded-block bg-muted object-cover" />
    </div>
    <ProseBody :value="project.data.body" />
  </article>
</template>
