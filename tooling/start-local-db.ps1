$ErrorActionPreference = 'Stop'
$v2Root = Split-Path -Parent $PSScriptRoot
$v2Data = Join-Path $v2Root '.postgres-data'
$v2Bin = 'C:\Program Files\PostgreSQL\18\bin'
if (-not (Test-Path -LiteralPath (Join-Path $v2Bin 'initdb.exe'))) { throw 'Install PostgreSQL 18 or use compose.yaml.' }
if (-not (Test-Path -LiteralPath $v2Data)) {
  # Development-only local trust; server binds loopback, never all interfaces.
  & (Join-Path $v2Bin 'initdb.exe') -D $v2Data -U vmotiv_v2 -E UTF8 --locale=C -A trust
  if ($LASTEXITCODE -ne 0) { throw 'V2 cluster initialization failed.' }
}
& (Join-Path $v2Bin 'pg_ctl.exe') -D $v2Data status
if ($LASTEXITCODE -ne 0) {
  & (Join-Path $v2Bin 'pg_ctl.exe') -D $v2Data -l (Join-Path $v2Root 'postgres-local.log') -o '-h 127.0.0.1 -p 5440' -w start
  if ($LASTEXITCODE -ne 0) { throw 'V2 database startup failed.' }
}
foreach ($v2Name in @('vmotiv_v2_dev', 'vmotiv_v2_test')) {
  $exists = & (Join-Path $v2Bin 'psql.exe') -h 127.0.0.1 -p 5440 -U vmotiv_v2 -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$v2Name'"
  if ($LASTEXITCODE -ne 0) { throw 'V2 database connection failed.' }
  if ($exists -ne '1') {
    & (Join-Path $v2Bin 'createdb.exe') -h 127.0.0.1 -p 5440 -U vmotiv_v2 $v2Name
    if ($LASTEXITCODE -ne 0) { throw 'V2 database creation failed.' }
  }
}
Write-Host 'V2 PostgreSQL ready on 127.0.0.1:5440. V1 is untouched.'

