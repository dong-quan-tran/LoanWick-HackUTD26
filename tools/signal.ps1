$ErrorActionPreference = "Stop"
$python = $null
foreach ($name in @("py", "python")) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) {
        $python = $cmd.Source
        break
    }
}
if (-not $python) {
    Write-Error "Python 3 is required to run signal."
    exit 1
}
& $python "$PSScriptRoot\signal.py" @args
exit $LASTEXITCODE
