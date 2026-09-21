---
name: plan-time-commitments
description: Expand bounded DST-aware local recurrences, compute exact business-minute deadlines from complete caller-supplied calendars, or revalidate recurrence and business-deadline plans with Migratory Time. Use find-shared-time-windows for participant availability.
---

# Plan Time Commitments

Use the bundled deterministic Migratory Time MCP tools. Make one domain call when the request contains the complete required inputs. Do not calculate time-zone transitions, business minutes, interval intersections, or rankings manually.

## Choose the tool

- Call `expand_schedule` for a bounded daily, weekly, or monthly recurrence in a named IANA zone. It expands civil-time intent and returns a versioned schedule plan; it does not execute a schedule.
- Call `compute_deadline` to add exact business minutes when the caller supplied a complete versioned Business Calendar and exact start instant.
- Call `validate_time_plan` when the caller supplies a stored recurrence or business-deadline plan. Pass the plan unchanged. A business deadline also needs `currentCalendar`.
- Call `resolve_time` only when the requested commitment is a single fixed instant or fixed wall time. Ordinary current-time and one-off conversion requests belong to the `convert-time-zones` skill.

Do not route these requests to generic interval union, intersection, difference, or gap tools. Migratory Time owns the civil-time policy, dependency fingerprints, and revalidation semantics together.

## Preserve explicit policy

- Gap, overlap, month-overflow, and start policies default to `reject`. If the result is `ambiguous`, `nonexistent`, or `conflict`, present the exact choices and never select a shift, skip, occurrence, or next-open policy the caller did not provide.
- Treat supplied calendars as caller-owned versioned data, not verified truth. Do not infer holidays, work hours, or organization policy.
- Keep downstream actions outside the plan. A computed deadline does not authorize creating an event, sending a message, waiting, or scheduling execution.

## Recurrence

- Pass the closed recurrence fields, local-date window, explicit additions and exclusions, and policies as structured input; do not convert arbitrary RRULE text inside the tool call.
- Preserve scheduled versus effective local time when a shift policy was explicitly selected. With overlap policy `both`, preserve both TimePlans.
- Respect the returned page and cursor. Do not widen the 32-instance page or 3,660-day window through hidden repeated calls.
- Revalidate the returned schedule plan before a long-running Agent relies on stored future instances after a tzdb change.

## Business deadlines

- The calendar must include `schemaVersion`, `id`, `version`, `timeZone`, structured weekly hours, and any date exceptions. Use `endDayOffset: 1` only for an explicit overnight interval.
- Preserve calendar id/version/fingerprint, tzdb dependency, effective start, boundary adjustments, and exact deadline.
- To revalidate, pass exactly `kind: business_deadline`, `plan`, and the complete `currentCalendar`. A different calendar id is unavailable context, not a replacement.

## Present the result

- For `unchanged`, separately note dependency-version or fingerprint changes. For `drifted`, present the exact changed fields and current plan. For `unverifiable`, do not substitute a different calendar or snapshot.
- Keep internal payload fields out of the answer unless they explain a conflict, dependency, truncation, or changed commitment.
