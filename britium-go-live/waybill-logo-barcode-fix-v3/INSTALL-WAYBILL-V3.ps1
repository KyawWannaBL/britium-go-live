param(
  [string]$ProjectPath = (Get-Location).Path
)

$ErrorActionPreference = "Stop"
$componentSource = Join-Path $PSScriptRoot "WaybillStudioPage.tsx"
$logoSource = Join-Path $PSScriptRoot "logo.png"
$componentTarget = Join-Path $ProjectPath "src\pages\WaybillStudioPage.tsx"
$logoTarget = Join-Path $ProjectPath "public\logo.png"

if (-not (Test-Path $componentTarget -PathType Leaf)) {
  throw "Vite project not found at: $ProjectPath"
}

if (-not (Test-Path $componentSource -PathType Leaf)) {
  throw "Patch component is missing: $componentSource"
}

if (-not (Test-Path $logoSource -PathType Leaf)) {
  throw "Patch logo is missing: $logoSource"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item -LiteralPath $componentTarget -Destination "$componentTarget.before-waybill-v3-$stamp"

if (Test-Path $logoTarget -PathType Leaf) {
  Copy-Item -LiteralPath $logoTarget -Destination "$logoTarget.before-waybill-v3-$stamp"
}

Copy-Item -LiteralPath $componentSource -Destination $componentTarget -Force
Copy-Item -LiteralPath $logoSource -Destination $logoTarget -Force

$installed = Get-Content -LiteralPath $componentTarget -Raw
if ($installed -notmatch "waybill-v3" -or $installed -notmatch "full-scans") {
  throw "V3 verification failed after copying the component."
}

if (-not (Test-Path $logoTarget -PathType Leaf)) {
  throw "V3 verification failed after copying logo.png."
}

Write-Host ""
Write-Host "Waybill V3 installed and verified." -ForegroundColor Green
Write-Host "Component: $componentTarget"
Write-Host "Logo:      $logoTarget"
Write-Host ""
Write-Host "Build and preview with:"
Write-Host "  npm run build"
Write-Host "  npx vercel"
