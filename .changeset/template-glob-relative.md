---
"create-ginko": patch
---

Fix a production build that never ends: the templates look up their optional files with a relative `import.meta.glob` pattern. With an aliased pattern (`~/…`), rolldown before 1.3 could block all its worker threads on a build machine with two cores, so the client build stopped at "transforming..." until the host's time limit.
