# Security Policy: Secret Management

This document outlines the security policies for the Democracy Tools of Georgia (DTG) project regarding the handling of secrets and sensitive information.

## 1. Secret Handling

- **NEVER** commit real secrets (passports, API keys, private keys, etc.) to version control.
- All secrets must be managed via environment variables (`.env`) or a secure secret vault (e.g., HashiCorp Vault).
- Use `.env.example` as a template for local development.

## 2. Leak Response

If a secret is ever accidentally committed to the repository:

1. **Rotate Immediately**: The secret is considered compromised even if the commit is deleted or the history is rewritten. Generate a new value immediately.
2. **Revoke and Audit**: Invalidate the old secret in the relevant service and audit recent activity for unauthorized access.
3. **Clean History**: Use tools like `git filter-repo` or `BFG Repo-Cleaner` to remove the secret from the entire git history before pushing to a clean repository.

## 3. Secure Development Practices

- **Principle of Least Privilege**: Use credentials with the minimum necessary permissions for development and testing.
- **Git Safety**: Ensure `.gitignore` is correctly configured to prevent accidental uploads.
- **Review**: All pull requests must be audited for hardcoded credentials.

## 4. Reporting Vulnerabilities

If you discover a security vulnerability in this project, please report it privately to the maintainers rather than opening a public issue.
