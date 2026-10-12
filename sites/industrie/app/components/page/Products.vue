<script setup lang="ts">
const { t } = useI18n()

const { head } = useSite()
const products = useGinko('products')
head(() => t('products'), 'products')
</script>

<template>
  <div class="wrap">
    <h1 class="page-title">{{ t('products') }}</h1>
    <div class="page-body">
      <div v-if="products.items.length" class="cards">
        <ProductCard v-for="p in products.items" :key="p.id" :product="p" />
      </div>
      <p v-else class="empty">{{ t('noProducts') }}</p>
    </div>
  </div>
</template>

<style scoped>
.cards { display: grid; gap: 16px; }
@media (min-width: 720px) { .cards { grid-template-columns: repeat(2, 1fr); gap: 24px; } }
@media (min-width: 960px) { .cards { grid-template-columns: repeat(3, 1fr); } }
</style>
