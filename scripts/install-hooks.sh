#!/bin/bash
# Install Git Hooks for Security Checks

set -e

HOOKS_DIR=".git/hooks"
PRE_COMMIT_HOOK="$HOOKS_DIR/pre-commit"

echo "🔧 Installing git hooks..."

# Create hooks directory if it doesn't exist
mkdir -p "$HOOKS_DIR"

# Create pre-commit hook
cat > "$PRE_COMMIT_HOOK" <<'EOF'
#!/bin/bash
# Pre-commit security check
# Prevents committing sensitive files and secrets

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo "🔐 Running pre-commit security checks..."

ERRORS=0

# Check 1: .env files (but allow .env.example)
STAGED_ENV_FILES=$(git diff --cached --name-only | grep -E "\.env" | grep -v "\.example$" || true)
if [ -n "$STAGED_ENV_FILES" ]; then
    echo -e "${RED}❌ ERROR: .env files are staged!${NC}"
    echo "Found:"
    echo "$STAGED_ENV_FILES"
    echo ""
    echo "Remove with: git reset HEAD <file>"
    ERRORS=$((ERRORS + 1))
fi

# Check 2: Real secrets in staged content (exclude examples/templates)
STAGED_CONTENT=$(git diff --cached)
# Only check for secrets NOT in .env.example, SECURITY.md, or hook scripts
REAL_SECRETS=$(echo "$STAGED_CONTENT" | grep -E "(ghp_[a-zA-Z0-9]{36}|sk-[a-zA-Z0-9]{48}|sk-ant-[a-zA-Z0-9-]{95})" | grep -v "example\|SECURITY.md\|pre-commit\|security-check.sh\|your_.*_here\|xxxx" || true)
if [ -n "$REAL_SECRETS" ]; then
    echo -e "${RED}❌ ERROR: Real secrets found in staged changes!${NC}"
    echo "Found:"
    echo "$REAL_SECRETS"
    echo ""
    echo "Please review and remove any actual secrets before committing."
    ERRORS=$((ERRORS + 1))
fi

# Check 3: Sensitive files
SENSITIVE_PATTERNS="secrets.json|credentials.json|*.key|*.pem|auth.json|token.json"
if git diff --cached --name-only | grep -qE "$SENSITIVE_PATTERNS"; then
    echo -e "${YELLOW}⚠️  WARNING: Sensitive files are staged!${NC}"
    git diff --cached --name-only | grep -E "$SENSITIVE_PATTERNS"
    echo ""
    echo "Are you sure you want to commit these?"
fi

# Check 4: Large files (potential secrets or binaries)
while IFS= read -r file; do
    SIZE=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
    if [ "$SIZE" -gt 1048576 ]; then  # > 1MB
        echo -e "${YELLOW}⚠️  WARNING: Large file staged: $file ($(($SIZE / 1024))KB)${NC}"
    fi
done < <(git diff --cached --name-only --diff-filter=A)

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo -e "${RED}❌ Pre-commit checks failed! ($ERRORS error(s))${NC}"
    echo "Fix the issues above and try again."
    echo ""
    echo "To bypass this check (NOT recommended):"
    echo "  git commit --no-verify"
    exit 1
fi

echo -e "${GREEN}✅ Pre-commit checks passed!${NC}"
exit 0
EOF

# Make pre-commit hook executable
chmod +x "$PRE_COMMIT_HOOK"

echo "✅ Pre-commit hook installed at: $PRE_COMMIT_HOOK"
echo ""
echo "This hook will:"
echo "  • Prevent committing .env files"
echo "  • Detect secrets (API keys, tokens)"
echo "  • Warn about sensitive files"
echo "  • Check for large files"
echo ""
echo "To bypass (not recommended): git commit --no-verify"
