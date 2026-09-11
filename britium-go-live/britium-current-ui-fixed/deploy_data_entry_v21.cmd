@echo off
node install_data_entry_v21.mjs || exit /b 1
if exist dist rmdir /s /q dist
if exist node_modules\.vite rmdir /s /q node_modules\.vite
call npm run build || exit /b 1
node verify_data_entry_v21.mjs || exit /b 1
