- The requested preview matrix and ISR preview are deployed in the authorized Lupinum OG project.
- WARNING: the first CLI invocation unexpectedly created a production deployment; it remains untouched.
- Both normal Nuxt versions reproduce only the existing English Blog-link and message-fallback failures.
- Uppercase locale URLs redirect to lowercase; trailing-slash pages serve correct canonical HTML.
- Prefix root redirects honour Accept-Language and send Vary; repeated probes found no language leakage.
- Normal API functions honour headers, cookies, and query parameters.
- All first /en/about requests returned correct English HTML from prerendered CDN files.
- ISR homepages retain correct language and hreflang, but static precedence limits that conclusion.
- ISR adds a cached Unicode-route 404 and API locale/query contamination under catch-all SWR.
- The original Blog-link assertion misses the ISR error page; raw HTTP diagnostics expose it.

## Deployments and final run results

All matrix deployment receipts contain `readyState: READY`, `target: null` (Vercel preview), and `productionUrl: null`.
The table counts come from `.evidence/vercel/<label>-attack.json`, `<label>/full.json`, and `<label>/functions.json` respectively.

| Label | Preview URL | Deployment ID | Remote suite | Extra HTTP | Supplementary routes |
| --- | --- | --- | --- | --- | --- |
| n4-prefix_except_default | https://ginko-i18n-skeleton-d2s30nbyn-lupinum.vercel.app | `dpl_7Zw3kbYimRmx8v97xC9CQ3VnEakV` | 179/181 | 48/48 | 6/6 |
| n4-prefix | https://ginko-i18n-skeleton-nopgeehbw-lupinum.vercel.app | `dpl_Ed8CYsLbPrmP6Eyn36mP8wbBB8Tz` | 190/192 | 49/49 | 6/6 |
| n5-prefix_except_default | https://ginko-i18n-skeleton-annoak8rl-lupinum.vercel.app | `dpl_EXBmJrzuiJMRQdvEmnjV1gYheiFC` | 179/181 | 48/48 | 6/6 |
| n5-prefix | https://ginko-i18n-skeleton-2a1bxcdkx-lupinum.vercel.app | `dpl_FzL3L8mddXq2nF1K3eWcTNq5Zf7K` | 190/192 | 49/49 | 6/6 |
| n4-prefix_except_default-isr | https://ginko-i18n-skeleton-5jw66ksuq-lupinum.vercel.app | `dpl_AfnuUJjBGVvQHqgJjYL97M6gC5nW` | 166/172 | 48/48 | 3/6 |

## Reproduction and evidence

Load the ignored local bypass environment without printing it: `source .evidence/vercel/bypass.env`.
Set `URL` to a preview above. All curl examples use `curl -sS -D - -H "x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET"` (abbreviated as `$CURL` below); do not paste the token into the report.
Exact suite command for each row: `node test/attack.mjs --remote "$URL" --name <label> --strategy <strategy>`.
Extra commands: `node scripts/vercel-extra-attacks.mjs "$URL" <label> <strategy> cold`, then `full`, then `functions`.
Diagnostic comparison: run mode `diagnostic` for `n4-prefix_except_default` and `n4-prefix_except_default-isr`.
Raw suite stdout: `.evidence/vercel/<label>-attack.log`; assertions: `<label>-attack.json`.
Raw curl headers/bodies: `.evidence/vercel/<label>/<probe>.headers` and `.html`; structured metadata: `cold.json`, `full.json`, `functions.json`, `diagnostic.json`.
All evidence is git-ignored; no token or raw logs are committed.

## Finding: unexpected first production deployment — FAIL

**What:** `npx --yes vercel@62.7.0 deploy --prebuilt --target=preview --scope=lupinum --yes` created `dpl_4WNkf7sNJhF5XUaPJJKouShUaKon`, URL `https://ginko-i18n-skeleton-ro9psxrhz-lupinum.vercel.app`, with production alias `https://ginko-i18n-skeleton.vercel.app`.
**Expected:** preview only; production is explicitly forbidden by the brief.
**Severity:** critical operator deviation. No promotion, deletion, or production test was performed afterward.
**Likely cause:** Vercel first-deployment default despite explicit preview flag. CLI source contains first-deployment/implicit-production handling. High confidence in the observed target, moderate confidence in the exact CLI/API responsibility.
**Evidence:** `.evidence/vercel/unexpected-production.json` records `target: production` and the alias; MCP `vercel_get_deployment` independently confirmed it. Subsequent receipts are preview. Guarded script refuses an empty project and validates the authorized link before upload; its postflight also rejects production receipts. The guard prevents this default on future runs but cannot undo the existing deployment.
**Action for Opus:** report the deviation to the user; deletion or changing production state needs exact authorization. No second project was created.

