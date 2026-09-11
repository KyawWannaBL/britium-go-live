#!/usr/bin/env bash
set -e
node install_data_entry_v28.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_data_entry_v28.mjs
