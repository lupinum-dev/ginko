<!-- Active notices as a strip under the header. -->
<script setup lang="ts">
const notices = useGinko('notices')
</script>

<template>
  <div v-if="notices.items.length" class="strip">
    <ul class="wrap">
      <li v-for="n in notices.items" :key="n.id" data-test="notice" :lang="langOf(n, 'text')">{{ n.data.text }}</li>
    </ul>
  </div>
</template>

<style scoped>
.strip { background: var(--paper-2); border-bottom: 1px solid var(--rule); }
ul { list-style: none; margin: 0 auto; padding-block: 10px; display: grid; gap: 6px; font-size: 0.95rem; }
li { border-left: 3px solid var(--signal); padding-left: 12px; }
</style>
