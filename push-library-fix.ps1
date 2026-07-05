# Commits and pushes the library permission fix (3 files only), then deploys via Vercel.
# Reuses the git-discovery logic from push.ps1.

$candidates = @(
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files\Git\bin\git.exe",
    "C:\Program Files (x86)\Git\cmd\git.exe",
    "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe",
    "$env:USERPROFILE\scoop\apps\git\current\bin\git.exe",
    "C:\ProgramData\chocolatey\bin\git.exe",
    "$env:LOCALAPPDATA\GitHubDesktop\app-*\resources\app\git\cmd\git.exe",
    "$env:LOCALAPPDATA\Programs\Microsoft VS Code\resources\app\extensions\git\dist\git.exe",
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
    Write-Host "Git not found. Install from https://git-scm.com" -ForegroundColor Red
    exit 1
}

Write-Host "Found git: $git" -ForegroundColor Green
Set-Location "C:\Users\brano\Projects\m3x"

# Stage ONLY the three files of this fix
& $git add "app/api/library/card/[urn]/route.ts" "app/library/[urn]/page.tsx" "supabase/migrations/20260703000003_library_rpc_security.sql"

# Show what will be committed
Write-Host "`n--- Files staged for commit: ---" -ForegroundColor Cyan
& $git diff --cached --stat

$confirm = Read-Host "`nCommit and push these? (y/n)"
if ($confirm -ne 'y') {
    Write-Host "Aborted. Nothing pushed." -ForegroundColor Yellow
    exit 0
}

& $git commit -m "fix: library reads via SECURITY DEFINER RPCs - card page + API use library_get_card; migration #3"
& $git push origin master

Write-Host "`nPushed. Vercel is deploying now (~2 min). Then check https://m3x.space/library" -ForegroundColor Green
Read-Host "Press Enter to close"
