# Migratory Time repository contract

Read `docs/product-model.md` and `capabilities/README.md` before changing the
product, MCP surface, plugin, or capability adapter.

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
