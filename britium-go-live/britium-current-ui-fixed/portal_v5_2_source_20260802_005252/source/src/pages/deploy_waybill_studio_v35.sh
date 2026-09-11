#!/usr/bin/env bash
set -e
node install_waybill_studio_v35.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_waybill_studio_v35.mjs
