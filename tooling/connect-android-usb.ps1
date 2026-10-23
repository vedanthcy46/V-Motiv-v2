param([string]$Serial)
$ErrorActionPreference = 'Stop'
$adbCommand = Get-Command adb -ErrorAction SilentlyContinue
$adbPath = if ($adbCommand) { $adbCommand.Source } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe' }
if (-not (Test-Path -LiteralPath $adbPath)) { throw 'Android platform-tools adb was not found. Add adb to PATH or install it with Android Studio.' }
$deviceRows = & $adbPath devices
$connectedDevices = @($deviceRows | Where-Object { $_ -match '^(\S+)\s+device$' } | ForEach-Object { ($_ -split '\s+')[0] })
if (-not $Serial) {
  if ($connectedDevices.Count -ne 1) { throw 'Connect exactly one authorized Android device or pass -Serial <device-id>.' }
  $Serial = $connectedDevices[0]
}
if ($Serial -notin $connectedDevices) { throw 'The selected Android device is not connected and authorized.' }
foreach ($port in @(8081, 4100)) {
  & $adbPath -s $Serial reverse "tcp:$port" "tcp:$port"
  if ($LASTEXITCODE -ne 0) { throw "Could not connect Android port $port." }
}
Write-Output 'Android USB routes are ready: Metro 8081 and V MOTIV API 4100. Restart the development app to reload its configuration.'
