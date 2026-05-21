# Finds git and pushes to origin master
$candidates = @(
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files\Git\bin\git.exe",
    "C:\Program Files (x86)\Git\cmd\git.exe",
    "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe",
    "$env:USERPROFILE\scoop\apps\git\current\bin\git.exe",
    "C:\ProgramData\chocolatey\bin\git.exe",
    # GitHub Desktop bundled git
    "$env:LOCALAPPDATA\GitHubDesktop\app-*\resources\app\git\cmd\git.exe",
    # VS Code bundled git
    "$env:LOCALAPPDATA\Programs\Microsoft VS Code\resources\app\extensions\git\dist\git.exe",
    # Cursor bundled git
    "$env:LOCALAPPDATA\Programs\cursor\resources\app\extensions\git\dist\git.exe"
)

$git = $null
foreach ($c in $candidates) {
    $resolved = Get-Item $c -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($resolved) { $git = $resolved.FullName; break }
}

if (-not $git) {
    $cmd = Get-Command git -ErrorAction SilentlyContinue
    if ($cmd) { $git = $cmd.Source }
}

if (-not $git) {
    Write-Host "Git not found." -ForegroundColor Red
    Write-Host "Install from https://git-scm.com or open Git Bash and run: git push origin master" -ForegroundColor Yellow
    exit 1
}

Write-Host "Found git: $git" -ForegroundColor Green
Set-Location "C:\Users\brano\Projects\m3x"
& $git push origin master
