[CmdletBinding()]
param(
    [string]$ZipPath = (Join-Path $PSScriptRoot "vite-dispatch-project-integrated.zip"),
    [string]$Destination = (Join-Path $PSScriptRoot "vite-dispatch-project"),
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

try {
    Write-Step "Checking prerequisites"

    if (-not (Test-Path -LiteralPath $ZipPath -PathType Leaf)) {
        throw "ZIP file not found: $ZipPath`nPlace this script beside vite-dispatch-project-integrated.zip, or pass -ZipPath."
    }

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw "Node.js was not found. Install Node.js 20 LTS or newer, reopen PowerShell, and run this script again."
    }

    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw "npm was not found. Reinstall Node.js with npm enabled."
    }

    $nodeMajor = [int]((node --version).TrimStart("v").Split(".")[0])
    if ($nodeMajor -lt 20) {
        throw "Node.js 20 or newer is required. Installed version: $(node --version)"
    }

    if (Test-Path -LiteralPath $Destination) {
        throw "Destination already exists: $Destination`nUse -Destination with a new folder name. Existing files were not changed."
    }

    Write-Step "Extracting project"
    New-Item -ItemType Directory -Path $Destination | Out-Null
    Expand-Archive -LiteralPath $ZipPath -DestinationPath $Destination

    $packageJson = Join-Path $Destination "package.json"
    if (-not (Test-Path -LiteralPath $packageJson -PathType Leaf)) {
        throw "Extraction completed, but package.json was not found at: $packageJson"
    }

    $envExample = Join-Path $Destination ".env.example"
    $envLocal = Join-Path $Destination ".env.local"
    if ((Test-Path -LiteralPath $envExample) -and -not (Test-Path -LiteralPath $envLocal)) {
        Copy-Item -LiteralPath $envExample -Destination $envLocal
        Write-Warning "Created .env.local from .env.example. Add your Supabase URL and anon key before testing live workflows."
    }

    Push-Location $Destination
    try {
        if (-not $SkipInstall) {
            Write-Step "Installing npm dependencies"
            if (Test-Path -LiteralPath (Join-Path $Destination "package-lock.json")) {
                npm ci
            }
            else {
                npm install
            }

            if ($LASTEXITCODE -ne 0) {
                throw "Dependency installation failed with exit code $LASTEXITCODE."
            }
        }

        Write-Step "Starting Vite"
        Write-Host "Enterprise Portal: http://localhost:5173/" -ForegroundColor Green
        Write-Host "Rider App:        http://localhost:5173/rider-app" -ForegroundColor Green
        Write-Host "Press Ctrl+C to stop the server.`n" -ForegroundColor Yellow

        npm run dev -- --host 0.0.0.0
        if ($LASTEXITCODE -ne 0) {
            throw "Vite stopped with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}
catch {
    Write-Host "`nSetup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
