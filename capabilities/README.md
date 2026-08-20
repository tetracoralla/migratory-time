# Capability provider boundary

This directory is the provider-facing boundary for the neutral Agent Capability Substrate.

- `schemas/` snapshots the provider-neutral canonical profile used by the adapter;
- `provider.json` maps the neutral `convert` operation to the current MCP tool and records canonical and live transport schema digests separately;
- `npm run capability:check` fails if the live transport schema or generated manifest drifts;
- `npm run capability:export` intentionally refreshes the generated manifest after the capability profile or live transport has been reviewed.

The experimental v0.2 profile accepts up to 20 ordered canonical IANA zones worldwide (including `UTC`) and exposes closed `converted`, `ambiguous`, and `nonexistent` result branches with the provider's IANA data version. The adapter translates those canonical requests and semantic results to and from the product's richer aliases, labels, copy text, and share URLs. Those product fields remain outside the profile. The web UI and semantic time-zone core remain product-owned.

This remains a provider-seeded experimental profile. Passing this provider's checks proves L0/L1 conformance for Migratory Time; it does not by itself prove cross-provider substitution.
