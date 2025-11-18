# Security Policy & Guidelines

## 🔐 Security Overview

This plugin routes prompts to locally installed CLIs (`codex` and `gemini`) using **account-based authentication**. The plugin itself does **not store, manage, or require API keys**.

### Key Security Features

✅ **No API Key Storage**: All authentication is handled by the CLI tools themselves
✅ **Account-Based Auth**: Uses your existing CLI sessions (codex login, gemini login)
✅ **No Secrets in Code**: Plugin code contains no hardcoded credentials
✅ **Secure by Design**: Zero-trust architecture for credential management

---

## 🚨 Critical Security Rules

### ❌ NEVER Do This

1. **Never commit .env files**
   ```bash
   # Always in .gitignore
   .env
   .env.*
   *.env
   ```

2. **Never embed tokens in git remote URLs**
   ```bash
   # ❌ WRONG
   git remote add origin https://ghp_token@github.com/user/repo.git

   # ✅ CORRECT
   git remote add origin https://github.com/user/repo.git
   ```

3. **Never hardcode API keys in code**
   ```javascript
   // ❌ WRONG
   const API_KEY = "sk-abc123...";

   // ✅ CORRECT
   const API_KEY = process.env.OPENAI_API_KEY;
   ```

4. **Never commit credentials to git history**
   - Even if deleted in later commits, they remain in git history!
   - Use `git-filter-repo` to clean history if this happens

### ✅ Always Do This

1. **Use environment variables for all secrets**
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   # .env is in .gitignore by default
   ```

2. **Authenticate CLIs properly**
   ```bash
   # Codex
   codex login

   # Gemini
   gemini login  # or equivalent for your Gemini CLI
   ```

3. **Run security checks regularly**
   ```bash
   bash scripts/security-check.sh
   ```

4. **Review .gitignore before commits**
   ```bash
   cat .gitignore | grep -E "env|secret|key|token"
   ```

---

## 🛡️ Authentication & Credential Management

### How Authentication Works

This plugin uses a **pass-through authentication model**:

1. **You authenticate** with the CLI tools directly:
   ```bash
   codex login      # OpenAI/Codex
   gemini login     # Google Gemini
   ```

2. **CLI stores session** locally (in their own secure storage)

3. **Plugin invokes CLI** which uses the stored session

4. **No credentials** are ever passed through or stored by this plugin

### CLI Authentication Locations

- **Codex**: `~/.config/codex/` (or similar, managed by @openai/codex)
- **Gemini**: `~/.config/gemini/` (or similar, managed by gemini CLI)

**⚠️ Important**: These CLI session files are sensitive! Keep them secure.

---

## 📋 Pre-Commit Security Checklist

Before every commit, verify:

- [ ] No `.env` files are staged: `git status | grep .env`
- [ ] No secrets in code: `bash scripts/security-check.sh`
- [ ] No tokens in remote URLs: `git remote -v`
- [ ] .gitignore is up to date
- [ ] All sensitive files are in .gitignore

### Automated Pre-Commit Hook

Add this to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
echo "🔐 Running security checks..."

# Check for .env files
if git diff --cached --name-only | grep -E "\.env$|\.env\."; then
    echo "❌ ERROR: .env files are staged!"
    echo "Remove with: git reset HEAD .env"
    exit 1
fi

# Check for common secret patterns
if git diff --cached | grep -E "(ghp_|sk-|AKIA|AIza)"; then
    echo "❌ ERROR: Potential secrets found in staged changes!"
    echo "Review your changes and remove any secrets."
    exit 1
fi

echo "✅ Security checks passed"
exit 0
```

Make it executable:
```bash
chmod +x .git/hooks/pre-commit
```

---

## 🚨 What To Do If You Exposed a Secret

### 1. Immediate Actions

**If token is still valid:**
```bash
# 1. ROTATE the credential immediately
#    - GitHub: https://github.com/settings/tokens
#    - OpenAI: https://platform.openai.com/api-keys
#    - Gemini: https://aistudio.google.com/app/apikey

# 2. Remove from git remote URL
git remote set-url origin https://github.com/USER/REPO.git

# 3. Verify it's gone
git remote -v
```

**If committed to git history:**
```bash
# Install git-filter-repo
pip install git-filter-repo

# Remove all .env files from history
git filter-repo --path .env --invert-paths

# Remove specific patterns (e.g., API keys)
git filter-repo --replace-text <(echo "ghp_xxxx==>REDACTED")

# Force push (⚠️ destructive!)
git push --force --all origin
```

### 2. Verify Clean-Up

```bash
# Check recent commits
git log --all -p | grep -E "(ghp_|sk-|password|token)"

# Check current files
grep -rE "(ghp_|sk-|password)" . --exclude-dir=.git

# Run full security scan
bash scripts/security-check.sh
```

### 3. Documentation

Document the incident:
- Date of exposure
- What was exposed
- Actions taken
- New credentials created

---

