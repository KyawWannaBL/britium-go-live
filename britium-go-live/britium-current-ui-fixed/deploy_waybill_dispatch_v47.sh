#!/usr/bin/env bash
set -euo pipefail
node install_waybill_dispatch_v47.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_waybill_dispatch_v47.mjs
