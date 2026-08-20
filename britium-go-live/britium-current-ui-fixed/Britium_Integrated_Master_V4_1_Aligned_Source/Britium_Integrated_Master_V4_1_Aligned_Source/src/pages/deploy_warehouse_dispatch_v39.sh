#!/usr/bin/env bash
set -e
node install_warehouse_dispatch_v39.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_warehouse_dispatch_v39.mjs
