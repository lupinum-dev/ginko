#!/usr/bin/env bash
# Builds every target the attack suites run against: {n4,n4c5,n5} x {ssr,static} x {prefix_except_default,prefix},
# plus apps/edge for edge-attack.mjs.
set -euo pipefail
cd "$(dirname "$0")"
# The apps load the module from src. The package tsconfig extends the .nuxt that prepare generates
# (the layer sits below that tsconfig, so vite reads it).
pnpm --filter @lupinum/ginko-i18n exec nuxt-module-build prepare
for app in ${APPS:-n4 n4c5 n5}; do
  for strategy in ${STRATEGIES:-prefix_except_default prefix}; do
    out="targets/$app-$strategy"
    rm -rf "$out"; mkdir -p "$out"
    (cd apps/$app && GINKO_STRATEGY=$strategy pnpm nuxt build > "../../$out/build.log" 2>&1) || { echo "BUILD FAILED $out"; tail -20 "$out/build.log"; continue; }
    cp -R apps/$app/.output "$out/ssr"
    (cd apps/$app && GINKO_STRATEGY=$strategy pnpm nuxt generate > "../../$out/generate.log" 2>&1) || { echo "GENERATE FAILED $out"; tail -20 "$out/generate.log"; continue; }
    cp -R apps/$app/.output/public "$out/static"
    echo "built $out"
  done
done
mkdir -p targets
(cd apps/edge && pnpm nuxt build > ../../targets/edge-build.log 2>&1) || { echo "BUILD FAILED edge"; tail -20 targets/edge-build.log; exit 1; }
echo "built apps/edge"
