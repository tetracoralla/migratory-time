# Contributing

## Development loop

Node.js 20.19 or later and npm are required.

```sh
npm ci
npm run check
```

The repository contains one shared time-zone core with web and MCP adapters.
Keep Temporal and IANA data as the time authority, preserve explicit repeated
and nonexistent local-time results, and do not replace civil-time behavior with
fixed-offset guesses.

The tracked plugin under `plugins/migratory-time` is installable without a
build. Rebuild it after MCP or dependency changes and keep its `LICENSE`,
`NOTICE`, and artifact-derived `THIRD_PARTY_NOTICES.md` synchronized.

## Pull requests

Keep changes scoped and add the smallest negative regression for parser,
ambiguity, bound, or recovery fixes. Report development regression, installed
Agent flow, browser flow, and business/experience acceptance separately.

## License of contributions

Unless explicitly stated otherwise, contributions intentionally submitted for
inclusion are provided under the Apache License 2.0, consistent with section 5
of that license. Contributors must preserve the license and attribution terms
of included third-party material.
