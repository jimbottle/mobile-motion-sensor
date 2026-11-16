# mobile-motion-sensor

A small battery-powered motion sensor that buzzes a Bangle.js 2 watch when someone walks into its view. A Puck.js v2 reads a passive infrared sensor and broadcasts over Bluetooth; the watch listens and buzzes. No phone, no hub.

**State on 2026-11-16: planning.** No parts have arrived, no firmware exists and nothing has been measured.

## What is here

| Path | What it is |
|---|---|
| `docs/brief-2026-11-16.md` | The owner's brief: requirements, parts, wiring, bench plan and the list of unverified claims with their sources. A dated input, not edited afterwards |
| `docs/protocol.md` | The Bluetooth protocol between sensor and watch, version 1 |
| `docs/runbooks/puck-recovery.md` | Getting back into a Puck.js that cannot be reached over Bluetooth |
| `CHANGELOG.md` | What was done, what worked and what did not |

The watch-side code lives in the sibling repo `my-bangle`, under `apps/`, with that repo's deploy tooling and measured platform limits.

## How work is tracked

The plan is a set of bd (beads) issues with dependencies, filed through `wyk`. `bd ready` lists what can be worked now. Tasks that need the owner's hands or a decision are handed off with `wyk handoff` and a runbook. `CLAUDE.md` has the conventions.

## Evidence rule

Every claim in these docs is either measured, with the date and the reading, or marked unverified. Vendor pages and forum posts count as unverified until checked on the bench.
