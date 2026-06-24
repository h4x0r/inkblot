# Security Policy

## Reporting a vulnerability

Please report security issues privately via GitHub Security Advisories
(**Security → Report a vulnerability**) on this repository, or by email to
albert@securityronin.com. Please do not open a public issue for security reports.

We aim to acknowledge within 72 hours.

## Hardening notes

- **`/api/render` is a public endpoint** and feeds JSON into matplotlib. The
  renderer range-checks every size field before allocating (`MAX_REPOS`,
  `MAX_HOURS`, a `repos*hours` `MAX_POINTS` ceiling) and rejects malformed
  counts; the handler caps the request body at 16 MB. See `api/_inkblot.py`.
- **No data at rest.** GitHub Activity Plotter reads commit metadata (repo + timestamp) and
  renders on the fly. There is no database; the GitHub OAuth token lives only in
  the encrypted session cookie.
- **Scopes.** The GitHub OAuth grant requests `read:user` and `repo` (the latter
  so private-repo activity can be counted). The token is never logged.
- **CI gates** every PR: ESLint (strict), `tsc`, Vitest + property fuzzing,
  Ruff, Pytest + Hypothesis fuzzing, `next build`, gitleaks, and a dependency
  audit. Renovate keeps dependencies current.
