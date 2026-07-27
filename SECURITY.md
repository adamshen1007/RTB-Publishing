# Security Policy

## Supported Versions

RTB Publishing is currently a pre-release documentation and specification project.
Only the latest version of the `main` branch is maintained.

## Reporting a Vulnerability

Do not report vulnerabilities, exposed credentials, private data, or other
sensitive security issues in a public GitHub issue.

Use GitHub's private vulnerability reporting flow for this repository:

<https://github.com/adamshen1007/RTB-Publishing/security/advisories/new>

Include:

- A concise description of the issue
- The affected file, workflow, dependency, or revision
- Reproduction steps or supporting evidence
- The potential impact
- Any suggested mitigation

Maintainers should acknowledge a valid report as soon as practical, assess its
severity, and coordinate a fix before public disclosure. No specific response
or remediation deadline is guaranteed during the pre-release stage.

## Secrets and Personal Data

- Never commit credentials, tokens, private keys, customer data, or sensitive
  personal information.
- Store local secrets in ignored `.env` files and provide non-secret examples
  through `.env.example` when implementation begins.
- Revoke and rotate a secret immediately if it is accidentally committed; do
  not rely on deleting it from the latest revision.
