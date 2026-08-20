---
name: convert-time-zones
description: Get current civil times or convert exact dates worldwide with Migratory Time's daylight-saving-aware tools. Use for any city, country, region, or IANA time zone.
---

# Convert Time Zones

Use the bundled deterministic MCP tools for calculations. Do not calculate UTC offsets or daylight-saving transitions manually.

## Choose the tool

- Call `current_times` once when the user asks for the time now. Pass ordinary city, country, region, explicit UTC/GMT offset, or IANA names directly, including names such as 北京时间, Paris, Nepal, US Pacific, UTC-5, and Pacific/Chatham.
- Call `convert_time` once for a scheduled local date and time. Supply `localDateTime` in `YYYY-MM-DD HH:mm`; source and target regions accept the same worldwide names.
- Call `search_time_zones` only for explicit exploration or after the direct tool returns `UNKNOWN_TIME_ZONE` or `AMBIGUOUS_TIME_ZONE`. Use its returned IANA id in the next conversion call.
- Call paginated `list_time_zones` only when the user explicitly asks to browse the canonical registry. Do not add a discovery call for an ordinary unambiguous name.

## Handle local-time boundaries

- Leave `disambiguation` as `reject` unless the user already chose the earlier or later occurrence of a repeated time.
- If the result is `ambiguous`, show the two abbreviation and UTC-offset choices and ask which occurrence the user means. Then call `convert_time` again with `earlier` or `later`.
- If the result is `nonexistent`, explain that the local time is invalid or was skipped by a clock change. Do not silently move it or substitute the current time.
- If the result is `error`, follow its structured `code`, `field`, `candidates`, and `retryable` values. Never fall back to Web or manual offset arithmetic.
- If required date, time, or source region information is missing and changes the answer, ask for that information.

## Present the result

- Prefer the tool's compact `copyText` when the user wants content to paste into a document or message.
- Include the tool's `shareUrl` when the user asks to share or preserve the converted state.
- Otherwise present only the requested regions and exact local date-times. Keep internal payload fields out of the answer unless they help resolve ambiguity.
- For conceptual explanations of time zones or daylight saving that require no calculation, answer normally without calling the tools.
