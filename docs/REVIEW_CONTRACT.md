# Migratory Time review contract

This contract defines the evidence required to review Migratory Time across its
shared civil-time core, Web product, MCP/Codex plugin, and experimental
Capability provider. It does not turn one provider, one tzdb snapshot, or a
green local build into cross-provider substitution or deployment acceptance.

Read `product-model.md` and `../capabilities/README.md` first. Re-run current
source and runtime checks; do not inherit the implementation anchor's historical
results, an installed-cache version, or a hosted-page screenshot.

## Authority and carrier seams

- `src/lib/timeConversion.ts`, `temporal.ts`, and
  `src/data/timeZoneRegistry.ts` own civil-time conversion, IANA registry
  resolution, DST gap/repeat handling, minute-precision limits, aliases, and
  localized product metadata.
- `src/lib/agentTimeTools.ts` owns the product Agent result unions, stable
  functional errors, bounded search/list behavior, copy text, and share links.
  `mcp/server.ts` owns the four-tool transport and provenance envelope.
- `src/App.tsx`, components, hooks, preferences, and share modules own the human
  browser flow. Product labels, locale, region search, order, copy text, share
  URLs, and images stay product-owned.
- `capabilities/schemas/`, `provider.json`, and `scripts/runCapabilityAdapter.mjs`
  own the provider-side canonical projection for
  `org.openadam.time-zone.convert@0.2.0`. The central current Profile and Suite
  live in the sibling `capability-contracts` repository; all snapshots must be
  compared with current files, not assumed equal.
- `plugins/migratory-time/` is the installable Codex carrier. The bundled server,
  Skill, metadata, plugin manifest, source version, installed cache, and host
  route are separate drift points.
- `addons/migratory-time-docs/` is a deferred Feishu add-on. It is not part of
  the 2.0 completion, provider conformance, Web deployment, or plugin release
  lanes until the owner explicitly resumes that integration.

## Civil-time semantic invariants

1. **All outputs describe one instant.** A target list is ordered and unique;
   every row is the same `Temporal.Instant` rendered in a canonical IANA zone.
   No row becomes a hidden “base zone,” and no stored fixed offset substitutes
   for date-sensitive IANA rules.
2. **Local time can be valid, repeated, or nonexistent.** A repeated wall time
   returns exactly the earlier and later occurrences when disambiguation is
   `reject`; explicit `earlier`/`later` selects the named occurrence. A DST gap
   returns `nonexistent`; the tool must not silently shift to a nearby instant.
   Test transitions with non-hour offsets as well as common US/EU changes.
3. **Historical precision is honest.** Product editing starts at year 1901.
   If any source or requested target has a sub-minute historical UTC offset,
   return `UNSUPPORTED_PRECISION` rather than round seconds away. Test the
   source zone and every target, including historical boundaries just before
   and after the unsupported interval.
4. **Parsing is strict.** Product MCP `convert_time` accepts exactly
   `YYYY-MM-DD HH:mm`; the canonical Capability uses
   `YYYY-MM-DDTHH:mm`. Invalid calendar dates, leap days, hour/minute overflow,
   missing sign in an explicit offset, years below the boundary, and unknown
   zones return their explicit result/error branch. Never let Temporal's
   default compatible disambiguation or JavaScript `Date` parsing decide.
5. **Aliases never change canonical identity.** Ordinary unambiguous city,
   country-main-zone, localized alias, IANA ID, `UTC`, and signed `UTC/GMT`
   offsets may route directly. Genuine ambiguity returns bounded candidates;
   it does not guess. `Etc/GMT` sign inversion is handled internally and the
   returned canonical ID/offset must match the user's signed meaning.
6. **Runtime context is provenance.** Conversion semantics depend on the
   provider's current IANA rules. MCP returns `Temporal+Intl`, `IANA`, and the
   observed runtime tz data version; the canonical output carries the time-zone
   database context needed to interpret/replay it. A tzdb/runtime dependency
   update requires the same transition corpus before and after.
7. **Current time is intentionally ambient.** `current_times` reads the host
   clock, while an explicit conversion is replayable relative to its request
   and tzdb context. Do not use repeated `current_times` byte equality as a
   determinism assertion or let a moving current-time call enter golden
   conformance.

## Agent surface, errors, and context budget

The public MCP tools are exactly `convert_time`, `current_times`,
`search_time_zones`, and compatibility `list_time_zones`. A known zone/current
request takes one domain call. Search is for explicit exploration or recovery
from an ambiguous/unknown name; list is paginated compatibility, never an
unbounded registry dump.

- Result schemas are strict discriminated unions. `convert_time` has
  `converted`, `ambiguous`, `nonexistent`, and `error`; current/search/list have
  their own closed success plus error branches. Schema-invalid transport input
  is an MCP tool error; valid transport input with a functional problem returns
  a structured domain `status: error` without pretending transport failure.
- Stable product errors include exact code, message, `retryable`, and applicable
  field/input/candidates. Review the **value** of retryability, not merely that
  it is boolean: invalid format, unknown/ambiguous/duplicate zone, empty/too
  many targets, invalid cursor, unsupported year, and fixed precision limits
  cannot succeed when the identical request is retried. Only a genuinely
  transient internal/runtime condition may be retryable.
- Candidate lists, input echo, messages, copy text, share URLs, labels, and text
  summaries are all part of the response budget. Do not test only
  `structuredContent` while ignoring duplicated text content.
