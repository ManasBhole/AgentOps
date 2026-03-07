#!/bin/bash

# GitHub Setup Script for AgentOps

set -e

echo "🚀 AgentOps GitHub Setup"
echo ""

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed. Please install Git first."
    exit 1
fi

# Check if already a git repo
if [ -d .git ]; then
    echo "✅ Git repository already initialized"
else
    echo "📦 Initializing git repository..."
    git init
fi

# Check if remote exists
if git remote get-url origin &> /dev/null; then
    echo "✅ GitHub remote already configured:"
    git remote -v
    read -p "Do you want to update the remote? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter your GitHub repository URL (e.g., https://github.com/username/agentops.git): " REPO_URL
        git remote set-url origin "$REPO_URL"
        echo "✅ Remote updated"
    fi
else
    read -p "Enter your GitHub repository URL (e.g., https://github.com/username/agentops.git): " REPO_URL
    git remote add origin "$REPO_URL"
    echo "✅ Remote added"
fi

# Create initial commit if needed
if [ -z "$(git status --porcelain)" ]; then
    echo "✅ Working directory clean"
else
    echo "📝 Staging all files..."
    git add .
    
    echo "💾 Creating initial commit..."
    git commit -m "Initial commit: AgentOps platform scaffold

- Go SDK with OpenTelemetry integration
- Go backend API with incident engine and orchestration
- React dashboard
- Docker and Kubernetes configs
- CI/CD pipelines"
    
    echo "✅ Initial commit created"
fi

# Check current branch
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "main")

if [ -z "$CURRENT_BRANCH" ]; then
    git checkout -b main
    CURRENT_BRANCH="main"
fi

echo ""
echo "📤 Ready to push to GitHub!"
echo ""
echo "Current branch: $CURRENT_BRANCH"
echo "Remote: $(git remote get-url origin)"
echo ""
read -p "Do you want to push to GitHub now? (y/n) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Pushing to GitHub..."
    git push -u origin "$CURRENT_BRANCH"
    echo ""
    echo "✅ Successfully pushed to GitHub!"
    echo ""
    echo "🔗 Next steps:"
    echo "1. Go to your GitHub repository"
    echo "2. Check the Actions tab to see CI/CD pipelines"
    echo "3. Set up GitHub Secrets for deployment:"
    echo "   - KUBECONFIG_STAGING (base64 encoded)"
    echo "   - KUBECONFIG_PRODUCTION (base64 encoded)"
    echo ""
    echo "📚 Workflows created:"
    echo "   - CI Pipeline: Runs on every push/PR"
    echo "   - CD Pipeline: Deploys on main branch"
    echo "   - Security Scan: Weekly security audits"
    echo "   - Release: Manual release workflow"
else
    echo ""
    echo "📝 To push later, run:"
    echo "   git push -u origin $CURRENT_BRANCH"
fi
