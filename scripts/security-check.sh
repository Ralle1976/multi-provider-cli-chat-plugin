#!/bin/bash
# Security Check Script - Multi-Provider CLI Chat Plugin
# Scannt nach exponierten Secrets, API-Keys und Credentials

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "🔐 Security Check - Multi-Provider Plugin"
echo "=========================================="
echo ""

ISSUES_FOUND=0

# 1. Check for common secret patterns in files
echo "📁 Scanning files for secrets..."
echo "---------------------------------"

SECRET_PATTERNS=(
    "ghp_[a-zA-Z0-9]{36}"  # GitHub Personal Access Token
    "sk-[a-zA-Z0-9]{48}"   # OpenAI API Key
    "AIza[0-9A-Za-z_-]{35}" # Google API Key
    "AKIA[0-9A-Z]{16}"     # AWS Access Key
    "sk-ant-[a-zA-Z0-9-]{95}" # Anthropic Claude API Key
)

for pattern in "${SECRET_PATTERNS[@]}"; do
    if grep -rE "$pattern" . --exclude-dir=.git --exclude-dir=node_modules --exclude="*.log" --exclude="security-check.sh" 2>/dev/null; then
        echo -e "${RED}❌ FOUND: Pattern '$pattern'${NC}"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
done

# 2. Check for .env files
echo ""
echo "🔍 Checking for .env files..."
echo "----------------------------"

ENV_FILES=$(find . -name ".env*" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -name ".env.example" 2>/dev/null)
if [ -n "$ENV_FILES" ]; then
    echo -e "${YELLOW}⚠️  Found .env files:${NC}"
    echo "$ENV_FILES"
    echo ""
    echo "These files should be in .gitignore!"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    echo -e "${GREEN}✅ No .env files found (except .env.example)${NC}"
fi

# 3. Check git remote URLs for embedded tokens
echo ""
echo "🌐 Checking git remote URLs..."
echo "-----------------------------"

REMOTE_URLS=$(git remote -v 2>/dev/null | grep -E "(fetch|push)" | awk '{print $2}')
if echo "$REMOTE_URLS" | grep -qE "(ghp_|sk-|token|password)"; then
    echo -e "${RED}❌ CRITICAL: Token found in remote URL!${NC}"
    echo "Current remotes:"
    git remote -v
    echo ""
    echo "Fix with:"
    echo "  git remote set-url origin https://github.com/USER/REPO.git"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    echo -e "${GREEN}✅ Git remote URLs are clean${NC}"
fi

# 4. Check for hardcoded credentials in code
echo ""
echo "💻 Scanning code for hardcoded credentials..."
echo "----------------------------------------------"

CRED_PATTERNS=(
    "password\s*=\s*['\"][^'\"]{8,}"
    "api_key\s*=\s*['\"][^'\"]{10,}"
    "token\s*=\s*['\"][^'\"]{20,}"
    "secret\s*=\s*['\"][^'\"]{10,}"
)

for pattern in "${CRED_PATTERNS[@]}"; do
    MATCHES=$(grep -rE "$pattern" commands/ .claude-plugin/ --exclude="*.log" 2>/dev/null || true)
    if [ -n "$MATCHES" ]; then
        echo -e "${RED}❌ FOUND: Potential hardcoded credential${NC}"
        echo "$MATCHES"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
done

if [ $ISSUES_FOUND -eq 0 ]; then
    echo -e "${GREEN}✅ No hardcoded credentials found${NC}"
fi

# 5. Check .gitignore completeness
echo ""
echo "📋 Checking .gitignore completeness..."
echo "--------------------------------------"

REQUIRED_IGNORES=(
    ".env"
    "*.env"
    "secrets.json"
    "credentials.json"
    "*.key"
    "*.pem"
)

MISSING_IGNORES=0
for ignore in "${REQUIRED_IGNORES[@]}"; do
    if ! grep -q "$ignore" .gitignore 2>/dev/null; then
        echo -e "${YELLOW}⚠️  Missing in .gitignore: $ignore${NC}"
        MISSING_IGNORES=$((MISSING_IGNORES + 1))
    fi
done

if [ $MISSING_IGNORES -eq 0 ]; then
    echo -e "${GREEN}✅ .gitignore is complete${NC}"
else
    echo -e "${YELLOW}⚠️  $MISSING_IGNORES patterns should be added to .gitignore${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# 6. Check for sensitive files staged in git
echo ""
echo "📦 Checking git staging area..."
echo "-------------------------------"

STAGED_SENSITIVE=$(git diff --cached --name-only | grep -E "\.env|secrets|credentials|\.key|\.pem" || true)
if [ -n "$STAGED_SENSITIVE" ]; then
    echo -e "${RED}❌ CRITICAL: Sensitive files are staged!${NC}"
    echo "$STAGED_SENSITIVE"
    echo ""
    echo "Remove with:"
    echo "  git reset HEAD <file>"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    echo -e "${GREEN}✅ No sensitive files staged${NC}"
fi

# 7. Check git history for leaked secrets (last 10 commits)
echo ""
echo "📜 Checking recent git history..."
echo "--------------------------------"

HISTORY_LEAKS=$(git log --all -10 --pretty=format:"%H %s" -p | grep -E "(ghp_|sk-|password|token)" --color=never || true)
if [ -n "$HISTORY_LEAKS" ]; then
    echo -e "${YELLOW}⚠️  Potential secrets found in git history${NC}"
    echo "Consider using git-filter-repo to clean history"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    echo -e "${GREEN}✅ No obvious secrets in recent history${NC}"
fi

# Summary
echo ""
echo "=========================================="
echo "📊 Security Check Summary"
echo "=========================================="

if [ $ISSUES_FOUND -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! No security issues found.${NC}"
    exit 0
else
    echo -e "${RED}❌ Found $ISSUES_FOUND security issue(s)!${NC}"
    echo ""
    echo "🛠️  Recommended actions:"
    echo "  1. Review all flagged items above"
    echo "  2. Remove any exposed secrets immediately"
    echo "  3. Rotate compromised credentials"
    echo "  4. Update .gitignore if needed"
    echo "  5. Clean git history with git-filter-repo if necessary"
    echo ""
    echo "📚 See SECURITY.md for detailed guidance"
    exit 1
fi
