<#
.SYNOPSIS
  OWNER ONLY: grant (or revoke) a LoanWick role for a teammate's PUBLIC identity.

.DESCRIPTION
  Runs `spacetime call <db> assign_demo_user ...` with the database owner's own CLI login.
  The teammate only ever sends their public identity hex; no token is shared in either direction.
  Inputs are validated before anything is sent. Never publishes, deletes, or uses --delete-data.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File spacetimedb\qa\assign-role.ps1 `
    -Identity c200abc...(64 hex) -UserId officer-jason -Role officer -DisplayName "Jason (officer)"

.EXAMPLE
  # Revoke
  powershell -NoProfile -ExecutionPolicy Bypass -File spacetimedb\qa\assign-role.ps1 `
    -Identity c200abc... -UserId officer-jason -Role officer -DisplayName "Jason (officer)" -Deactivate
#>
param(
  [Parameter(Mandatory = $true)][string]$Identity,
  [Parameter(Mandatory = $true)][string]$UserId,
  [Parameter(Mandatory = $true)][ValidateSet('officer', 'reviewer', 'worker', 'borrower')][string]$Role,
  [Parameter(Mandatory = $true)][string]$DisplayName,
  [string]$Organization = 'demo-org',
  [string]$Database = 'loanwick-hackutd26-dev',
  [string]$Server = 'maincloud',
  [string]$Cli = $(if ($env:LOANWICK_SPACETIME_CLI) { $env:LOANWICK_SPACETIME_CLI } else { 'spacetime' }),
  [string]$ConfigPath,
  [switch]$Deactivate,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'

$hex = $Identity.Trim().ToLowerInvariant() -replace '^0x', ''
if ($hex -notmatch '^[0-9a-f]{64}$') { throw 'Identity must be the 64-hex-character PUBLIC identity printed by whoami.ts (optionally prefixed with 0x).' }
if ($hex -match '^ey') { throw 'That looks like a token, not an identity. Never send or paste tokens.' }
foreach ($pair in @(@('UserId', $UserId), @('Organization', $Organization), @('Database', $Database))) {
  if ($pair[1] -notmatch '^[a-zA-Z0-9_-]{1,100}$') { throw "$($pair[0]) must use only letters, digits, '_' or '-' (1-100 characters)." }
}
if ($DisplayName.Length -gt 120 -or $DisplayName -match '["\\]' -or $DisplayName.Trim().Length -eq 0) { throw 'DisplayName must be 1-120 characters without quotes or backslashes.' }

$active = if ($Deactivate) { 'false' } else { 'true' }
$q = { param($s) '"\"' + $s + '\""' }   # JSON string argument, escaped for the Windows command line
$argList = @()
if ($ConfigPath) { $argList += @('--config-path', ('"' + $ConfigPath + '"')) }
$argList += @('call', '--server', $Server, $Database, 'assign_demo_user',
  (& $q "0x$hex"), (& $q $UserId), (& $q $Organization), (& $q $Role), (& $q $DisplayName), $active)
$argString = $argList -join ' '

Write-Output "Database : $Database on $Server"
Write-Output "Identity : 0x$hex"
Write-Output "Grant    : $UserId -> $Role@$Organization (active=$active)"
if ($DryRun) { Write-Output "Dry run. Would run: $Cli $argString"; exit 0 }

$process = Start-Process -FilePath $Cli -ArgumentList $argString -NoNewWindow -Wait -PassThru
if ($process.ExitCode -ne 0) {
  Write-Output "FAILED (exit $($process.ExitCode)). UNAUTHORIZED means this CLI login is not the database owner; INVALID_INPUT means the user ID or identity is already bound differently."
  exit $process.ExitCode
}
Write-Output 'Done. Ask the teammate to rerun whoami.ts; it should now print their role.'
