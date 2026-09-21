# Upstream business-flow experiment

## Question

Can the current caller-supplied Business Calendar boundary carry one real
upstream data set through deterministic calculation, plan retention,
revalidation, and a downstream handoff without adding a provider account,
provider-specific production adapter, or pinned tzdb runtime?

## Current upstream observation

On 2026-09-01 the public Nager.Holidays Community API v4 endpoint for United
States holidays in 2026 returned HTTP 200 with 17 records. The observed
response reported `Last-Modified: Fri, 28 Aug 2026 14:42:27 GMT` and its compact
JSON body hashed to
`sha256:84dc44c3d5414d1cce33a076f78400db64f35c6f89f5cf4741c186d490a22f68`.
The exact recorded projection is
`scripts/fixtures/nager-holidays-us-2026.json`.

That observation establishes only what the public endpoint returned. It does
not establish an organization's actual closure policy. The provider response
does not supply the organization's IANA zone, weekly hours, eligibility rules,
or policy for observed versus named holiday dates.

## Explicit experiment policy

The experiment caller supplied the missing business policy instead of asking
Migratory Time to infer it:

- `America/New_York`;
- Monday through Friday, 09:00-17:00 local time;
- every upstream record marked both `nationalHoliday: true` and `Public` is a
  closed date;
- source response hash plus policy version form dependency-version metadata.

This translation is deliberately experiment-local. It is not exposed by the
MCP server, installed plugin, Web UI, or neutral Capability Profile.

## Executed chain

`npm run check:business-flow` starts the real source MCP transport and executes
the following chain against the recorded live response:

1. Translate 17 provider records into a complete Business Calendar with 10
   explicit closed dates.
2. Compute 240 business minutes from `2026-09-04T20:00:00Z`. The plan ends at
   `2026-09-08T16:00:00Z`, after the supplied 2026-09-07 closure.
3. Serialize and parse the returned `migratory.business-deadline.v0.1` plan to
   exercise storage transport, then revalidate it unchanged.
4. Change only the supplied calendar version. Revalidation remains
   `unchanged` and reports only `dependencies[0].version`.
5. Model an upstream fact revision by removing the 2026-09-07 closure.
   Revalidation becomes `drifted`, reports content-fingerprint and deadline
   differences, and computes `2026-09-07T16:00:00Z`.
6. Form a dry-run downstream handoff only from the unchanged revalidation: the
   exact deadline instant plus the current typed plan. The drifted branch is
   not handed off. The experiment creates no calendar event, task, message,
   automation, or other external state.

## Decision

The experiment does not justify a production Provider adapter now. The real
holiday response is useful input but cannot by itself become a complete or
truthful organizational Business Calendar; the material missing fields are
business policy, not mechanical mapping. No current account provider,
credentialed consumer, or repeated provider schema exists in this repository.
The existing boundary already accepts the complete versioned result of that
upstream composition and correctly separates provider-version changes from
content and deadline drift.

The experiment also does not justify pinned or remote tzdb replay. It required
current-runtime revalidation and carried the observed tzdb version in the plan,
but no current consumer required recomputing under a historical rule set. A
pinned/remote tzdb slice becomes warranted only when a named audit or execution
consumer must reproduce an older tzdb answer rather than assess the stored plan
under current rules.

Therefore the bounded product stop is to retain the nine-tool surface and the
caller-supplied calendar/availability boundary. Reopen a provider adapter only
for a current provider with an actual consumer, credentials/permissions, and a
complete policy mapping; reopen pinned tzdb only for an exact historical-replay
requirement. Neither future possibility enters the human Web product.