- Current functional bounds are 20 ordered target zones, search results at most
  10, list pages at most 50, and total listed tool JSON below 48 KiB. A maximum
  successful call stays below the 64 KiB product response budget. The transport
  schema maximum, implementation guard, docs, Skill examples, capability
  projection, and tests must advertise the same functional target limit rather
  than relying on description prose to correct a looser schema.
- Stable registry order and opaque cursor semantics must survive pagination;
  invalid, stale, negative, oversized, and non-numeric cursors return
  `INVALID_CURSOR` without duplicate/omitted pages or unbounded input echo.

## Capability/Profile seam

The canonical Capability is deliberately smaller than the product:

```text
canonical input: IANA zones + local minute + disambiguation
canonical result: converted | ambiguous | nonexistent + tzdb context
provider adapter: product input/result translation
product-only: aliases, locale labels, search/list, copy text, share URL/image
```

Review all current copies on any change:

1. central Profile/Suite and schema digests in `capability-contracts`;
2. local `capabilities/schemas/*.json` snapshots;
3. `capabilities/provider.json` provider/profile versions, canonical contract
   digests, product transport target and live schema digests;
4. `mcp/server.ts` generated input/output schemas;
5. `runCapabilityAdapter.mjs` request-envelope validation and bidirectional
   mapping;
6. provider-local adapter checks and central conformance cases.

The adapter accepts exact `{id, operationId, input}` JSONL, rejects product
fields and extra envelope/input fields, bounds lines at 64 KiB, returns a strict
success/error envelope, survives malformed lines without corrupting the next
request, and exits cleanly. Exercise overlong/partial/multiple lines, duplicate
keys, unknown IDs/operations, invalid canonical schema, output-schema drift,
stderr noise, timeout, and shutdown.

The current Provider Manifest is v0.3. Product-local export checks compare the
current MCP schema digests, and its executable transport-schema probe lets the
central live-transport runner reacquire the declared `convert_time` binding.
That probe establishes only the observed target and schemas; it does not prove
installed-host availability, Agent routing, semantic correctness, or
substitution. One Migratory Time provider passing L0/L1 proves only experimental
provider conformance, never cross-provider substitution.

## Web product and share-state invariants

- Region preference is an ordered, unique 1–20 item IANA list. Adding/removing,
  reordering, invalid legacy preferences, locale changes, refresh, and storage
  failure must preserve at least one valid region and never rewrite share state.
- Editing one row freezes the instant only on a valid commit. Enter and blur
  share validation; Escape cancels; an invalid or ambiguous value prevents the
  deferred original action until the user corrects/chooses/cancels. Test blur,
  share, region picker, restore-now, and language change while editing.
- A share action freezes one immutable snapshot of instant, ordered zones, and
  display locale for preview/image/link operations. A live page shares the
  clicked instant; later clock ticks cannot make image, copied link, and preview
  disagree. The link stores instant and canonical zones but not language, and
  opening it must not overwrite the recipient's saved zone preference.
- The PNG is 375 logical px at 2x, includes the full dated list and restrained
  credit, and excludes floating page controls. Clipboard, download, Web Share
  cancellation/failure, long names, 20 zones, fonts, and unsupported clipboard
  APIs need visible recovery without duplicate actions.
- System/default language and saved locale are human presentation choices only;
  locale cannot alter instant, canonical IDs, offsets, ambiguity, or the
  Capability result.
- Offline reload, service-worker upgrade, narrow/short/touch layouts, keyboard
  focus, modal escape/return focus, and 320/390/768/wide breakpoints are real
  browser lanes. Unit tests and static CSS assertions are not visual acceptance.

## High-frequency and batch robustness

The product has no batch conversion API. Do not invent one solely for parity
with another tool. Ordinary 1–20-zone conversion should remain one call, and a
persistent MCP session should not accumulate formatters, listeners, Temporal
instances, or response buffers without bound.

For changes affecting the registry, Temporal/tzdb, conversion, search, schema,
or response construction, run the same before/after corpus on one machine:
minimum/typical/20-zone conversions; valid/repeated/nonexistent/historical
inputs; 1/10-result search; every list page; 1,000 warm conversions; and an
8-way mixed burst. Record throughput, p50/p95/p99, startup, heap/RSS trend,
output bytes, error rate, and exact-result parity. A faster median does not
offset wrong DST branches, tail spikes, context growth, or a registry/schema
drift.

If batch is later requested, define item count, total zones/bytes/time, shared
clock/tzdb snapshot, ordering, per-item error, cancellation, and partial failure
before implementation. Do not multiply the single-call 20-zone limit without a
new cumulative contract.

## Rerunnable evidence and lane reporting

Development and provider regression:

```sh
npm run check
```

This covers unit/integration tests, Web/type builds, bundle checks, MCP type and
real stdio runtime, local Capability snapshots/digests, and the canonical
adapter probe. It does not prove an installed host route or hosted deployment.

Additional lanes are intentionally separate:

```sh
npm run check:codex-plugin
npm run check:deployments
```

- `check:codex-plugin` is meaningful only when it runs a fresh host task against
  the intended currently installed plugin/cache and records the actual tool
  route; source packaging alone is development evidence.
- `check:deployments` compares current generated artifacts with hosted Pages and
  plugin distribution. A known old deployment is a real FAIL/pending release,
  not an excuse to call source release-ready. Push/deploy remains owner-authorized.

Report `PASS / FAIL / BLOCKED` separately for development regression, provider
canonical conformance, live transport binding, installed Agent flow, browser
runtime, deployment/source/plugin distribution, and owner experience. Include
the exact Node/Temporal/tzdb version and zone transition corpus for semantic
claims. UI usefulness and visual quality remain `OK / Not OK / Pending` from
the owner; no technical aggregate replaces them.
