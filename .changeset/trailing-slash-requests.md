---
'@lupinum/ginko': patch
'@lupinum/ginko-docs': patch
---

Fix a slow check on request paths: a URL ending in thousands of slashes no longer keeps the site's server busy for seconds.
