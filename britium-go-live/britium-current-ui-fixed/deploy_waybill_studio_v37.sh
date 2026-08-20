#!/usr/bin/env bash
set -euo pipefail
node install_waybill_studio_v37.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_waybill_studio_v37.mjs
