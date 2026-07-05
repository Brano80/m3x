# Compact-row library list: builds locally first, then commits + pushes only if the build passes.

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
if (-not $git) { $cmd = Get-Command git -ErrorAction SilentlyContinue; if ($cmd) { $git = $cmd.Source } }
if (-not $git) { Write-Host "Git not found." -ForegroundColor Red; exit 1 }

Set-Location "C:\Users\brano\Projects\m3x"

Write-Host "Step 1/3: local build (quality gate)..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nBUILD FAILED - nothing was committed or pushed. Tell Claude." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}

Write-Host "`nStep 2/3: staging the 4 files..." -ForegroundColor Cyan
& $git add "app/library/LibraryClient.tsx" "app/library/page.module.css" "app/library/[urn]/page.tsx" "app/api/library/list/route.ts"
& $git diff --cached --stat

$confirm = Read-Host "`nStep 3/3: commit and push these? (y/n)"
if ($confirm -ne 'y') { Write-Host "Aborted." -ForegroundColor Yellow; exit 0 }

& $git commit -m "feat: compact-row library list - inline expand, pagination via /api/library/list, tool badge copy fix"
& $git push origin master

Write-Host "`nPushed. Vercel deploying (~2 min) -> https://m3x.space/library" -ForegroundColor Green
Read-Host "Press Enter to close"
