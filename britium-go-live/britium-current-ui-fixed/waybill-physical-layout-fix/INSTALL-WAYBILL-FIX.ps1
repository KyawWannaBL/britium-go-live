param(
  [string]$ProjectPath = (Get-Location).Path
)

$ErrorActionPreference = "Stop"
$source = Join-Path $PSScriptRoot "WaybillStudioPage.tsx"
$target = Join-Path $ProjectPath "src\pages\WaybillStudioPage.tsx"

if (-not (Test-Path $source -PathType Leaf)) {
  throw "Patch source is missing: $source"
}

if (-not (Test-Path $target -PathType Leaf)) {
  throw "Target file was not found: $target`nRun this script from the Vite project root or pass -ProjectPath."
}

$backup = "$target.before-physical-layout-fix-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -LiteralPath $target -Destination $backup
Copy-Item -LiteralPath $source -Destination $target -Force

Write-Host ""
Write-Host "Waybill physical-layout fix installed." -ForegroundColor Green
Write-Host "Backup: $backup"
Write-Host ""
Write-Host "Now run:"
Write-Host "  npm run build"
Write-Host "  npx vercel"
