# ==============================================================================
# Production Release Automation Script for Windows PowerShell
# Merges latest 'main' into 'prod', builds frontend, and pushes to 'origin/prod'
# ==============================================================================

$ErrorActionPreference = "Stop"

Write-Host "`n🚀 Starting Production Release Workflow..." -ForegroundColor Cyan

# 1. Check for uncommitted changes
$status = git status --porcelain
if ($status) {
    Write-Host "❌ Error: Working tree has uncommitted changes." -ForegroundColor Red
    Write-Host "Please commit or stash your changes before releasing:" -ForegroundColor Yellow
    git status -s
    exit 1
}

$currentBranch = (git branch --show-current).Trim()
Write-Host "📍 Current branch: $currentBranch" -ForegroundColor Gray

# Ensure we have the latest commits on main pushed to origin
if ($currentBranch -eq "main") {
    Write-Host "Pushing latest main to origin..." -ForegroundColor Gray
    git push origin main
}

# 2. Checkout prod branch
Write-Host "`n🔀 Switching to 'prod' branch..." -ForegroundColor Cyan
git checkout prod

try {
    # 3. Merge main into prod
    Write-Host "`n🔄 Merging 'main' into 'prod'..." -ForegroundColor Cyan
    git merge main -m "release: sync with main"

    # 4. Build frontend
    Write-Host "`n📦 Building Next.js static frontend (npm run build)..." -ForegroundColor Cyan
    Push-Location frontend
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "npm run build failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }

    # 5. Force-add frontend/out (bypassing .gitignore)
    Write-Host "`n📁 Staging pre-compiled static assets (frontend/out)..." -ForegroundColor Cyan
    git add -A -f frontend/out

    # 6. Commit if there are changes
    $diffCached = git diff --cached --name-only
    if ($diffCached) {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Write-Host "💾 Committing updated build assets..." -ForegroundColor Gray
        git commit -m "deploy: update pre-compiled static frontend ($timestamp)"
    } else {
        Write-Host "ℹ️ No build differences detected." -ForegroundColor Yellow
    }

    # 7. Push to origin/prod
    Write-Host "`n⬆️ Pushing 'prod' branch to GitHub..." -ForegroundColor Cyan
    git push origin prod

    Write-Host "`n✅ SUCCESS: 'prod' branch is updated and pushed!" -ForegroundColor Green
    Write-Host "👉 Ab aap apne EC2 / server par jaakar './deploy.sh' chala sakte hain.`n" -ForegroundColor Yellow

} catch {
    Write-Host "`n❌ Error during release: $_" -ForegroundColor Red
} finally {
    # 8. Always return to main branch
    Write-Host "🔙 Returning to 'main' branch..." -ForegroundColor Gray
    git checkout main
}
