#!/usr/bin/env sh
# Vercel build entry point (vercel.json). A production build deploys the Convex functions before it builds the
# Studio, so the UI never ships ahead of its backend; a failed deploy fails the build and the previous release stays.
# Then it starts the data migrations the new backend brings (`migrations:runPending`, one line in the log); they run
# in the background, and `npx convex run ops:status` shows how far they are.
# Preview builds deploy no backend and only build the Studio. Locally (no VERCEL_ENV) nothing is deployed.
#
# The plain Convex CLI on purpose: `better-convex-nuxt convex deploy` reads its deployment only from .env.local, which does
# not exist on Vercel. The Convex CLI reads CONVEX_DEPLOY_KEY, which is set in Vercel's Production environment only.
# It runs in packages/ginko-server: only next to the package.json that lists `sharp` does Convex keep it external.
set -eu
cd "$(dirname "$0")/.."

if [ "${VERCEL_ENV:-}" = "production" ]; then
  case "${CONVEX_DEPLOY_KEY:-}" in
    prod:*) ;;
    *) echo "CONVEX_DEPLOY_KEY must be a production deploy key." >&2; exit 1 ;;
  esac
  (cd ../../packages/ginko-server && pnpm exec convex deploy)
  # Warn, do not fail: the new backend is live already, and a failed build would only keep the old Studio in front of
  # it. The next deploy calls runPending again.
  (cd ../../packages/ginko-server && pnpm exec convex run --prod migrations:runPending) \
    || echo "Warning: the data migrations could not be started. The next deploy tries again; see ops:status." >&2
fi

pnpm exec nuxt build
