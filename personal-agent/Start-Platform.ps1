param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$webRoot = Join-Path $projectRoot 'web'
$nodePath = (Get-Command node -ErrorAction Stop).Source
$resolver = Join-Path $projectRoot 'path-resolver.mjs'
$resolveScript = 'import {pathToFileURL} from ''node:url'';const m=await import(pathToFileURL(process.argv[1]));process.stdout.write(m.getCareerOpsRoot());'
$dataRoot = (& $nodePath --input-type=module -e $resolveScript $resolver)
if ($LASTEXITCODE -ne 0 -or -not $dataRoot) { throw 'Cannot resolve the career-ops data directory.' }
$dataRoot = [IO.Path]::GetFullPath($dataRoot)
$runtime = Join-Path $dataRoot 'data/personal-runtime'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$recordFile = Join-Path $runtime 'platform.json'
$records = @{}
if (Test-Path -LiteralPath $recordFile) {
  $saved = Get-Content -LiteralPath $recordFile -Raw | ConvertFrom-Json
  foreach ($property in $saved.PSObject.Properties) { $records[$property.Name] = $property.Value }
}
function Test-OwnedProcess($record, $scriptPath) {
  if (-not $record) { return $false }
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$record.pid)" -ErrorAction SilentlyContinue
  if (-not $process) { return $false }
  $sameTime = $process.CreationDate.ToUniversalTime().ToString('o') -eq $record.createdAt
  return $sameTime -and $process.ExecutablePath -eq $nodePath -and $record.script -eq $scriptPath -and $process.CommandLine.Contains($scriptPath)
}
function Save-Records {
  $json = $records | ConvertTo-Json -Depth 5
  $temp = Join-Path $runtime ('platform.' + [guid]::NewGuid().ToString('N') + '.tmp')
  [IO.File]::WriteAllText($temp, $json)
  Move-Item -LiteralPath $temp -Destination $recordFile -Force
}
function Start-OwnedProcess($name, $scriptPath, $arguments, $workingDirectory) {
  if (Test-OwnedProcess $records[$name] $scriptPath) { return }
  $process = Start-Process -FilePath $nodePath -ArgumentList $arguments -WorkingDirectory $workingDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime "$name.out.log") -RedirectStandardError (Join-Path $runtime "$name.err.log")
  Start-Sleep -Milliseconds 700
  $process.Refresh()
  if ($process.HasExited) { throw "$name exited. Read $runtime/$name.err.log" }
  $identity = Get-CimInstance Win32_Process -Filter "ProcessId = $($process.Id)"
  if (-not $identity -or $identity.ExecutablePath -ne $nodePath -or -not $identity.CommandLine.Contains($scriptPath)) { throw "Cannot verify the launched $name process." }
  $records[$name] = @{pid=$process.Id; createdAt=$identity.CreationDate.ToUniversalTime().ToString('o'); executable=$nodePath; script=$scriptPath}
  Save-Records
}
$nextScript = Join-Path $webRoot 'node_modules/next/dist/bin/next'
$workerScript = Join-Path $PSScriptRoot 'scheduler.mjs'
if (-not (Test-Path -LiteralPath (Join-Path $webRoot '.next/BUILD_ID'))) { throw 'Production build missing. In web/, run npm install then npm run build before starting.' }
if (-not (Test-OwnedProcess $records['web'] $nextScript)) {
  $listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
  if ($listener) { throw 'Port 3000 is already occupied. Stop the existing dashboard/server first; this launcher will not replace another process.' }
}
# Both child processes inherit the same canonical data directory.
$env:CAREER_OPS_ROOT = $dataRoot
$env:CAREER_OPS_DATA_DIR = $dataRoot
Start-OwnedProcess 'web' $nextScript ('"' + $nextScript + '" start --hostname 127.0.0.1 --port 3000') $webRoot
$ready = $false
for ($attempt=0; $attempt -lt 30; $attempt++) {
  try { $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/personal' -UseBasicParsing -TimeoutSec 2; if ($response.StatusCode -eq 200) { $ready=$true; break } } catch { }
  Start-Sleep -Seconds 1
}
if (-not $ready) { throw "Dashboard did not become ready. Read $runtime/web.err.log. Stop-Platform.ps1 can stop the recorded process." }
$stopFile = Join-Path $runtime 'worker.stop'
if (Test-Path -LiteralPath $stopFile) { Remove-Item -LiteralPath $stopFile }
Start-OwnedProcess 'worker' $workerScript ('"' + $workerScript + '"') $projectRoot
Write-Host 'Career agent is available at http://127.0.0.1:3000/personal'
Write-Host 'Scheduled searches run only while this PC and the worker are running. Public ATS search works without credentials; France Travail adds its official source when configured.'
if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:3000/personal' -WindowStyle Hidden }
