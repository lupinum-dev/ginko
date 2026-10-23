---
'@lupinum/ginko-docs': patch
---

Fix the docs theme defaults overriding a site's Tailwind 4 `@theme`: they now sit in `@layer theme`, so on a Tailwind site without its own fonts the docs use Tailwind's font stacks instead of Inter.
