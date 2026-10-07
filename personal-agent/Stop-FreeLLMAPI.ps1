$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nodePath = (Get-Command node -ErrorAction Stop).Source
$resolver = Join-Path $projectRoot 'path-resolver.mjs'
$resolveScript = 'import {pathToFileURL} from ''node:url'';const m=await import(pathToFileURL(process.argv[1]));process.stdout.write(m.getCareerOpsRoot());'
$dataRoot = (& $nodePath --input-type=module -e $resolveScript $resolver)
if ($LASTEXITCODE -ne 0 -or -not $dataRoot) { throw 'Cannot resolve the Career Ops data directory.' }
$recordFile = Join-Path ([IO.Path]::GetFullPath($dataRoot)) 'data\personal-runtime\freellmapi.json'
if (-not (Test-Path -LiteralPath $recordFile)) { Write-Host 'No FreeLLMAPI process is recorded.'; exit 0 }
$record = Get-Content -LiteralPath $recordFile -Raw | ConvertFrom-Json
$identity = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$record.pid)" -ErrorAction SilentlyContinue
if ($identity) {
  $sameTime = $identity.CreationDate.ToUniversalTime() -eq ([datetime]$record.createdAt).ToUniversalTime()
  if ($identity.ExecutablePath -ne $record.executable -or $identity.ExecutablePath -ne $nodePath -or -not $sameTime -or -not $identity.CommandLine.Contains($record.script)) { throw 'Refusing to stop the process because its identity no longer matches FreeLLMAPI.' }
  Stop-Process -Id $record.pid -ErrorAction Stop
}
Remove-Item -LiteralPath $recordFile
Write-Host 'FreeLLMAPI stopped. Its encrypted database and Career Ops configuration were preserved.'
