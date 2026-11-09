#!/bin/sh
# Lint, test, type-check and build the web SPA. CI job: web.
#
# Usage: scripts/check-web.sh   (run `npm ci` in apps/web first)

set -e
cd "$(dirname "$0")/../apps/web"
npx biome check .
npx playwright install chromium --with-deps
npm test
npm run build
echo "web: ok"
