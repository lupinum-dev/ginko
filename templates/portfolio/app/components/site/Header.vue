<!-- Synced from templates/_features/site/app/components/site/Header.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
// Name or logo, the navigation (at most 6 links), the language switch and the theme toggle. Below `md` the links and
// the language switch move into a sheet, so the sheet opens for a site with languages but no links too. From `md` the
// header has the language codes. A longer navigation stays in the sheet for longer, so labels never squeeze the
// header: more than 4 links until `xl` (five German labels and the name did not fit at 1024 px); until `lg` when more
// than 6 links and codes come together (5 links and 4 codes do not fit at 768 px in German or French) or when the
// name, the labels and the codes are longer than 768 px holds: 70 characters of the page's language (about 7 px each
// at the size of the links; the German events header with 78 did not fit, the English one with 61 does). More than
// 6 links, or 150 characters, never fit inline, not even at `xl` (the 1280 px header holds about 150 characters at
// that size; kept from the 7 px estimate, not measured in a build), so the sheet stays the only menu.
const config = useSiteAppConfig()
const { name } = useGinkoSite()
const links = useSiteLinks(() => config.nav, 6)
const more = useSiteLinks(() => config.footer)
const { t, alternates } = useI18n('site')
const path = useGinkoPath()
const codes = computed(() => (alternates.value.length > 1 ? alternates.value.length : 0))
/** The header's length in characters: the name (or the logo's width), each label with its padding, each code. */
const length = computed(() => links.value.reduce((sum, link) => sum + link.label.length + 3, config.logo ? config.logo.width / 7 : name.length) + codes.value * 5)
const until = computed(() => (links.value.length > 6 || length.value > 150 ? 'always' : links.value.length > 4 ? 'xl' : links.value.length + codes.value > 6 || length.value > 70 ? 'lg' : 'md'))
// Whole class names, so Tailwind finds them in the source.
const navHidden = { md: 'max-md:hidden', lg: 'max-lg:hidden', xl: 'max-xl:hidden', always: 'hidden' } as const
</script>

<template>
  <header class="sticky top-0 z-40 border-b bg-background print:static">
    <div class="mx-auto flex h-16 max-w-page items-center gap-4 px-gutter md:h-18">
      <NuxtLink :to="path('home')" class="-m-1 me-auto inline-flex min-h-11 shrink-0 items-center rounded-md p-1 whitespace-nowrap">
        <SiteLogo />
        <span class="sr-only">, {{ t('home') }}</span>
      </NuxtLink>
      <nav v-if="links.length" :aria-label="t('nav.label')" class="print:hidden" :class="navHidden[until]">
        <ul class="flex items-center gap-1">
          <li v-for="link in links" :key="link.key">
            <SiteNavLink
              :to="link.to"
              class="inline-flex min-h-11 items-center rounded-md px-3 text-small font-medium whitespace-nowrap text-muted-foreground transition-[color,background-color,border-color] duration-150 hover:text-foreground aria-[current=page]:text-foreground underline-offset-4 aria-[current=page]:underline"
            >
              {{ link.label }}
            </SiteNavLink>
          </li>
        </ul>
      </nav>
      <div class="flex items-center gap-1">
        <SiteLanguageSwitch class="max-md:hidden print:hidden" />
        <SiteThemeToggle />
        <SiteNavSheet v-if="links.length || alternates.length > 1" :links="links" :more="more" :until="until" />
      </div>
    </div>
  </header>
</template>
