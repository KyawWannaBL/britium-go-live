@echo off
setlocal
node install_data_entry_v18.mjs
if errorlevel 1 exit /b 1
if exist dist rmdir /s /q dist
if exist node_modules\.vite rmdir /s /q node_modules\.vite
call npm run build
if errorlevel 1 exit /b 1
node verify_data_entry_v18.mjs
if errorlevel 1 exit /b 1
echo SAFE TO DEPLOY V18
endlocal
