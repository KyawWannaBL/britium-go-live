#!/usr/bin/env sh
set -eu
node install_waybill_studio_v38.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_waybill_studio_v38.mjs
