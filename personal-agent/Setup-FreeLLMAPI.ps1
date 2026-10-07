param([string]$InstallPath)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $InstallPath) { $InstallPath = [IO.Path]::GetFullPath((Join-Path $projectRoot '..\freellmapi')) }
else { $InstallPath = [IO.Path]::GetFullPath($InstallPath) }
$packageFile = Join-Path $InstallPath 'package.json'
$serverFile = Join-Path $InstallPath 'server\dist\index.js'
if (-not (Test-Path -LiteralPath $packageFile)) { throw "FreeLLMAPI is not installed at $InstallPath" }
if (-not (Test-Path -LiteralPath $serverFile)) { throw "FreeLLMAPI is not built. In $InstallPath run: npm ci --ignore-scripts --no-audit --no-fund; npm rebuild better-sqlite3; npm run build" }

$nodePath = (Get-Command node -ErrorAction Stop).Source
$resolver = Join-Path $projectRoot 'path-resolver.mjs'
$resolveScript = 'import {pathToFileURL} from ''node:url'';const m=await import(pathToFileURL(process.argv[1]));process.stdout.write(m.getCareerOpsRoot());'
$dataRoot = (& $nodePath --input-type=module -e $resolveScript $resolver)
if ($LASTEXITCODE -ne 0 -or -not $dataRoot) { throw 'Cannot resolve the Career Ops data directory.' }
$dataRoot = [IO.Path]::GetFullPath($dataRoot)
$privateDir = Join-Path $dataRoot 'data'
New-Item -ItemType Directory -Force -Path $privateDir | Out-Null

$configPath = Join-Path $privateDir 'freellmapi.config.json'
$config = [ordered]@{
  keys = @(
    [ordered]@{ platform='kilo'; label='anonymous-free' },
    [ordered]@{ platform='ovh'; label='anonymous-free' },
    [ordered]@{ platform='aihorde'; label='anonymous-free' }
  )
  routing = [ordered]@{ strategy='balanced'; keySelectionStrategy='auto' }
}
[IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 8))

$envPath = Join-Path $InstallPath '.env'
$existing = if (Test-Path -LiteralPath $envPath) { [IO.File]::ReadAllText($envPath) } else { '' }
if ($existing -notmatch '(?m)^ENCRYPTION_KEY=') {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $encryptionKey = [Convert]::ToHexString($bytes).ToLowerInvariant()
  $configForEnv = $configPath.Replace('"','\"')
  $envLines = @(
    "ENCRYPTION_KEY=$encryptionKey",
    'PORT=3001',
    'HOST=127.0.0.1',
    'NODE_ENV=production',
    "FREEAPI_CONFIG_PATH=`"$configForEnv`"",
    'REQUEST_ANALYTICS_LOG_CLIENT=false',
    'RESPONSE_CACHE=true',
    'RESPONSE_CACHE_PERSIST=false'
  )
  [IO.File]::WriteAllText($envPath, (($envLines -join [Environment]::NewLine) + [Environment]::NewLine))
}
Write-Host "FreeLLMAPI configuration is ready at $InstallPath (secrets were not displayed)."
