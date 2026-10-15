<script setup lang="ts">
// Name or logo, the navigation (at most 6 links; in a sheet below `md`, below `xl` when there are more than 4, so
// long labels never squeeze the header), the language switch and the theme toggle. Below `md` the language switch
// moves into the sheet, so the sheet opens for a site with languages but no links too.
const config = useSiteAppConfig()
const links = useSiteLinks(() => config.nav)
const wide = computed(() => links.value.length > 4)
const { t, alternates } = useI18n('site')
const path = useGinkoPath()
</script>

<template>
  <header class="sticky top-0 z-40 border-b bg-background print:hidden">
    <div class="mx-auto flex h-16 max-w-page items-center gap-4 px-gutter md:h-18">
      <NuxtLink :to="path('home')" class="-m-1 me-auto inline-flex min-h-11 items-center rounded-md p-1">
        <SiteLogo />
        <span class="sr-only">, {{ t('home') }}</span>
      </NuxtLink>
      <nav v-if="links.length" :aria-label="t('nav.label')" :class="wide ? 'max-xl:hidden' : 'max-md:hidden'">
        <ul class="flex items-center gap-1">
          <li v-for="link in links" :key="link.key">
            <SiteNavLink
              :to="link.to"
              class="inline-flex min-h-11 items-center rounded-md px-3 text-small font-medium whitespace-nowrap text-muted-foreground transition-colors duration-150 hover:text-foreground aria-[current=page]:text-foreground underline-offset-4 aria-[current=page]:underline"
            >
              {{ link.label }}
            </SiteNavLink>
          </li>
        </ul>
      </nav>
      <div class="flex items-center gap-1">
        <SiteLanguageSwitch class="max-md:hidden" />
        <SiteThemeToggle />
        <SiteNavSheet v-if="links.length || alternates.length > 1" :links="links" :wide="wide" />
      </div>
    </div>
  </header>
</template>
