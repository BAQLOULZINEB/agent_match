param([string]$InstallPath)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $InstallPath) { $InstallPath = [IO.Path]::GetFullPath((Join-Path $projectRoot '..\freellmapi')) }
else { $InstallPath = [IO.Path]::GetFullPath($InstallPath) }
& (Join-Path $PSScriptRoot 'Setup-FreeLLMAPI.ps1') -InstallPath $InstallPath

$nodePath = (Get-Command node -ErrorAction Stop).Source
$resolver = Join-Path $projectRoot 'path-resolver.mjs'
$resolveScript = 'import {pathToFileURL} from ''node:url'';const m=await import(pathToFileURL(process.argv[1]));process.stdout.write(m.getCareerOpsRoot());'
$dataRoot = (& $nodePath --input-type=module -e $resolveScript $resolver)
if ($LASTEXITCODE -ne 0 -or -not $dataRoot) { throw 'Cannot resolve the Career Ops data directory.' }
$dataRoot = [IO.Path]::GetFullPath($dataRoot)
$runtime = Join-Path $dataRoot 'data\personal-runtime'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$recordFile = Join-Path $runtime 'freellmapi.json'
$serverFile = Join-Path $InstallPath 'server\dist\index.js'

function Test-OwnedGateway($record) {
  if (-not $record) { return $false }
  $identity = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$record.pid)" -ErrorAction SilentlyContinue
  if (-not $identity) { return $false }
  $sameTime = $identity.CreationDate.ToUniversalTime() -eq ([datetime]$record.createdAt).ToUniversalTime()
  return $identity.ExecutablePath -eq $nodePath -and $sameTime -and $identity.CommandLine.Contains($serverFile)
}
$record = if (Test-Path -LiteralPath $recordFile) { Get-Content -LiteralPath $recordFile -Raw | ConvertFrom-Json } else { $null }
if (-not (Test-OwnedGateway $record)) {
  $listener = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
  if ($listener) { throw 'Port 3001 is occupied by a process not owned by this Career Ops launcher.' }
  $env:FREEAPI_ENV_PATH = Join-Path $InstallPath '.env'
  $process = Start-Process -FilePath $nodePath -ArgumentList ('"' + $serverFile + '"') -WorkingDirectory $InstallPath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'freellmapi.out.log') -RedirectStandardError (Join-Path $runtime 'freellmapi.err.log')
  Start-Sleep -Milliseconds 800
  $process.Refresh()
  if ($process.HasExited) { throw "FreeLLMAPI exited. Read $runtime\freellmapi.err.log" }
  $identity = Get-CimInstance Win32_Process -Filter "ProcessId = $($process.Id)"
  if (-not $identity -or -not $identity.CommandLine.Contains($serverFile)) { throw 'Cannot verify the FreeLLMAPI process.' }
  $record = [ordered]@{ pid=$process.Id; createdAt=$identity.CreationDate.ToUniversalTime().ToString('o'); executable=$nodePath; script=$serverFile; installPath=$InstallPath }
  [IO.File]::WriteAllText($recordFile, ($record | ConvertTo-Json -Depth 5))
}

$ready = $false
for ($attempt=0; $attempt -lt 30; $attempt++) {
  try { $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3001/livez' -UseBasicParsing -TimeoutSec 2; if ($response.StatusCode -eq 200) { $ready = $true; break } } catch { }
  Start-Sleep -Seconds 1
}
if (-not $ready) { throw "FreeLLMAPI did not become live. Read $runtime\freellmapi.err.log" }
& $nodePath (Join-Path $PSScriptRoot 'configure-freellmapi.mjs') $InstallPath $dataRoot
if ($LASTEXITCODE -ne 0) { throw 'Could not connect the FreeLLMAPI unified key to Career Ops.' }
Write-Host 'FreeLLMAPI is available at http://127.0.0.1:3001/ and Career Ops uses model=auto.'
