#!/usr/bin/env bash
set -euo pipefail
node install_data_entry_v20.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_data_entry_v20.mjs
