---
'@lupinum/ginko': patch
---

Add `NUXT_PUBLIC_GINKO_NOINDEX=true`, which keeps a whole deployment out of search, its own address included. Use it for demos and for a site that runs on a preview address before its domain switch: robots.txt then disallows everything and every response sends `X-Robots-Tag: noindex`. Site responses now also send `Permissions-Policy: camera=(), geolocation=(), microphone=()`.
