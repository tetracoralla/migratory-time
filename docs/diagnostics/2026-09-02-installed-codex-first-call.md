# Installed Codex first-call handoff — 2026-09-02

This is a bounded diagnostic handoff for one open installed-runtime failure. It
does not certify current source, installation, routing, or release readiness.
Re-run every command against the intended plugin and Codex release. Agent Host
Suite is a separate carrier unless the failure is reproduced through its active
projection.

## Failure signature

On 2026-09-01, two independent `npm run check:codex-plugin` runs reached the
same failure shape on different ordinary prompts:

```text
current_times status=failed error=null
current_times status=completed error=null
```

The affected prompts were the Chinese Beijing/Berlin current-time request and
the English `UTC-5` / `GMT+8` current-time request. The final answers were
usable, but two domain calls violated the declared one-call route budget. The
empty failure payload did not distinguish plugin-process startup, cache or
binding refresh, or Codex/Agent Host lifecycle behavior.

After current Codex marketplace discovery resolved the exact new plugin cache
on 2026-09-02, the first four routes completed in one call. Case 5 then
repeated the same failure shape with `expand_schedule`: one
`failed/error=null` call followed by one completed call. The failure therefore
survives a current, byte-identical plugin cache and is not limited to
`current_times`.

## Project-side re-review

On 2026-09-02, current source passed the complete `npm run check` development
lane: 31 test files / 167 tests, Web and MCP builds, the nine-tool/five-resource
stdio contract, business-flow replay, plugin/legal/relocation checks, and the
experimental Capability adapter. The new fresh-process check completed 12/12
first `current_times` calls with 110.9 ms p50 and 115.0 ms maximum startup-to-
result time. Three fresh `gpt-5.6-luna`/low source-Agent cases then used exactly
one source MCP call each with no Web or shell fallback.

These dated observations close the direct startup seam for this checkout. They
do not explain the earlier installed failure or establish current Host
activation.

The prepared source, `personal` marketplace, enabled Codex plugin, and MCP cache
all resolve to `2.0.0+codex.20260902075500`; the cache is byte-for-byte equal to
the eleven-file source package. No explicit plugin-install or Agent Host
tool-set command was issued during this repair. The installed lane remains
failed because the fresh Codex route above required a retry.

At `2026-09-02T08:01:27Z`, the packaged Agent Host snapshot reported release
`self-bootstrap-20260902.33`, current Observer snapshots, a loaded collector,
and all three provider collections successful. `agent-host doctor --json`
returned `status: ok`. That Suite separately retained Migratory Time
`2.0.0+codex.20260825160148` as available but not active; only Math Anchor was
in its active Agent component set, and fresh-session uptake was not observed.
Those observations neither reproduce nor explain the repository-marketplace
Codex failure, so they are not a causal Agent Host finding.

## Isolation sequence

Run the lanes in this order from the repository root:

```bash
npm run check:cold-start-mcp
npm run check:source-agent
npm run check:codex-plugin
```

1. `check:cold-start-mcp` starts twelve new Node/MCP processes. After protocol
   initialization, the first domain request is `current_times`; the script does
   not list tools or make a warm-up domain call first.
2. `check:source-agent` starts fresh Codex tasks with the current source MCP
   explicitly bound. It measures Agent selection without reading or replacing
   the installed plugin.
3. `check:codex-plugin` reacquires the installed plugin, enabled MCP binding,
   loaded Skill path, natural-language route, tool count, retries, and generic
   fallbacks. It is the only one of these commands that can close the installed
   Codex route.

Interpret the first failing lane as the current ownership boundary:

- direct fresh-process failure: investigate this repository's package, server
  startup, stderr, dependencies, or first-request handling;
- direct pass plus source-Agent failure: investigate the source binding or
  Codex selection harness before installed activation;
- both project-side lanes pass but installed first call fails before a retry:
  hand off plugin activation, process lifecycle, cache refresh, and initial
  connection handling to the installed Codex/plugin owner. Escalate to Agent
  Host core only if the same failure is reproduced through an active Agent Host
  projection.

## Reproduction and capture

The routing checker can resume at one of the observed cases:

```bash
MIGRATORY_TIME_ROUTING_START_CASE=1 npm run check:codex-plugin
MIGRATORY_TIME_ROUTING_START_CASE=3 npm run check:codex-plugin
MIGRATORY_TIME_ROUTING_START_CASE=5 npm run check:codex-plugin
```

Capture, without reading private Host storage or changing Host source:

```bash
node --version
node -p 'process.versions.tz'
codex --version
codex plugin list --json
codex mcp get migratory_time
```

Retain the checker assertion containing the ordered MCP call records, plugin
manifest version, installed cache path, Host release id, binding activation
time, and whether a genuinely fresh session loaded that release. A successful
retry is not a successful one-call route.

## Closure condition

The project-owned startup seam is closed for this checkout because the direct
fresh-process check and source-Agent route pass on current source. Close the
installed Codex lane only after the same plugin/Skill/server version runs in a
fresh session and two consecutive complete `check:codex-plugin` runs finish
without failed calls, retries, Web, or computational shell fallback. An Agent
Host lane can be evaluated only after Migratory Time is intentionally activated
there in a fresh session. This file does not authorize an Agent Host source
change, tool-set change, installation, commit, push, deployment, or
publication.
