$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nodePath = (Get-Command node -ErrorAction Stop).Source
$resolver = Join-Path $projectRoot 'path-resolver.mjs'
$resolveScript = 'import {pathToFileURL} from ''node:url'';const m=await import(pathToFileURL(process.argv[1]));process.stdout.write(m.getCareerOpsRoot());'
$dataRoot = (& $nodePath --input-type=module -e $resolveScript $resolver)
if ($LASTEXITCODE -ne 0 -or -not $dataRoot) { throw 'Cannot resolve the career-ops data directory.' }
$runtime = Join-Path ([IO.Path]::GetFullPath($dataRoot)) 'data/personal-runtime'
$recordFile = Join-Path $runtime 'platform.json'
if (-not (Test-Path -LiteralPath $recordFile)) { Write-Host 'No platform processes are recorded.'; exit 0 }
$records = Get-Content -LiteralPath $recordFile -Raw | ConvertFrom-Json
$expected = @{worker=(Join-Path $PSScriptRoot 'scheduler.mjs'); web=(Join-Path $projectRoot 'web/node_modules/next/dist/bin/next')}
foreach ($name in @('worker','web')) {
  $record = $records.$name
  if (-not $record) { continue }
  $identity = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$record.pid)" -ErrorAction SilentlyContinue
  if (-not $identity) { continue }
  if ($record.script -ne $expected[$name] -or $identity.ExecutablePath -ne $record.executable -or $identity.ExecutablePath -ne $nodePath -or $identity.CreationDate.ToUniversalTime().ToString('o') -ne $record.createdAt -or -not $identity.CommandLine.Contains($expected[$name])) {
    throw "Refusing to stop PID $($record.pid): its identity does not match this platform's $name process."
  }
  if ($name -eq 'worker') {
    [IO.File]::WriteAllText((Join-Path $runtime 'worker.stop'), 'stop')
    for ($attempt=0; $attempt -lt 5; $attempt++) {
      if (-not (Get-Process -Id $record.pid -ErrorAction SilentlyContinue)) { break }
      Start-Sleep -Seconds 1
    }
  }
  $process = Get-Process -Id $record.pid -ErrorAction SilentlyContinue
  if ($process) {
    # Recheck after waiting; never act on a recycled PID.
    $identity = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$record.pid)" -ErrorAction SilentlyContinue
    if (-not $identity) { continue }
    if ($identity.CreationDate.ToUniversalTime().ToString('o') -ne $record.createdAt -or $identity.ExecutablePath -ne $nodePath -or -not $identity.CommandLine.Contains($expected[$name])) { throw 'Process identity changed. Stop cancelled.' }
    Stop-Process -InputObject $process -ErrorAction Stop
  }
}
# Only remove this exact runtime record, never a directory or user data.
Remove-Item -LiteralPath $recordFile
Write-Host 'Local dashboard and scheduled worker stopped. Your profile, offers and history are saved.'
