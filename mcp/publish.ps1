# Finds npm wherever it's installed and publishes m3x-mcp-server
# Run from: C:\Users\brano\Projects\m3x\mcp\

$candidates = @(
    "C:\Program Files\nodejs\npm.cmd",
    "C:\Program Files (x86)\nodejs\npm.cmd",
    "$env:APPDATA\nvm\npm.cmd",
    "$env:LOCALAPPDATA\fnm\node-versions\*\installation\npm.cmd",
    "$env:USERPROFILE\scoop\apps\nodejs-lts\current\npm.cmd",
    "$env:USERPROFILE\scoop\apps\nodejs\current\npm.cmd",
    "C:\ProgramData\chocolatey\bin\npm.cmd",
    "$env:LOCALAPPDATA\Programs\nodejs\npm.cmd"
)

$npm = $null
foreach ($c in $candidates) {
    $resolved = Get-Item $c -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($resolved) { $npm = $resolved.FullName; break }
}

if (-not $npm) {
    # Try PATH as last resort
    $cmd = Get-Command npm -ErrorAction SilentlyContinue
    if ($cmd) { $npm = $cmd.Source }
}

if (-not $npm) {
    Write-Host "npm not found. Install Node.js from https://nodejs.org" -ForegroundColor Red
    exit 1
}

Write-Host "Found npm: $npm" -ForegroundColor Green
& $npm publish
