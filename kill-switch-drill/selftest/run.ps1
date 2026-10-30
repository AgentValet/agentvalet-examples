# Self-test: runs drill.ps1 against the mock server and checks the order of refusals.
$ErrorActionPreference = 'Stop'
$port = 8766; $lifetime = 6; $B = "http://127.0.0.1:$port"
$py = @('python3', 'python', 'py') | Where-Object { Get-Command $_ -ErrorAction SilentlyContinue } |
  Where-Object { try { & $_ -c 'import sys' 2>$null; $LASTEXITCODE -eq 0 } catch { $false } } | Select-Object -First 1
if (-not $py) { Write-Error 'selftest needs Python 3' }
$hide = if ($IsWindows) { @{ WindowStyle = 'Hidden' } } else { @{} }   # -WindowStyle is Windows-only
$server = Start-Process $py -ArgumentList "`"$PSScriptRoot/mock_server.py`"", $port, $lifetime -PassThru @hide
try {
  for ($i = 0; $i -lt 50; $i++) { try { $null = Invoke-WebRequest "$B/gateway"; break } catch { Start-Sleep -Milliseconds 100 } }
  $env:TOKEN = (Invoke-RestMethod -Method Post "$B/token").access_token
  $env:B = $B
  $out = Join-Path ([IO.Path]::GetTempPath()) "drill-selftest-$PID.csv"
  & "$PSScriptRoot/../drill.ps1" `
    -Check 'gateway=Invoke-RestMethod "$env:B/gateway"',
           'new-token=Invoke-RestMethod -Method Post "$env:B/token"',
           'introspection=Invoke-RestMethod "$env:B/introspect?token=$env:TOKEN"',
           'local-validation=Invoke-RestMethod "$env:B/api" -Headers @{ Authorization = "Bearer $env:TOKEN" }' `
    -Revoke 'Invoke-RestMethod -Method Post "$env:B/admin/gateway-off"',
            'Invoke-RestMethod -Method Post "$env:B/admin/revoke?token=$env:TOKEN"',
            'Invoke-RestMethod -Method Post "$env:B/admin/disable-client"' `
    -Interval 0.5 -Timeout 30 -Label selftest -Out $out
  $rows = Import-Csv $out
  $local = [double]($rows | Where-Object path -eq 'local-validation').seconds_to_first_refusal
  if ($local -lt ($lifetime - 1.5) -or $local -gt ($lifetime + 2.5)) { throw "local-validation at $local s, expected about $lifetime s" }
  foreach ($r in $rows | Where-Object path -in 'gateway', 'new-token', 'introspection') {
    if ([double]$r.seconds_to_first_refusal -gt 3) { throw "$($r.path) took $($r.seconds_to_first_refusal) s, expected under 3 s" }
  }
  Write-Host 'selftest passed'
} finally {
  Stop-Process -Id $server.Id -ErrorAction SilentlyContinue
}
