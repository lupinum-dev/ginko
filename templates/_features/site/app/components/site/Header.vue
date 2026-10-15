<script setup lang="ts">
// Name or logo, the navigation (at most 6 links), the language switch and the theme toggle. On narrow screens the
// links and the language switch move into a sheet, so the sheet opens for a site with languages but no links too.
// The header switches at `md` (768 px); with more than 6 links and language codes together it switches at `lg`
// (1024 px), because 5 links and 4 codes do not fit at 768 px in German or French. The footer links come into the
// sheet too, below the menu.
const config = useSiteAppConfig()
const links = useSiteLinks(() => config.nav)
const more = useSiteLinks(() => config.footer)
const { t, alternates } = useI18n('site')
const path = useGinkoPath()
const wide = computed(() => links.value.length + (alternates.value.length > 1 ? alternates.value.length : 0) > 6)
</script>

<template>
  <header class="sticky top-0 z-40 border-b bg-background print:static">
    <div class="mx-auto flex h-16 max-w-page items-center gap-4 px-gutter md:h-18">
      <NuxtLink :to="path('home')" class="-m-1 me-auto inline-flex min-h-11 shrink-0 items-center rounded-md p-1 whitespace-nowrap">
        <SiteLogo />
        <span class="sr-only">, {{ t('home') }}</span>
      </NuxtLink>
      <nav v-if="links.length" :aria-label="t('nav.label')" class="print:hidden" :class="wide ? 'max-lg:hidden' : 'max-md:hidden'">
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
        <SiteLanguageSwitch class="print:hidden" :class="wide ? 'max-lg:hidden' : 'max-md:hidden'" />
        <SiteThemeToggle />
        <SiteNavSheet v-if="links.length || alternates.length > 1" :links="links" :more="more" :until="wide ? 'lg' : 'md'" />
      </div>
    </div>
  </header>
</template>
