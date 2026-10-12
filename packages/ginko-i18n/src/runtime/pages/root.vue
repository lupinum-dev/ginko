<script setup lang="ts">
// Only used with `strategy: 'prefix'`. A server redirects `/` before this renders; a static host
// serves this page, and the inline script picks the locale before Vue starts.
import { navigateTo, useCookie, useHead } from '#imports'
import { config } from '#ginko-i18n/config.mjs'
import { localizePath, negotiateLocale } from '@lupinum/ginko-i18n/core'

const c = config
const codes = c.locales.map(l => l.code)
const languages = Object.fromEntries(c.locales.map(l => [l.code, l.language.toLowerCase()]))
const fallback = c.base + localizePath('/', c.defaultLocale, c)

const script = `(function(){try{var c=${JSON.stringify(codes)},g=${JSON.stringify(languages)},m=document.cookie.match(/(?:^|; )ginko_locale=([^;]+)/),p=m&&c.indexOf(m[1])>-1?m[1]:null;`
  + `if(!p){var n=navigator.languages||[navigator.language];for(var i=0;i<n.length&&!p;i++){var t=String(n[i]).toLowerCase();for(var j=0;j<c.length;j++){if(g[c[j]]===t||c[j]===t){p=c[j];break}}`
  + `if(!p)for(var k=0;k<c.length;k++){if(g[c[k]].split('-')[0]===t.split('-')[0]){p=c[k];break}}}}`
  + `location.replace(${JSON.stringify(`${c.base}/`)}+(p||${JSON.stringify(c.defaultLocale)})+location.search+location.hash)}catch(e){location.replace(${JSON.stringify(fallback)})}})()`

useHead({
  script: [{ innerHTML: script, tagPosition: 'head' }],
  noscript: [{ innerHTML: `<meta http-equiv="refresh" content="0; url=${fallback}">` }],
  meta: [{ name: 'robots', content: 'noindex' }],
})

// In-app navigation to `/`: the same order as the server and the inline script: cookie, browser, default.
const cookie = useCookie<string | undefined>('ginko_locale').value
if (import.meta.client) {
  const target = (cookie && c.locales.some(l => l.code === cookie) ? cookie : undefined)
    ?? negotiateLocale(navigator.languages.join(','), c) ?? c.defaultLocale
  await navigateTo(localizePath('/', target, c), { replace: true })
}
</script>

<template>
  <div />
</template>
