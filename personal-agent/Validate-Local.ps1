param([switch]$Build)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  Write-Host 'Running core tests...'
  npm test
  Write-Host 'Running web typecheck...'
  npm --prefix web run typecheck
  if ($Build) {
    Write-Host 'Building production web bundle...'
    npm --prefix web run build
  }
  Write-Host 'Checking dependency vulnerabilities...'
  npm audit --audit-level=high
  Write-Host 'Local validation passed.' -ForegroundColor Green
} finally { Pop-Location }
