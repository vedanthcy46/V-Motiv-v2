$ErrorActionPreference = 'SilentlyContinue'
$adbCommand = Get-Command adb -ErrorAction SilentlyContinue
$adbPath = if ($adbCommand) { $adbCommand.Source } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe' }
if (-not (Test-Path -LiteralPath $adbPath)) {
  Write-Error 'Android platform-tools adb was not found.'
  exit 1
}

Write-Output "V MOTIV USB Auto-Forwarder active. Monitoring connected Android devices..."

while ($true) {
  try {
    $deviceRows = & $adbPath devices
    $connected = @($deviceRows | Where-Object { $_ -match '^(\S+)\s+device$' } | ForEach-Object { ($_ -split '\s+')[0] })
    foreach ($serial in $connected) {
      $reversed = & $adbPath -s $serial reverse --list
      $has4100 = $reversed -match 'tcp:4100'
      $has8081 = $reversed -match 'tcp:8081'
      if (-not $has4100 -or -not $has8081) {
        & $adbPath -s $serial reverse tcp:4100 tcp:4100
        & $adbPath -s $serial reverse tcp:8081 tcp:8081
        $now = Get-Date -Format 'HH:mm:ss'
        Write-Output "[$now] Auto-restored USB routes on ${serial}: Metro (8081) and V MOTIV API (4100)"
      }
    }
  } catch {
    # Ignore transient USB disconnect errors during plug in/out
  }
  Start-Sleep -Seconds 1
}
