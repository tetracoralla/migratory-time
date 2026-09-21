---
name: find-shared-time-windows
description: Find and deterministically rank shared meeting or coordination windows from complete caller-supplied participant availability, busy and preferred intervals, search grid, and versioned snapshot with Migratory Time; also revalidate returned availability plans. Use instead of generic interval set algebra for participant-window requests.
---

# Find Shared Time Windows

Use Migratory Time's bundled `find_time_windows` tool exactly once when the request supplies the complete bounded search, duration and step, participant zones and intervals, and versioned availability snapshot. Do not manually intersect intervals or route participant-window requests to generic union, intersection, gap, or overlap tools.

## Preserve the supplied snapshot

- Pass exact RFC 3339 search, availability, busy, and preferred intervals. The search start anchors the step grid.
- Treat availability and busy as hard constraints. Preferred intervals only affect deterministic ranking; they never make an invalid candidate valid.
- Do not fetch account calendars or infer work hours, holidays, notice periods, travel buffers, or missing Free/Busy state.
- Preserve the snapshot id, version, definition fingerprint, participant ids, and IANA zones as replay dependencies. They do not prove the data is fresh.

## Present the result

- Preserve candidate order, exact instants, local views, preference numerator and denominator, and preferred or outside-preference participant ids. Do not replace them with a model-authored score.
- If unsatisfiable, distinguish `no_common_availability`, `duration_does_not_fit`, and `alignment_excludes_all`. The reported participant set is deterministic and irreducible, not guaranteed minimum-cardinality.
- Selecting a candidate does not authorize creating or changing an event, sending a message, waiting, or scheduling execution.

## Revalidate a stored window

Call `validate_time_plan` exactly once with `kind: availability`, the stored plan unchanged, and `currentSnapshot` containing the complete current participants, snapshot id/version, and locale if relevant.

- For `unchanged`, separately note dependency-version or fingerprint changes.
- For `drifted`, present the exact ranking or candidate changes and current plan.
- For `unverifiable`, do not substitute another snapshot id or model-authored availability.
