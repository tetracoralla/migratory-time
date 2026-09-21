# Temporal semantics model

## Product responsibility

Migratory Time turns explicit temporal intent supplied by a user-selected Agent
or another caller into deterministic, bounded, replayable time plans. The
caller owns natural-language interpretation and unresolved business intent.
Migratory Time owns validation, civil-time resolution, explicit ambiguity,
declared data dependencies, stable result branches, resource limits, and
revalidation.

The semantic layer sits above the existing Temporal/IANA civil-time core and
below calendars, Agent hosts, schedulers, messaging systems, and other
executors. It calculates and assesses plans; it does not create external events,
wait until an instant, send messages, or certify upstream calendar truth.

```text
human language / business rule / Agent proposal
                    |
                    v
        explicit TemporalIntent + context
                    |
                    v
        Migratory Time resolve / validate
                    |
                    v
      TimePlan + alternatives + dependencies
                    |
                    v
          caller-selected downstream executor
```

## TimePlan v0.1

The first product-owned schema is `migratory.time-plan.v0.1`. It deliberately
supports only two promises that can be implemented and revalidated from the
current core:

- `fixed_instant`: preserve one exact instant. It has no tzdb dependency.
- `fixed_wall_time`: preserve a local ISO calendar minute in one canonical IANA
  zone. Its UTC instant may change when time-zone rules change.

A resolved wall-time plan records the canonical local value and zone, the
explicit repeat-time policy, the resolved instant and offset, and the observed
IANA/tzdb version. A repeated local time with `reject` produces exactly two
candidate plans. A nonexistent time remains nonexistent. No branch silently
shifts a local time.

The v0.1 plan does not reserve speculative fields for recurrence, business
calendars, Free/Busy data, executors, approvals, or external side effects.
Implemented recurrence, deadline, and availability behavior remains in the
separate typed contracts below instead of inflating the narrow TimePlan schema.

## Bounded recurrence expansion

`expand_schedule` applies one closed, typed recurrence subset to wall-clock
intent. It supports daily, weekly, and monthly rules only; every request must
provide a bounded local-date window. Optional additional and excluded local
date-times provide RDATE/EXDATE-like behavior without accepting arbitrary RFC
5545 text.

Gap, overlap, and month-overflow behavior are explicit policies. All three
default to `reject`, so an omitted policy never silently skips, shifts,
constrains, or duplicates an occurrence. When a caller chooses a transforming
policy, the result separates the originally scheduled wall time from the
effective wall time and records the effect. An overlap policy of `both` returns
the earlier and later TimePlans in that order.

Expansion is finite: a window spans at most 3,660 local dates, additional and
excluded values contain at most 64 entries in total, and one page returns at
most 32 instances with an exact local-time cursor. The operation calculates
plans only. It does not persist a recurrence, observe a clock, wait, execute a
job, or mutate a calendar.

Every successful page is also a `migratory.schedule-plan.v0.1`: it records the
canonical zone, fully defaulted policies and rule, exact page request, tzdb
dependency, instances, and explicit effects. `validate_time_plan` can replay
that exact page under the current runtime. A tzdb-version-only change remains
a dependency change; changed instances/effects or a newly conflicting page is
semantic drift.

## Versioned business calendars and deadlines

`compute_deadline` adds exact elapsed business minutes to an exact start
instant using one complete caller-supplied
`migratory.business-calendar.v0.1` definition. The calendar names its `id`,
`version`, canonical IANA zone, weekly hours, and full local-date exceptions.
An exception replaces weekly hours for its start date; an empty interval list
is a closed date. Overnight work is explicit through `endDayOffset: 1`.

The calendar also owns the DST policy for local interval boundaries. Gap and
overlap policies default to `reject`; the caller must explicitly select a
shift or occurrence. The start instant separately defaults to `reject` when it
is outside business time, with `next_open` available only as an explicit
policy. Business minutes are exact elapsed minutes inside resolved open
intervals, not wall-clock labels or assumed 24-hour days.

The result is a `migratory.business-deadline.v0.1` calculation plan. It records
the original and effective start, exact deadline instant and local view,
calendar identity/version plus a deterministic normalized-definition
fingerprint, current tzdb dependency, bounded scan counts, and visible boundary
adjustments. The fingerprint detects accidental definition drift; it does not
authenticate the provider or prove that its calendar facts are correct. It is
computed from normalized operational calendar content; provider `id` and
declared `version` remain separate dependency metadata and do not change the
content fingerprint by themselves.

