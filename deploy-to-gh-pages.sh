#!/usr/bin/env bash

# Deploy to gh-pages branch
# This script copies the built WebAssembly files and web UI to the gh-pages branch
# without committing builds/ to the master branch

set -eu

echo "========================================="
echo "Deploying to gh-pages"
echo "========================================="

# Check if builds directory exists
if [ ! -d "builds" ]; then
    echo "Error: builds/ directory not found!"
    echo "Please run ./build-multi.sh first to build the WebAssembly files."
    exit 1
fi

# Check if we're on master/main
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "master" ] && [ "$CURRENT_BRANCH" != "main" ]; then
    echo "Warning: You're on branch '$CURRENT_BRANCH', not 'master' or 'main'"
    read -p "Do you want to continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled."
        exit 1
    fi
fi

# Check if we have uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "Warning: You have uncommitted changes in the current branch."
    read -p "Do you want to continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled."
        exit 1
    fi
fi

# Stash any uncommitted changes
echo "Stashing any uncommitted changes..."
git stash push -m "deploy-to-gh-pages stash"
STASHED=$?

# Checkout gh-pages
echo "Checking out gh-pages branch..."
git checkout gh-pages

# Pull latest from origin
echo "Pulling latest gh-pages..."
git pull origin gh-pages

# Copy web files from master (builds/ persists and is tracked on gh-pages)
echo "Copying web files..."
git checkout $CURRENT_BRANCH -- index.html static/demo.js static/demo.css favicon.ico

# Show status
echo ""
echo "Files to be committed:"
git status --short

echo ""
read -p "Do you want to commit and push these changes to gh-pages? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Commit
    echo "Committing changes..."
    git add index.html static/demo.js static/demo.css favicon.ico builds/

    # Create commit message with version info
    COMMIT_MSG="Deploy multi-version support

- PHP versions: 8.1.33, 8.2.29, 8.3.26, 8.4.13, 8.5.0RC1
- Phan versions: 5.5.1, 5.5.2
- php-ast versions: 1.1.2, 1.1.3
- New modern UI
- User-selectable PHP, Phan, and ast versions"

    git commit -m "$COMMIT_MSG"

    # Push
    echo "Pushing to origin/gh-pages..."
    git push origin gh-pages

    echo ""
    echo "========================================="
    echo "Deployment complete!"
    echo "========================================="
    echo "The site should be updated at https://phan.github.io/demo/ shortly."
    echo "(GitHub Pages may take a few minutes to build and deploy)"
else
    echo "Deployment cancelled. Changes have been staged but not committed."
    echo "You can commit them manually or reset with: git reset --hard"
fi

# Return to original branch
echo ""
echo "Returning to $CURRENT_BRANCH..."
git checkout $CURRENT_BRANCH

# Restore stashed changes if any
if [ $STASHED -eq 0 ]; then
    echo "Restoring stashed changes..."
    git stash pop
fi

echo "Done!"