## Finding: English Blog navigation remains broken — FAIL, with a suite blind spot

**What/repro:** open `/en/blog/hello-world`, click `[data-test=nav-blog]`; the URL becomes `/en/blog/hallo-welt`. `$CURL "$URL/en/blog/hallo-welt"` returns an error. Normal previews record the known navigation failure.
**Expected:** navigation to an existing English post.
**Severity:** medium. **Likely cause:** fixture link uses the German slug (known baseline fixture issue), not a CDN regression.
**ISR anomaly:** the remote assertion reports success because it checks only `[data-test=error-title]`; the ISR/Nuxt error page lacks that fixture marker. `diagnostic.json` records HTTP 404. This is a harness blind spot, not a fix to the product. Local assertions were preserved as requested.

## Finding: English missing-key fallback remains German — FAIL

**What/repro:** open `/en`, inspect `[data-test=fallback]`: `Dieser Text fehlt im Englischen.`
**Expected:** the suite's design assertion rejects German fallback on English pages.
**Severity:** low, known design failure. **Likely cause:** existing module fallback policy; no change made in packages or fixtures.
**Evidence:** each `<label>-attack.json` records the exact text. The brief already identifies this failure.

## Finding: ISR/SWR breaks the Unicode dynamic route — FAIL

**What/repro:** on the ISR preview, `$CURL "$URL/blog/gr%C3%BC%C3%9Fe"` returns German 404; adding `?attack=unicode` also returns 404. The same encoded URL on the normal Nuxt 4 preview serves `Grüße` correctly. `/en/blog/greetings` continues to serve English.
**Expected:** HTTP 200 with `Grüße`, as required by `pagesFor()` in `test/attack.mjs` and confirmed by normal previews.
**Severity:** high for localized slug sites.
**Likely cause:** Nitro/Vercel ISR route capture or encoded pathname handling, interacting with module slug lookup; moderate confidence. Normal CDN Unicode output succeeds, so Linux alone is not the explanation. The ISR output does not prerender this path; it reaches the catch-all ISR function. Do not assign a definitive module cause without tracing the function input.
**Evidence:** ISR `functions.json` records cached `HIT` 404s; `diagnostic.json` records the query repro; normal `functions.json` and normal diagnostic provide the control. The remote ISR page group skips further assertions after the failed status, explaining the smaller suite denominator.

## Finding: catch-all SWR caches API locale and drops query — FAIL

**What/repro:** on ISR preview, repeat `$CURL -H 'Accept-Language: en' "$URL/api/greet?name=Ana"`, then German, no language, and `Cookie: ginko_locale=de`. All diagnostic bodies are `{"locale":"en","text":"Hello, !"}`. Headers show `x-vercel-cache: HIT`. Normal Nuxt 4 control returns `Hello, Ana!` for English and `Grüß Gott, Ana!` for German/default/cookie German with `MISS`.
**Expected:** request locale and query name are honoured, as normal functions demonstrate; no language-specific shared cache response.
**Severity:** high. The experiment must not be adopted as a blanket API cache rule.
**Likely cause:** fixture experiment's `/**: { swr: 60 }` also captures `/api/greet`; generated catch-all ISR precedes explicit API routes. Nitro's generated catch-all prerender config has `expiration: false`, whereas the English ISR config has `expiration: 60`. Thus the emitted catch-all does not advertise the requested time limit. Query/header cache variation is not preserved. This is a Vercel/Nitro route-rule integration issue triggered by the broad experiment, not evidence of a module regression in uncached functions.
**Evidence:** `.evidence/vercel/isr-catchall-prerender-config.json`, `isr-en-prerender-config.json`, `<label>-output-config.json`, ISR and normal `diagnostic.json`; ISR remote suite's German/default API assertions fail. The original API tests validate locale only, so they miss the lost `name` on otherwise English-success rows.

## Finding: uppercase and trailing slash handling — ok

