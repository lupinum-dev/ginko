---
'@lupinum/ginko': patch
---

Fix a Vercel production build without `NUXT_PUBLIC_GINKO_PLATFORM` passing and shipping a site that answers 503: it now stops with a clear error (other builds only warn).