`validate_time_plan` accepts `{kind: "business_deadline", plan,
currentCalendar}` where `currentCalendar` is the current complete calendar with
the same identity, not a dependency summary. It recomputes the deadline from the stored
intent, separates calendar/fingerprint/tzdb dependency changes from deadline
changes, and returns the current computed, conflict, or unsatisfiable result.
A different calendar id is `unverifiable`, not a substitute.

Definitions contain at most 128 weekly/exception intervals, calculations add
at most 525,600 business minutes, and the search stops after 3,660 source
dates. The tool has no built-in holiday knowledge, provider registry, account
connection, persistence, or execution authority.

## Bounded availability solving

`find_time_windows` solves over exact intervals already supplied by the caller.
Each participant has a canonical IANA zone, hard availability intervals,
optional busy intervals to subtract, and optional preferred intervals used only
for deterministic ranking. Migratory Time does not fetch Free/Busy or infer
working hours from a locale, role, country, or model judgment.
Participants form an unordered set keyed by their unique ids. Normalization
orders that set by id before fingerprinting, solving, local rendering, and
conflict-core selection, so permuting the caller's array cannot change the
semantic result.

The exact search interval anchors an explicit step grid. Candidate duration is
exact elapsed minutes. A candidate is valid only when every participant's
effective availability contains the whole interval. Preference rank is the
count of participants whose entire candidate lies inside one of their stated
preferred intervals; ties resolve by earlier exact instant. The result exposes
the numerator, denominator, matching/non-matching participants, and local views
instead of an opaque model score.

When no candidate exists, the result distinguishes no common availability,
insufficient continuous duration, and grid alignment. It returns a
deterministic irreducible participant set: removing any remaining participant
would make the current bounded constraints satisfiable. This is not a claim of
minimum cardinality and does not diagnose why an upstream calendar supplied
those intervals.

One request contains at most 12 participants and 512 total input intervals,
searches at most 31 exact days with a minimum five-minute step, and returns at
most 10 candidates. A versioned availability-snapshot identity and normalized
definition fingerprint make the result replayable; they do not authenticate
the data. The fingerprint covers normalized participant facts but excludes the
snapshot id and declared version, which remain separate dependency metadata.
The operation cannot read accounts, reserve a room, create an event, or execute
the selected time.

A solved availability result is a `migratory.availability-plan.v0.1`.
`validate_time_plan` accepts that plan plus the current complete participant
snapshot with the same snapshot id, reruns its stored query, and distinguishes
dependency-only changes from changed candidates, preference ranking, counts,
or a newly unsatisfiable result.

## Agent context and result schemas

Invocation schemas remain in normal MCP tool discovery. The larger closed
result unions for `resolve_time`, `validate_time_plan`, `expand_schedule`,
`compute_deadline`, and `find_time_windows` are enforced on every call but
published as `migratory-time://schemas/<tool>/result.json` resources. A caller
loads one only when it needs the full branch contract. This keeps typed behavior
available without paying its full schema cost in every Agent turn.

## Revalidation semantics

Revalidation recomputes the plan's canonical intent with the current runtime.
For business and availability plans, the caller must also supply the current
complete versioned dependency. It never treats the stored resolution,
fingerprint, or dependency record as authority.

- `unchanged`: the current computation yields the same semantic resolution.
  The result separately reports dependency-version/fingerprint changes that
  did not alter the actual plan result.
- `drifted`: a fixed time, recurrence page, deadline, candidates/ranking, or
  terminal resolution status changed. The result includes the current
  computation needed for caller policy.
- `unverifiable`: the plan schema version or required provider context cannot
  be evaluated by this runtime.
- `error`: the submitted plan is malformed or internally inconsistent. Retrying
  the identical input cannot repair it.

Revalidation does not update a stored plan or downstream system. The caller
decides whether a changed plan needs human confirmation and which external
object, if any, may be mutated.

## Planned dependency boundaries

Later slices may add, in dependency order:

1. provider-specific adapters for calendar availability and pinned or remote
   tzdb snapshots.

Each slice must keep structured input discoverable, enforce one cumulative
request/output budget, reuse the shared core, and earn its own runtime and
installed-route validation. A provider-seeded implementation is not a claim of
cross-provider substitution.
