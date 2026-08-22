# Security policy

## Supported version

Security fixes target the latest release on the `main` branch.

## Report a vulnerability

Use GitHub's private vulnerability reporting for this repository rather than
opening a public issue. Include the affected version, a minimal reproduction,
the expected impact, and any known workaround.

Do not include credentials, production data, or third-party personal
information in a public issue. Ordinary bugs and feature requests can use
GitHub Issues.

## Security boundary

Migratory Time performs deterministic civil-time conversion using Temporal and
IANA time-zone data. Its MCP tools are read-only and accept inline values only;
they have no filesystem, network, credential, or external mutation authority.
Callers remain responsible for how converted times are used in external
messages, calendars, travel, or operational workflows.
