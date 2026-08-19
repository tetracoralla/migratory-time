# Capability provider boundary

This directory is the provider-facing boundary for the neutral Agent Capability Substrate.

- `schemas/` snapshots the provider-neutral canonical profile used by the adapter;
- `provider.json` maps the neutral `convert` operation to the current MCP tool and records canonical and live transport schema digests separately;
- `npm run capability:check` fails if the live transport schema or generated manifest drifts;
- `npm run capability:export` intentionally refreshes the generated manifest after the capability profile or live transport has been reviewed.

The adapter translates canonical IANA-zone requests and semantic results to and from the product's richer aliases, labels, copy text, and share URLs. Those product fields remain outside the profile. The web UI and semantic time-zone core remain product-owned.
