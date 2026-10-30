<#
.SYNOPSIS
  Time how long an agent's access keeps working after you revoke it.

.DESCRIPTION
  Describe each way the agent reaches something ("a path") as a check: a PowerShell
  command that succeeds while access works and fails (throws, or exits non-zero) once
  it is refused. The drill confirms every check passes, pulls your revoke levers, then
  polls each check until it fails. The slowest path is your time-to-revocation.

  Same behaviour and results file as drill.sh.

.EXAMPLE
  ./drill.ps1 `
    -Check 'existing-token=Invoke-RestMethod https://graph.microsoft.com/v1.0/organization -Headers @{ Authorization = "Bearer $env:TOKEN" }' `
    -Revoke 'manual' -Label 'support-bot'

.NOTES
  Exit codes: 0 every path refused, 1 a path still worked at the timeout,
              2 bad arguments or a check failed before anything was revoked.
#>
param(
  # A path to time, as NAME=COMMAND. Repeat with commas: -Check 'a=...','b=...'
  [Parameter(Mandatory)][string[]]$Check,
  # Levers to pull, in order. 'manual' pauses for you to revoke by hand; the clock starts when you press Enter.
  [Parameter(Mandatory)][string[]]$Revoke,
  [double]$Interval = 1,
  [double]$Timeout = 7200,
  # Consecutive failures needed to count a path as refused.
  [int]$Confirm = 2,
  [string]$Label = 'agent',
  [string]$Out = 'results.csv'
)
$ErrorActionPreference = 'Stop'

$paths = foreach ($c in $Check) {
  $i = $c.IndexOf('=')
  if ($i -lt 1) { Write-Error "-Check '$c' is not NAME=COMMAND"; exit 2 }
  [pscustomobject]@{ Name = $c.Substring(0, $i); Block = [scriptblock]::Create($c.Substring($i + 1)); Fails = 0; First = $null; Refused = $null }
}

function Test-Path-Works($block) {
  $global:LASTEXITCODE = 0
  try {
    $null = & $block 2>$null
    return ($global:LASTEXITCODE -eq 0)
  } catch {
    return $false
  }
}

# 1. Every path must work before anything is revoked, or the timing means nothing.
Write-Host "Checking $($paths.Count) path(s) before revoking..."
foreach ($p in $paths) {
  if (Test-Path-Works $p.Block) { Write-Host "  ok      $($p.Name)" }
  else { Write-Host "  FAILED  $($p.Name): this check fails before anything is revoked. Fix it first."; exit 2 }
}

# 2. Pull the levers. The clock starts at the first one.
$clock = $null
foreach ($r in $Revoke) {
  if ($r -eq 'manual') {
    $null = Read-Host "Revoke the agent's access now, then press Enter to start the clock"
    if (-not $clock) { $clock = [Diagnostics.Stopwatch]::StartNew() }
    Write-Host '  lever   manual (clock started)'
  } else {
    if (-not $clock) { $clock = [Diagnostics.Stopwatch]::StartNew() }
    if (Test-Path-Works ([scriptblock]::Create($r))) { Write-Host "  lever   ok      $r" }
    else { Write-Host "  lever   FAILED  $r; timing continues" }
  }
}

# 3. Poll every path until each is refused $Confirm times in a row.
Write-Host "Polling every $($Interval)s (timeout $($Timeout)s)..."
while ($paths | Where-Object { $null -eq $_.Refused }) {
  foreach ($p in $paths | Where-Object { $null -eq $_.Refused }) {
    $started = [math]::Round($clock.Elapsed.TotalSeconds, 1)   # stamp the attempt when it starts
    if (Test-Path-Works $p.Block) { $p.Fails = 0; $p.First = $null }
    else {
      if ($p.Fails -eq 0) { $p.First = $started }
      $p.Fails++
      if ($p.Fails -ge $Confirm) { $p.Refused = $p.First; Write-Host "  refused $($p.Name) after $($p.Refused) s" }
    }
  }
  if (-not ($paths | Where-Object { $null -eq $_.Refused })) { break }
  if ($clock.Elapsed.TotalSeconds -ge $Timeout) { break }
  Start-Sleep -Milliseconds ([int]($Interval * 1000))
}

# 4. Report, and append one row per path to the results file.
if (-not (Test-Path $Out)) { 'run_date,label,path,seconds_to_first_refusal,status' | Set-Content -Encoding utf8 $Out }
$runDate = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
foreach ($p in $paths) {
  if ($null -ne $p.Refused) { "$runDate,$Label,$($p.Name),$($p.Refused),refused" | Add-Content -Encoding utf8 $Out }
  else { "$runDate,$Label,$($p.Name),,still working at $($Timeout)s" | Add-Content -Encoding utf8 $Out }
}
Write-Host ''
$still = @($paths | Where-Object { $null -eq $_.Refused })
if ($still.Count -eq 0) {
  $slow = $paths | Sort-Object Refused -Descending | Select-Object -First 1
  Write-Host "time-to-revocation: $($slow.Refused) s (slowest path: $($slow.Name))"
  exit 0
} else {
  Write-Host "time-to-revocation: more than $Timeout s (still working: $(($still | ForEach-Object Name) -join ' '))"
  exit 1
}
