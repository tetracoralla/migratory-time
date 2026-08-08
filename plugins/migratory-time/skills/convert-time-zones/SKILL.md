---
name: convert-time-zones
description: Get current regional times or convert exact dates with Migratory Time's daylight-saving-aware tools. Use for Beijing, US Eastern/Pacific, UK, or Central Europe.
---

# Convert Time Zones

Use the bundled deterministic MCP tools for calculations. Do not calculate UTC offsets or daylight-saving transitions manually.

## Choose the tool

- Call `current_times` once when the user asks for the time now. Pass natural configured names directly, including 北京/北京时间, 美东/US Eastern, 美西/US Pacific, 英国/UK, and 中欧/欧洲中部/Central Europe.
- Call `convert_time` once for a scheduled local date and time. Supply `localDateTime` in `YYYY-MM-DD HH:mm`; source and target regions accept the same natural names, compact codes, or listed IANA zones.
- Call `list_time_zones` only when the user asks what is supported, or a region is genuinely outside the aliases exposed by the selected tool. Do not add a discovery call for an ordinary supported name.

## Handle local-time boundaries

- Leave `disambiguation` as `reject` unless the user already chose the earlier or later occurrence of a repeated time.
- If the result is `ambiguous`, show the two abbreviation and UTC-offset choices and ask which occurrence the user means. Then call `convert_time` again with `earlier` or `later`.
- If the result is `nonexistent`, explain that the local time is invalid or was skipped by a clock change. Do not silently move it or substitute the current time.
- If required date, time, or source region information is missing and changes the answer, ask for that information.

## Present the result

- Prefer the tool's compact `copyText` when the user wants content to paste into a document or message.
- Include the tool's `shareUrl` when the user asks to share or preserve the converted state.
- Otherwise present only the requested regions and exact local date-times. Keep internal payload fields out of the answer unless they help resolve ambiguity.
- For conceptual explanations of time zones or daylight saving that require no calculation, answer normally without calling the tools.
