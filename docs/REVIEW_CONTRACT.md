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
- `src/lib/agentTimeTools.ts` owns the conversion/search Agent result unions,
  stable functional errors, bounded search/list behavior, copy text, and share
  links. `src/lib/timePlan.ts`, `timePlanTypes.ts`, and
  `timePlanValidation.ts` own product TimePlan resolution, dependencies, and
  revalidation. `src/lib/schedule.ts` and `scheduleTypes.ts` own bounded
  recurrence expansion and its explicit policy effects;
  `schedulePlanValidation.ts`, `businessDeadlineValidation.ts`, and
  `availabilityPlanValidation.ts` own current-dependency replay and drift
  classification for the three richer plan types.
  `src/lib/businessDeadline.ts`, `businessCalendarValidation.ts`, and
  `businessCalendarTypes.ts` own caller-supplied business-calendar validation
  and deadline calculation. `src/lib/availabilitySolver.ts`,
  `availabilityValidation.ts`, and `exactIntervalMath.ts` own bounded interval
  solving and deterministic preference ranking. `mcp/server.ts`, the domain
  schema modules, and `mcp/schemaResources.ts` own the nine-tool transport,
  runtime-closed schemas, on-demand result resources, and provenance envelope.
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
`resolve_time`, `validate_time_plan`, `expand_schedule`, `search_time_zones`,
`compute_deadline`, `find_time_windows`, and compatibility `list_time_zones`.
A known zone/current request, explicit plan resolution, bounded schedule
expansion, complete business-calendar deadline, or complete availability
snapshot takes one domain call. Search is for explicit exploration or recovery
from an ambiguous/unknown name; list is paginated compatibility, never an
unbounded registry dump. Validation accepts the prior plan directly and
performs no downstream mutation; business-deadline and availability plans also
require the current complete same-id calendar or snapshot.

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
- Invocation schemas remain always-discovered. Large semantic result schemas
  are parsed on every call and published as five static
  `migratory-time://schemas/<tool>/result.json` resources; verify the resources
  are closed, current, individually readable, and each below 64 KiB. Reused
  definitions may be emitted through local `$ref` values. Omitting them from tool
  discovery is a context optimization, not permission to skip result
  validation or typed branches.
- Current functional bounds are 20 ordered target zones, search results at most
  10, list pages at most 50, and total listed tool JSON below 48 KiB. A maximum
  successful call stays below the 64 KiB product response budget. The transport
  schema maximum, implementation guard, docs, Skill examples, capability
  projection, and tests must advertise the same functional target limit rather
  than relying on description prose to correct a looser schema.
- Stable registry order and opaque cursor semantics must survive pagination;
  invalid, stale, negative, oversized, and non-numeric cursors return
  `INVALID_CURSOR` without duplicate/omitted pages or unbounded input echo.

## TimePlan semantic invariants

1. **Intent and resolution remain separate.** `fixed_instant` preserves one
   canonical exact instant and has no tzdb dependency. `fixed_wall_time`
   preserves a canonical local ISO minute plus IANA zone and records its
   resolved instant/offset separately.
2. **A wall-time choice is explicit.** Repeated input with `reject` returns
   exactly earlier/later candidate plans; a selected plan records the selected
   policy. Nonexistent time is not shifted. Missing intent returns only the
   named missing fields and never a guessed plan.
3. **Dependencies are descriptive, not authority.** A stored tzdb version says
   what produced the old resolution. Revalidation must recompute from intent
   with the current core rather than trusting stored resolution or dependency
   values.
4. **Version changes and semantic changes are different.** If tzdb version
   changes while instant/offset remain equal, validation is `unchanged` with a
   dependency change. Changed instant/offset or a newly repeated/nonexistent
   local time is `drifted`. Unsupported schema versions are `unverifiable`.
5. **Plans do not execute.** Resolution and validation are read-only,
   idempotent calculations. They never create or edit calendar events,
   schedules, messages, jobs, or other downstream state, and cannot authorize
   such a side effect.
