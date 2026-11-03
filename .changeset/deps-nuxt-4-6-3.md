---
"@lupinum/ginko": patch
"@lupinum/ginko-components": patch
"@lupinum/ginko-content": patch
"@lupinum/ginko-docs": patch
"@lupinum/ginko-i18n": patch
"create-ginko": patch
---

Change dependencies to their latest non-major versions: new sites start on Nuxt 4.6.3, which fixes a security issue where dot segments in a request path bypass server middleware and route rules (GHSA-9v7c-q64q-vv33), and the packages require `@nuxt/kit` 4.6.3, `shiki` 4.6 and current icon sets. Existing sites should update `nuxt` to 4.6.3 too.
