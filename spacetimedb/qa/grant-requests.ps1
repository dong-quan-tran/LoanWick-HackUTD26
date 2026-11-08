<#
.SYNOPSIS
  OWNER ONLY: register teammates from their `LOANWICK-JOIN ...` lines. Preview by default; -Apply to change roles.

.DESCRIPTION
  Paste every teammate's message into one text file (any extra chat text is ignored). This script extracts the
  LOANWICK-JOIN lines, validates them, and prints the identity-to-role mapping. Nothing changes without -Apply.
  -Apply calls assign-role.ps1 for each request with the owner's own CLI login, then lists registered users (read-only).
  Requests contain only public identities; no token is ever involved.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File spacetimedb\qa\grant-requests.ps1 -RequestFile requests.txt
  powershell -NoProfile -ExecutionPolicy Bypass -File spacetimedb\qa\grant-requests.ps1 -RequestFile requests.txt -Apply
#>
param(
  [Parameter(Mandatory = $true)][string]$RequestFile,
  [string]$Database = 'loanwick-hackutd26-dev',
  [string]$Server = 'maincloud',
  [string]$Organization = 'demo-org',
  [string]$Cli = $(if ($env:LOANWICK_SPACETIME_CLI) { $env:LOANWICK_SPACETIME_CLI } else { 'spacetime' }),
  [string]$ConfigPath,
  [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$reserved = @('officer', 'reviewer', 'worker', 'borrower-a', 'borrower-b')
$text = Get-Content -Raw -Path $RequestFile
if ($text -match 'eyJ[A-Za-z0-9_-]{20,}') { throw 'The request file contains something that looks like a TOKEN. Delete it, and ask that teammate to create a new identity.' }

$requests = @()
$problems = @()
foreach ($line in ($text -split "`r?`n")) {
  if ($line -notmatch 'LOANWICK-JOIN') { continue }
  $fields = @{}
  foreach ($m in [regex]::Matches($line, '(\w+)=(\S+)')) { $fields[$m.Groups[1].Value] = $m.Groups[2].Value }
  $id = ($fields['id'] -replace '^0x', '').ToLowerInvariant()
  $issue = @()
  if ($fields['db'] -ne $Database) { $issue += "database is '$($fields['db'])', expected '$Database'" }
  if ($fields['role'] -notin @('officer', 'reviewer', 'borrower', 'worker')) { $issue += "invalid role '$($fields['role'])'" }
  if ($fields['user'] -notmatch '^[a-zA-Z0-9_-]{1,100}$') { $issue += "invalid user '$($fields['user'])'" }
  if ($fields['user'] -in $reserved) { $issue += "user '$($fields['user'])' is reserved for the demo identities" }
  if ($id -notmatch '^[0-9a-f]{64}$') { $issue += 'identity is not 64 hex characters' }
  $request = [pscustomobject]@{ Name = $fields['name']; Role = $fields['role']; UserId = $fields['user']; Identity = $id; Issue = ($issue -join '; ') }
  $requests += $request
}
if (-not $requests.Count) { throw "No LOANWICK-JOIN lines found in $RequestFile." }
foreach ($group in ($requests | Group-Object Identity | Where-Object Count -gt 1)) { $group.Group | ForEach-Object { $_.Issue = (@($_.Issue, 'identity listed more than once') | Where-Object { $_ }) -join '; ' } }
foreach ($group in ($requests | Group-Object UserId | Where-Object Count -gt 1)) { $group.Group | ForEach-Object { $_.Issue = (@($_.Issue, 'user ID listed more than once') | Where-Object { $_ }) -join '; ' } }

Write-Output "Identity-to-role mapping for $Database on $Server (organization $Organization):"
$requests | ForEach-Object {
  [pscustomobject]@{ Name = $_.Name; Role = $_.Role; UserId = $_.UserId; Identity = ('0x' + $_.Identity.Substring(0, [Math]::Min(12, $_.Identity.Length)) + '...'); Status = $(if ($_.Issue) { 'REJECTED: ' + $_.Issue } else { 'ok' }) }
} | Format-Table -AutoSize | Out-String -Width 220 | Write-Output
$valid = @($requests | Where-Object { -not $_.Issue })
if (-not $Apply) { Write-Output "Preview only. $($valid.Count) valid request(s). Rerun with -Apply to register them."; exit 0 }
if (-not $valid.Count) { Write-Output 'Nothing valid to apply.'; exit 1 }

$assign = Join-Path $PSScriptRoot 'assign-role.ps1'
$failed = 0
foreach ($r in $valid) {
  $params = @{ Identity = $r.Identity; UserId = $r.UserId; Role = $r.Role; DisplayName = "$($r.Name) ($($r.Role))"; Organization = $Organization; Database = $Database; Server = $Server; Cli = $Cli }
  if ($ConfigPath) { $params.ConfigPath = $ConfigPath }
  & $assign @params | Where-Object { $_ -match '^(Grant|FAILED|Done)' } | ForEach-Object { Write-Output "  $_" }
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { $failed++ }
}
Write-Output ''
Write-Output 'Registered users now (read-only):'
$sqlArgs = @()
if ($ConfigPath) { $sqlArgs += @('--config-path', ('"' + $ConfigPath + '"')) }
$sqlArgs += @('sql', '--server', $Server, $Database, '"SELECT id, organization_id, role, active FROM users"')
Start-Process -FilePath $Cli -ArgumentList ($sqlArgs -join ' ') -NoNewWindow -Wait | Out-Null
if ($failed) { Write-Output "$failed request(s) failed; see messages above."; exit 1 }
Write-Output 'Done. Ask each teammate to rerun: npm run join:cloud -- --name <name> --roles <roles>'
