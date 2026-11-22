#!/usr/bin/env bash
# ==============================================================================
# Production Release Automation Script (Bash / Git Bash / Linux / macOS)
# Merges latest 'main' into 'prod', builds frontend, and pushes to 'origin/prod'
# ==============================================================================
set -e

echo ""
echo "========================================================"
echo "🚀 Starting Production Release Workflow..."
echo "========================================================"

# 1. Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "❌ Error: Working tree has uncommitted changes."
    echo "Please commit or stash your changes before releasing:"
    git status -s
    exit 1
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "📍 Current branch: $CURRENT_BRANCH"

# Ensure return to current branch on exit/error
trap 'echo "🔙 Returning to $CURRENT_BRANCH branch..."; git checkout "$CURRENT_BRANCH" 2>/dev/null || true' EXIT

# Push latest main if we are on main
if [ "$CURRENT_BRANCH" = "main" ]; then
    echo "Pushing latest main to origin..."
    git push origin main
fi

# 2. Checkout prod branch
echo ""
echo "🔀 Switching to 'prod' branch..."
git checkout prod

# 3. Merge main into prod
echo ""
echo "🔄 Merging 'main' into 'prod'..."
git merge main -m "release: sync with main"

# 4. Build frontend
echo ""
echo "📦 Building Next.js static frontend (npm run build)..."
cd frontend
npm run build
cd ..

# 5. Force-add frontend/out (bypassing .gitignore)
echo ""
echo "📁 Staging pre-compiled static assets (frontend/out)..."
git add -A -f frontend/out

# 6. Commit if changes exist
if [ -n "$(git diff --cached --name-only)" ]; then
    TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
    echo "💾 Committing updated build assets..."
    git commit -m "deploy: update pre-compiled static frontend ($TIMESTAMP)"
else
    echo "ℹ️ No build differences detected."
fi

# 7. Push to origin/prod
echo ""
echo "⬆️ Pushing 'prod' branch to GitHub..."
git push origin prod

echo ""
echo "========================================================"
echo "✅ SUCCESS: 'prod' branch is updated and pushed!"
echo "👉 Ab aap apne EC2 / server par jaakar './deploy.sh' chala sakte hain."
echo "========================================================"
echo ""
