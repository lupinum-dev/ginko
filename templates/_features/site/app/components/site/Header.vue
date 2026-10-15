<script setup lang="ts">
// Name or logo, the navigation (at most 6 links; in a sheet below `md`), the language switch and the theme toggle.
const config = useSiteAppConfig()
const links = useSiteLinks(() => config.nav)
const path = useGinkoPath()
const { t } = useI18n('site')
</script>

<template>
  <header class="sticky top-0 z-40 border-b bg-background">
    <div class="mx-auto flex h-16 max-w-page items-center gap-4 px-gutter md:h-18">
      <NuxtLink :to="path('home')" class="-m-1 me-auto inline-flex min-h-11 items-center rounded-md p-1">
        <SiteLogo />
        <span class="sr-only">, {{ t('home') }}</span>
      </NuxtLink>
      <nav v-if="links.length" :aria-label="t('nav.label')" class="max-md:hidden">
        <ul class="flex items-center gap-1">
          <li v-for="link in links" :key="link.key">
            <SiteNavLink
              :to="link.to"
              class="inline-flex min-h-11 items-center rounded-md px-3 text-small font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground aria-[current=page]:text-foreground underline-offset-4 aria-[current=page]:underline"
            >
              {{ link.label }}
            </SiteNavLink>
          </li>
        </ul>
      </nav>
      <div class="flex items-center gap-1">
        <SiteLanguageSwitch />
        <SiteThemeToggle />
        <SiteNavSheet v-if="links.length" :links="links" />
      </div>
    </div>
  </header>
</template>