6. **v0.1 is product-owned.** It does not extend the neutral time-zone
   Capability Profile. Do not claim cross-provider substitution or add a
   canonical Profile until the central contract and another current consumer
   justify it.

## Schedule expansion invariants

1. **The grammar is deliberately closed.** Accept only the typed daily,
   weekly, and monthly rules. Do not accept natural language, unrestricted
   RRULE strings, executable callbacks, or provider-specific recurrence blobs.
2. **Every expansion is bounded.** A local-date window is required and spans
   at most 3,660 days; a page contains at most 32 instances; additional and
   excluded local date-times contain at most 64 values in total. Pagination
   resumes strictly after its exact local-time cursor. A malformed cursor
   returns the declared `INVALID_CURSOR` branch rather than a generic format
   error.
3. **Exceptional dates never use an implicit policy.** Gap, overlap, and
   month-overflow behavior default to `reject`. Skip, shift, constrain, or both
   are caller-selected policies and their effects remain visible in the result.
4. **Each occurrence resolves through TimePlan.** Every returned plan is a
   fixed-wall-time TimePlan. Scheduled and effective local values remain
   separate after a shift or constraint; overlap `both` returns two ordered
   plans for the same scheduled occurrence.
5. **Expansion has no execution authority.** It does not store schedules,
   observe Free/Busy state, create calendar events, wait until an instant, or
   trigger downstream work.
6. **A successful page is replayable.** The schedule-plan schema records a
   canonical, fully defaulted page request and one tzdb dependency. Validation
   reruns that page; a version-only change is not semantic drift, while changed
   instances/effects or a new conflict is.

## Business-calendar and deadline invariants

1. **Calendar facts remain caller-owned.** Every calculation receives one
   complete, versioned JSON definition. No holiday, workweek, closure, early
   close, or overnight shift is inferred from locale, country, model knowledge,
   or a hidden registry.
2. **Intervals are local and explicit.** Weekly hours and date exceptions use
   strict local minutes; an exception fully replaces its date. Overnight work
   requires `endDayOffset: 1`. Duplicate dates, overlap, invalid ranges, and
   more than 128 total intervals are functional errors.
3. **Boundary policy never hides DST.** Gap and overlap behavior defaults to
   `reject`. Shifted boundary values and counts remain visible. A start outside
   business time also rejects by default and reports the next open; only an
   explicit `next_open` policy moves it.
4. **Business duration is exact elapsed time.** One business minute is sixty
   elapsed seconds inside a resolved open interval. It is not a wall-minute
   count across a clock change and is distinct from calendar days or ordinary
   exact duration outside business hours.
5. **The result is a calculation record, not provider truth.** Record calendar
   id/version, normalized-definition fingerprint, tzdb version, start policy,
   exact deadline, local view, and bounded scan counts. The fingerprint detects
   changed operational content after normalization but excludes provider id and
   declared version, which remain separate dependency metadata. It cannot
   authenticate the calendar or prove the policy remains valid.
6. **Work is finite and read-only.** Duration is at most 525,600 business
   minutes and scanning stops after 3,660 source dates. Calculation does not
   store calendars, observe Free/Busy, create tasks/events, wait, or execute.

## Availability solver invariants

1. **All hard facts are caller-supplied exact intervals.** Each participant
   supplies availability and optional busy intervals; preferred intervals are
   soft ranking data only. No work hours, locale assumptions, Free/Busy fetch,
   contact lookup, or room data is inferred.
2. **Interval algebra is exact and deterministic.** Merge overlap/adjacency,
   clip to the exact search interval, subtract busy time, then intersect all
   participants. Candidate starts align to the explicit step grid anchored at
   `search.start`; duration is exact elapsed minutes. Participants are an
   unordered set keyed by unique id and are normalized into id order before
   solving and rendering; input permutation cannot change candidates,
   dependency fingerprints, local-view order, or conflict-core selection.
