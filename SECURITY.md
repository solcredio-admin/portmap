# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately through GitHub: **Security → Report a vulnerability** on this repository
(https://github.com/solcredio-admin/portmap/security/advisories/new).

Include what you found, how to reproduce it, and the version (image tag or commit). You'll get an acknowledgement within 7 days. Fixes are released as new images, and a GitHub Security Advisory is published once a fix is available.

## Supported versions

Only the latest image (`:latest` and the most recent release tag) receives security fixes.

## Scope notes

- The agent needs elevated access by design (host PID/network namespaces, `SYS_PTRACE`, optionally the Docker socket). That's documented in the README and isn't a vulnerability in itself.
- Expose the dashboard only on a private network or behind HTTPS.
