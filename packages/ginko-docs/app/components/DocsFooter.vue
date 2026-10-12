<script setup lang="ts">
// Site links (texts: docs.footer.<id>) and the "Built with Ginko" line. Renders nothing when both are off.
const { t } = useI18n()
const { text, href } = useDocsSite()
const footer = useAppConfig().docs?.footer
const links = footer?.links ?? []
const attribution = footer?.attribution ?? true
</script>

<template>
  <footer v-if="links.length || attribution" class="docs-footer">
    <div class="docs-footer-inner">
      <nav v-if="links.length" :aria-label="t('docs.footerNav')">
        <NuxtLink v-for="l in links" :key="l.id" :to="href(l.href)">{{ text(`docs.footer.${l.id}`) }}</NuxtLink>
      </nav>
      <a v-if="attribution" href="https://github.com/lupinum-dev/ginko" rel="noopener">{{ t('docs.builtWith') }}</a>
    </div>
  </footer>
</template>