## 🔍 Security Scanning Tools

### Built-in Security Check

```bash
bash scripts/security-check.sh
```

This checks for:
- Exposed secrets in files
- .env files not in .gitignore
- Tokens in git remote URLs
- Hardcoded credentials
- Staged sensitive files
- Secrets in git history

### GitHub Actions Security Workflow

The repository includes a security workflow (`.github/workflows/validate.yml`) that:
- Scans for secrets on every push
- Validates .gitignore completeness
- Checks for exposed credentials
- Fails the build if issues are found

### Third-Party Tools

Consider using:
- **TruffleHog**: `truffleHog --regex --entropy=False .`
- **GitGuardian**: https://www.gitguardian.com/
- **GitHub Secret Scanning**: Enable in repo settings
- **Gitleaks**: `gitleaks detect --source .`

---

## 📚 Best Practices

### Development Workflow

1. **Start clean**
   ```bash
   git clone <repo>
   cp .env.example .env
   # Edit .env with your values (never commit!)
   ```

2. **Before every commit**
   ```bash
   bash scripts/security-check.sh
   git status | grep .env  # Should be empty
   ```

3. **Before every push**
   ```bash
   git log -p | grep -E "(password|token|key)" | head -20
   ```

### .gitignore Patterns

Essential patterns in `.gitignore`:

```gitignore
# Environment
.env
.env.*
*.env

# Secrets
secrets.json
credentials.json
auth.json
token.json

# Keys
*.key
*.pem
*.p12
*.pfx
*_key
*_token
*_secret
```

### Environment Variables

Always use environment variables for sensitive data:

```bash
# .env (never committed)
GITHUB_TOKEN=ghp_actual_token_here
OPENAI_API_KEY=sk-actual_key_here

# .env.example (committed, safe)
GITHUB_TOKEN=ghp_your_token_here
OPENAI_API_KEY=sk-your_key_here
```

---

## 🔐 GitHub Secrets Management

### For GitHub Actions

Set secrets in repository settings:

1. Go to: `Settings` → `Secrets and variables` → `Actions`
2. Click `New repository secret`
3. Add each secret:
   - `GITHUB_TOKEN` (for releases, PR comments)
   - `NPM_TOKEN` (if publishing to npm)

### Usage in Workflows

```yaml
steps:
  - name: Use secret
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    run: |
      echo "Token is available but not exposed"
```

**Never echo or print secrets in workflows!**

---

## ⚠️ Common Security Mistakes

### Mistake 1: Committing .env Files

```bash
# ❌ WRONG
git add .env
git commit -m "Add environment config"

# ✅ CORRECT
# .env is in .gitignore, never staged
git add .env.example  # Only commit the template
```

### Mistake 2: Token in Remote URL

```bash
# ❌ WRONG
git clone https://ghp_token@github.com/user/repo.git

# ✅ CORRECT
git clone https://github.com/user/repo.git
# Then configure credentials via:
git config credential.helper store
# Or use SSH keys
```

### Mistake 3: Secrets in Code Comments

```javascript
// ❌ WRONG
// TODO: Use token ghp_abc123 for testing

// ✅ CORRECT
// TODO: Use token from environment variable GITHUB_TOKEN
```

### Mistake 4: Partial Redaction

```javascript
// ❌ STILL WRONG
const token = "ghp_abc123...xyz";  // Redacted

// ✅ CORRECT
const token = process.env.GITHUB_TOKEN;
```

---

## 📞 Reporting Security Issues

If you discover a security vulnerability:

1. **Do NOT open a public issue**
2. **Email**: [Your security contact email]
3. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within 48 hours and work with you to resolve the issue.

---

## 🔄 Security Update Policy

- Security patches are released immediately
- All users are notified via GitHub Security Advisory
- Critical vulnerabilities are disclosed after patch is available
- Update to latest version regularly: `git pull origin main`

---

## ✅ Security Compliance Checklist

For production use, ensure:

- [ ] All secrets in environment variables or secure vaults
- [ ] .gitignore contains all sensitive file patterns
- [ ] Pre-commit hooks enabled and tested
- [ ] Security scanning in CI/CD pipeline
- [ ] No secrets in git history (verified)
- [ ] GitHub Secret Scanning enabled
- [ ] Dependabot alerts enabled
- [ ] Regular security audits scheduled
- [ ] Team trained on security best practices
- [ ] Incident response plan documented

---

## 📚 Additional Resources

- [GitHub Token Security](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github)
- [OpenAI API Key Best Practices](https://platform.openai.com/docs/guides/safety-best-practices)
- [Git Filter Repo](https://github.com/newren/git-filter-repo)
- [TruffleHog](https://github.com/trufflesecurity/trufflehog)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

---

**Last Updated**: 2025-11-17
**Version**: 1.0
**Maintained By**: Ralle1976
**Contact**: [GitHub Issues](https://github.com/Ralle1976/multi-provider-cli-chat-plugin/issues)
