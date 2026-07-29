$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$serverScript = Join-Path $projectRoot 'server.js'
$stdoutLog = Join-Path $projectRoot 'server.out.log'
$stderrLog = Join-Path $projectRoot 'server.err.log'

$listening = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listening) {
  $pids = $listening | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $pids) {
    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
    } catch {
      Write-Host "Nao foi possivel encerrar o processo $processId."
    }
  }
  Start-Sleep -Milliseconds 400
}

$process = Start-Process -FilePath 'node' `
  -ArgumentList "`"$serverScript`"" `
  -WorkingDirectory $projectRoot `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -WindowStyle Hidden `
  -PassThru

Write-Host "Servidor iniciado em background. PID: $($process.Id)"