**Repro:** `$CURL "$URL/EN/about"`, `$CURL "$URL/En"`, `$CURL "$URL/en/"`, `$CURL "$URL/ueber-uns/"` (or `/de/ueber-uns/` for prefix).
**Expected/observed:** uppercase probes return 301 to `/en/about` and `/en`; trailing slash localized pages return 200 with slash-free canonical. Literal `/ueber-uns/` on prefix previews returns 404, because German paths require `/de`.
**Severity:** informational. **Likely cause:** module middleware for case redirects, Vercel static directory serving for slash variants. The response canonical retains fixture base `https://example.test`; remote expectations intentionally retain that base.
**Evidence:** each `full.json`, `uppercase-*.headers`, `slash-*.headers/.html`. These behaviours satisfy the suite's existing expectations.

## Finding: prefix root does not leak language in these probes — ok

**Repro:** request `/` with English, German, then no Accept-Language, repeating in the same order as `scripts/vercel-extra-attacks.mjs`.
**Expected/observed:** prefix previews return 302 `/en`, `/de`, `/de`; each includes `Vary: accept-language, cookie`, `x-vercel-cache: MISS`, and `age: 0`. Browser root tests also honour the cookie and preserve `?utm=1`. Default-prefix previews serve German root regardless of the other language, which is intended URL-authoritative behavior.
**Severity:** informational. **Likely cause:** uncached root function redirect with explicit Vary.
**Limit:** bypass-authenticated requests from this location, not an unauthenticated or multi-region cache proof. Protection remained enabled.
**Evidence:** `root-<round>-<language>.headers` and `full.json` on each preview. Full metadata table follows.

| Preview | Round | Accept-Language | Status | Location | Vary | x-vercel-cache | age |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n4-prefix_except_default | 1 | en | 200 | — | — | HIT | 45 |
| n4-prefix_except_default | 1 | de | 200 | — | — | HIT | 45 |
| n4-prefix_except_default | 1 | none | 200 | — | — | HIT | 45 |
| n4-prefix_except_default | 2 | en | 200 | — | — | HIT | 45 |
| n4-prefix_except_default | 2 | de | 200 | — | — | HIT | 45 |
| n4-prefix_except_default | 2 | none | 200 | — | — | HIT | 45 |
| n4-prefix_except_default | 3 | en | 200 | — | — | HIT | 46 |
| n4-prefix_except_default | 3 | de | 200 | — | — | HIT | 46 |
| n4-prefix_except_default | 3 | none | 200 | — | — | HIT | 46 |
| n4-prefix | 1 | en | 302 | /en | accept-language, cookie | MISS | 0 |
| n4-prefix | 1 | de | 302 | /de | accept-language, cookie | MISS | 0 |
| n4-prefix | 1 | none | 302 | /de | accept-language, cookie | MISS | 0 |
| n4-prefix | 2 | en | 302 | /en | accept-language, cookie | MISS | 0 |
| n4-prefix | 2 | de | 302 | /de | accept-language, cookie | MISS | 0 |
| n4-prefix | 2 | none | 302 | /de | accept-language, cookie | MISS | 0 |
| n4-prefix | 3 | en | 302 | /en | accept-language, cookie | MISS | 0 |
| n4-prefix | 3 | de | 302 | /de | accept-language, cookie | MISS | 0 |
| n4-prefix | 3 | none | 302 | /de | accept-language, cookie | MISS | 0 |
| n5-prefix_except_default | 1 | en | 200 | — | — | HIT | 40 |
| n5-prefix_except_default | 1 | de | 200 | — | — | HIT | 41 |
| n5-prefix_except_default | 1 | none | 200 | — | — | HIT | 41 |
| n5-prefix_except_default | 2 | en | 200 | — | — | HIT | 41 |
| n5-prefix_except_default | 2 | de | 200 | — | — | HIT | 41 |
| n5-prefix_except_default | 2 | none | 200 | — | — | HIT | 41 |
| n5-prefix_except_default | 3 | en | 200 | — | — | HIT | 41 |
| n5-prefix_except_default | 3 | de | 200 | — | — | HIT | 41 |
| n5-prefix_except_default | 3 | none | 200 | — | — | HIT | 42 |
| n5-prefix | 1 | en | 302 | /en | accept-language, cookie | MISS | 0 |
| n5-prefix | 1 | de | 302 | /de | accept-language, cookie | MISS | 0 |
| n5-prefix | 1 | none | 302 | /de | accept-language, cookie | MISS | 0 |
| n5-prefix | 2 | en | 302 | /en | accept-language, cookie | MISS | 0 |
| n5-prefix | 2 | de | 302 | /de | accept-language, cookie | MISS | 0 |
| n5-prefix | 2 | none | 302 | /de | accept-language, cookie | MISS | 0 |
| n5-prefix | 3 | en | 302 | /en | accept-language, cookie | MISS | 0 |
| n5-prefix | 3 | de | 302 | /de | accept-language, cookie | MISS | 0 |
| n5-prefix | 3 | none | 302 | /de | accept-language, cookie | MISS | 0 |
| n4-prefix_except_default-isr | 1 | en | 200 | — | — | HIT | 45 |
| n4-prefix_except_default-isr | 1 | de | 200 | — | — | HIT | 45 |
| n4-prefix_except_default-isr | 1 | none | 200 | — | — | HIT | 46 |
| n4-prefix_except_default-isr | 2 | en | 200 | — | — | HIT | 46 |
| n4-prefix_except_default-isr | 2 | de | 200 | — | — | HIT | 46 |
| n4-prefix_except_default-isr | 2 | none | 200 | — | — | HIT | 46 |
| n4-prefix_except_default-isr | 3 | en | 200 | — | — | HIT | 46 |
| n4-prefix_except_default-isr | 3 | de | 200 | — | — | HIT | 46 |
| n4-prefix_except_default-isr | 3 | none | 200 | — | — | HIT | 47 |

