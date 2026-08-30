# Migratory Time repository contract

Read `docs/product-model.md`, `capabilities/README.md`, and
`docs/REVIEW_CONTRACT.md` before changing or reviewing the product, MCP
surface, plugin, or capability adapter.

A plain owner request to review, audit, 审核, or 复核 automatically invokes the
complete review contract in read-only mode unless fixes are also requested.
Treat it as the minimum scope, not a ceiling, and finish with `tools-dev
workspace escalations` for shared contracts, installation, or resource risks;
do not ask the owner to supply a separate checklist.

- Use `build-agent-native-utilities` as the owning method for this product.
  Use `build-capability-contracts` only for the canonical Profile, provider
  manifest/adapter, conformance, or a substitution claim.
- Keep the web UI, MCP tools, and plugin on the existing shared time-zone core.
  The human product owns aliases, labels, locale presentation, copy/share, and
  region choices; those fields do not enter the canonical Profile.
- The current time-zone Profile is provider-seeded experimental. One provider
  passing L0/L1 does not prove cross-provider substitution and does not require
  building a second complete time-zone product.
- Reuse Temporal and IANA time-zone data. Preserve explicit repeated/nonexistent
  local-time behavior and never replace it with fixed offsets or model guesses.
- Report development regression, installed Agent flow, browser product flow,
  and owner experience acceptance separately.
- Do not reset existing work or commit, push, deploy, or publish unless the
  owner explicitly asks.
