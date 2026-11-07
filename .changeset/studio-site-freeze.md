---
"@lupinum/ginko": patch
---

Fix the Studio freezing when you open a site you cannot use from another page: for a site being deleted, a site you no longer have access to, or after the session ended, the address changed but the old page stayed until a reload. Leaving such a site with ⌘K or Back no longer keeps its notice on the next page either.