3. **Preference ranking is inspectable.** Rank by the count of participants
   whose full candidate lies inside a preferred interval, then by earlier
   instant. Return the numerator, denominator, matching/non-matching ids, and
   local views. Do not introduce model scoring, hidden weights, or taste.
4. **No-solution output is precise.** Distinguish empty common availability,
   insufficient continuous duration, and grid exclusion. Return a
   deterministic irreducible participant set, and do not describe it as the
   globally smallest core.
5. **Bounds are cumulative.** At most 12 participants, 512 total intervals, 31
   exact search days, 10 returned candidates, and a minimum five-minute step.
   Maximum response remains below 64 KiB including local views and text.
6. **Snapshots are dependencies, not truth.** Record snapshot id/version,
   normalized content fingerprint, zones, and tzdb version. The fingerprint
   excludes snapshot id/version so metadata-only changes remain distinguishable
   from participant-fact changes. The solver cannot verify upstream freshness,
   reserve the chosen interval, create events, or execute.

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
substitution. The current central suite declares L0 for Migratory Time; its
separate Python `zoneinfo` differential witness is a bounded drift observation,
not L1/L3 conformance or cross-provider substitution.

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

For changes affecting the registry, Temporal/tzdb, conversion, TimePlan,
search, schema, or response construction, run the same before/after corpus on
one machine: minimum/typical/20-zone conversions;
valid/repeated/nonexistent/historical inputs; TimePlan
resolve/revalidate unchanged/drifted/version cases; recurrence gap/overlap,
month-overflow, override, pagination, and maximum-page cases; 1/10-result
search; every list page; business-calendar ordinary, exception, overnight,
outside-start, DST-boundary, closed-calendar, and maximum-bound cases; 1,000
warm conversions or plan resolutions as affected; availability intersection,
busy subtraction, preference order, no-solution cores, alignment, 12-person
maximum output, and an 8-way mixed burst. Record throughput, p50/p95/p99,
startup, heap/RSS trend, output bytes, error rate, and exact-result parity. A
faster median does not offset wrong DST branches, tail spikes, context growth,
or a registry/schema drift.

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
real stdio runtime, local Capability snapshots/digests, the canonical adapter
probe, twelve fresh MCP processes whose first domain call is `current_times`,
and a relocated standalone-plugin package launch with the exact tool and
schema-resource inventory. The fresh-process check isolates plugin-server
startup from Agent selection and installed-host activation; it does not prove
an installed host route or hosted deployment.

Additional lanes are intentionally separate:

```sh
npm run check:source-agent
npm run check:codex-plugin
npm run check:deployments
```

- `check:source-agent` runs fresh Codex tasks against the source MCP transport.
  It checks Agent selection and one-call routing without reading or replacing
  the installed plugin, so it does not prove installed availability.
- `check:codex-plugin` is meaningful only when it runs a fresh host task against
  the intended currently installed plugin/cache and records the actual tool
  route; source packaging and source-Agent routing remain separate observations.
  If the direct fresh-process and source-Agent lanes pass while the installed
  first call fails before a retry succeeds, use the bounded reproduction route
  in `diagnostics/2026-09-02-installed-codex-first-call.md` and leave installed
  availability failed or blocked rather than changing semantic code.
- `check:deployments` compares current generated artifacts with hosted Pages and
  the configured `personal` marketplace plugin source byte-for-byte. A known
  old deployment or marketplace source is a real FAIL/pending release, not an
  excuse to call source release-ready. Marketplace synchronization, push, and
  deploy remain owner-authorized.

Report `PASS / FAIL / BLOCKED` separately for development regression, provider
canonical conformance, live transport binding, installed Agent flow, browser
runtime, deployment/source/plugin distribution, and owner experience. Include
the exact Node/Temporal/tzdb version and zone transition corpus for semantic
claims. UI usefulness and visual quality remain `OK / Not OK / Pending` from
the owner; no technical aggregate replaces them.
