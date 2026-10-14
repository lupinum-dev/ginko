---
"@lupinum/ginko": patch
"@lupinum/ginko-content": patch
---

Fix the silent loss of text after a block component without its closing `::` line: it is now refused with the line it starts on (Studio, agent tools, releases, `ginko check` and the build).
