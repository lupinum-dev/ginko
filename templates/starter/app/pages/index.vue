<script setup lang="ts">
// The home page: the hero from content/home.md, its text, and the pages of content/pages/ as cards.
const home = useGinko('home')
const pages = useGinko('pages')
const locale = useGinkoLocale()
const { t } = useI18n()
const [contact, about] = [useSiteLinks(() => [{ entry: 'pages/contact' }]), useSiteLinks(() => [{ entry: 'pages/about' }])]
const cards = computed(() => pages.value.items.map((page) => ({ key: page.id, title: page.data.title, text: page.data.summary, to: page.urls?.[locale.value] ?? '' })))
usePageSeo(() => ({ home: true, description: home.value.data.lead }))
</script>

<template>
  <div>
    <BlockHero :title="home.data.title" :lead="home.data.lead" :primary="contact[0]" :secondary="about[0]" />
    <div v-if="home.data.body" class="pt-section">
      <ProseBody :value="home.data.body" />
    </div>
    <BlockSection :title="t('home.pages')">
      <BlockCards v-if="cards.length" :items="cards" :columns="2" />
      <BlockEmpty v-else :title="t('home.empty')" path="content/pages/" />
    </BlockSection>
  </div>
</template>