## Finding: delivery source and first-request checks — ok, limited

**Repro:** `cold` runs immediately after each deployment, before any suite request; `delivery-*` probes repeat home, English home, about, blog and studio. API probes request `/api/greet` with English header or English cookie.
**Expected/observed:** each `cold.json` contains HTTP 200, `en-GB`, `About us`, `MISS`, and `age: 0`. Normal full delivery probes later show static CDN `HIT` for the prerendered pages, including `/en/blog/hello-world`; API functions are `MISS` and honour locale. Build Output filesystem handling precedes function routes.
**Severity:** informational. **Likely cause:** prerender files win at the CDN; dynamic/API paths use the emitted functions or ISR handlers. Cache headers alone do not prove a function ran; use output config plus headers.
**Limit:** first `/en/about` is a cold CDN request, not a proven cold function startup. No function-start timing claim is made. `PRERENDER` was not observed; static files use HIT/MISS here.
**Evidence:** `<label>/cold.json`, `delivery-*.headers`, `api-*.headers/.html`, `<label>-output-config.json`, and build logs.

## Finding: ISR home language/hreflang isolation — ok, limited

**Repro:** ISR preview `/` with English header/cookie; `/en` with German header/cookie, separately and combined; repeat as `isolation-*` probes in `full` mode.
**Expected/observed:** German root and English `/en` remain correct and retain reciprocal de-AT/en-GB/x-default hreflang. Full JSON records the exact alternates.
**Severity:** informational; this does not cancel the API/Unicode failures.
**Likely cause/limit:** both homes are prerendered and served as static CDN HIT. `/en/**` is emitted as `/en/(?:.*)`, while bare `/en` is also a static override. These tests do not exercise a generated homepage ISR response or regeneration. Dynamic Unicode/English greetings probes exercise emitted ISR paths instead.

## Verification, assumptions, and limits

Builds: `GINKO_STRATEGY=<strategy> NITRO_PRESET=vercel pnpm --dir apps/<app> build`; add `GINKO_ISR=1` for the ISR row. Each final build log ends in Build complete. No local full build/attack gate was rerun.
Focused final checks: `node --check test/attack.mjs`, `node --check scripts/vercel-extra-attacks.mjs`, `bash -n scripts/vercel-preview.sh`, `git diff --check`. No standalone typecheck/lint script exists in root package.json; Nuxt builds validate config consumption and generate types, but this is not a standalone typecheck.
CLI pinned to the observed version; pnpm workspace/quarantine and lockfile remain unchanged. Local suite targets, local server startup and assertion semantics remain unchanged. Remote mode selects SSR expectations and uses supplied strategy rather than label inference for concurrent requests.
Assumptions: keep fixture SEO base; keep protection enabled and use an automation bypass; request Accept-Language in the order specified per round; include the literal unprefixed trailing-slash URL on prefix rows as well as the valid German URL; make no module/fixture fix.
No changes to packages or fixtures, custom domain, secret environment variable, second project, push, or PR. The bypass is a project automation setting and a local ignored environment file, not an application environment variable (`vercel_filter_project_envs` returned an empty env list). Production deviation above is the exception to the authorized action boundary.
Timings were not compared: builds overlapped with uploads/browser work and did not have equal machine load. Cache ages are response metadata, not benchmark timings.
