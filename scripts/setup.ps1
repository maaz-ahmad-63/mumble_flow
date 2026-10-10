<#
.SYNOPSIS
Sets up Mumble AI on this Windows computer and starts it.

.DESCRIPTION
1. Checks that Node.js 20 or newer is installed.
2. Installs the packages (npm install).
3. Creates .env from .env.example if .env does not exist yet.
4. Runs the tests (npm test).
5. Starts the app, waits until it answers, and prints the address to open.

Press Ctrl+C to stop the app.

.PARAMETER NoStart
Do everything except start the app.

.PARAMETER SkipTests
Do not run npm test.

.PARAMETER NoBrowser
Do not open the browser after the app starts.

.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
#>
param(
    [switch]$NoStart,
    [switch]$SkipTests,
    [switch]$NoBrowser
)

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Stop-WithError([string]$Message) {
    Write-Host ""
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit 1
}

function Test-Health([int]$Port) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$Port/health" -UseBasicParsing -TimeoutSec 2
        return ($response.StatusCode -eq 200 -and $response.Content -match '"status"\s*:\s*"ok"')
    } catch {
        return $false
    }
}

function Find-RunningPort([int]$FirstPort) {
    # The app moves to the next port when its port is busy, so check a few.
    foreach ($candidate in $FirstPort..($FirstPort + 5)) {
        if (Test-Health $candidate) { return $candidate }
    }
    return $null
}

$downloadUrl = "https://nodejs.org/en/download"

Write-Step "Checking Node.js"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Stop-WithError "Node.js is not installed. Download the LTS version from $downloadUrl, install it, close this window, open a new PowerShell window, and run this script again."
}
$nodeVersion = (& node --version).Trim()
$nodeMajor = [int]($nodeVersion.TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) {
    Stop-WithError "Node.js $nodeVersion is too old. Mumble AI needs version 20 or newer. Download the LTS version from $downloadUrl, install it, open a new PowerShell window, and run this script again."
}
Write-Host "Found Node.js $nodeVersion"
if ($nodeMajor -eq 20) {
    Write-Host "Node.js 20 no longer gets security fixes. It works, but install the LTS version from $downloadUrl when you can." -ForegroundColor Yellow
}

# npm.cmd avoids the npm.ps1 wrapper, which some execution policies block.
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
    Stop-WithError "npm was not found. It comes with Node.js. Reinstall Node.js from $downloadUrl and open a new PowerShell window."
}

Write-Step "Installing packages (npm install)"
& npm.cmd install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) {
    Stop-WithError "npm install failed. Read the messages above. Check your internet connection and run this script again."
}

Write-Step "Checking the .env settings file"
if (Test-Path ".env") {
    Write-Host ".env already exists. Leaving it as it is."
} else {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env from .env.example."
}
Write-Host "API keys are optional. Add them in .env or later in the app under Settings."

if ($SkipTests) {
    Write-Step "Skipping tests (-SkipTests)"
} else {
    Write-Step "Running tests (npm test)"
    & npm.cmd test
    if ($LASTEXITCODE -ne 0) {
        Stop-WithError "The tests failed. Read the messages above. Run 'npm test' again after fixing the problem."
    }
}

if ($NoStart) {
    Write-Step "Setup finished"
    Write-Host "Start the app later with: npm start"
    exit 0
}

$port = 3050
$portText = $env:PORT
if (-not $portText -and (Test-Path ".env")) {
    $portLine = Select-String -Path ".env" -Pattern '^\s*PORT\s*=\s*(\d+)' | Select-Object -Last 1
    if ($portLine) { $portText = $portLine.Matches[0].Groups[1].Value }
}
if ($portText -match '^\d+$') { $port = [int]$portText }

$runningPort = Find-RunningPort $port
if ($runningPort) {
    Write-Step "Mumble AI is already running"
    Write-Host "Open http://localhost:$runningPort"
    exit 0
}

Write-Step "Starting Mumble AI"
$server = Start-Process -FilePath $node.Source -ArgumentList "server/index.js" -WorkingDirectory $RepoRoot -NoNewWindow -PassThru

$runningPort = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if ($server.HasExited) {
        Stop-WithError "The app stopped right after starting. Read the messages above."
    }
    $runningPort = Find-RunningPort $port
    if ($runningPort) { break }
}

if (-not $runningPort) {
    Write-Host "The app did not answer within 30 seconds. Read the messages above for the address it printed." -ForegroundColor Yellow
} else {
    $url = "http://localhost:$runningPort"
    Write-Host ""
    Write-Host "Mumble AI is running." -ForegroundColor Green
    Write-Host "Open $url in Chrome or Edge."
    Write-Host "Keep this window open while you use it. Press Ctrl+C to stop."
    if (-not $NoBrowser) { Start-Process $url }
}

try {
    Wait-Process -Id $server.Id
} finally {
    if (-not $server.HasExited) {
        Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    }
}
