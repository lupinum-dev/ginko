---
"@lupinum/ginko": patch
---

Make `NUXT_PUBLIC_GINKO_NOINDEX=true` work on sites with the Nuxt SEO modules. `@nuxtjs/robots` writes robots.txt and the robots header there, and Ginko told it only about preview hosts, so a demo on its own address stayed indexable. Ginko now marks every host of such a deployment as not indexable in nuxt-site-config.
