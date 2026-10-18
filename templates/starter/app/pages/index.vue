<script setup lang="ts">
// The home page: the hero from content/home.md, its text, and the pages of content/pages/ as cards.
const home = useGinko('home')
const pages = useGinko('pages')
const locale = useGinkoLocale()
const { t } = useI18n()
const links = useSiteLinks(() => [{ entry: 'pages/contact' }, { entry: 'pages/about' }])
const link = (key: string) => links.value.find((l) => l.key === key)
const cards = computed(() => pages.value.items.map((page) => ({ key: page.id, title: page.data.title, text: page.data.summary, to: page.urls?.[locale.value] ?? '' })))
usePageSeo(() => ({ home: true, description: home.value.data.lead }))
</script>

<template>
  <div>
    <BlockHero :title="home.data.title" :lead="home.data.lead" :primary="link('pages/contact')" :secondary="link('pages/about')" />
    <div v-if="home.data.body" class="pt-section">
      <ProseBody :value="home.data.body" />
    </div>
    <BlockSection :title="t('home.more')" :side="false">
      <BlockCards v-if="cards.length" :items="cards" :columns="2" />
      <BlockEmpty v-else :title="t('home.empty')" path="content/pages/" />
    </BlockSection>
  </div>
</template>
