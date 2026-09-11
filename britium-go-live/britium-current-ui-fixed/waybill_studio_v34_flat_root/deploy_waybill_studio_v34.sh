#!/usr/bin/env bash
set -e
node install_waybill_studio_v34.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_waybill_studio_v34.mjs
