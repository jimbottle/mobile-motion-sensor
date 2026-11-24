# mobile-motion-sensor

A small battery-powered motion sensor that buzzes a Bangle.js 2 watch when someone walks into its view. A Puck.js v2 reads a passive infrared sensor and broadcasts over Bluetooth; the watch listens and buzzes. No phone, no hub.

**State on 2026-11-24: the proof of concept works.** A Puck.js with a BS412 on jumper wires made the watch buzz on a hand wave, inconsistently. `CHANGELOG.md` has what was and was not measured.

## What is here

| Path | What it is |
|---|---|
| `docs/brief-2026-11-16.md` | The owner's brief: requirements, parts, wiring, bench plan and the list of unverified claims with their sources. A dated input, not edited afterwards |
| `docs/protocol.md` | The Bluetooth protocol between sensor and watch, version 1 |
| `docs/runbooks/puck-recovery.md` | Getting back into a Puck.js that cannot be reached over Bluetooth |
| `firmware/core.js` | The sensor's logic with no hardware in it: armed state, counter, button, advertising schedule, packet bytes. Runs in Node and is meant to run on the Puck |
| `firmware/test-core.js` | Its tests: `node firmware/test-core.js` |
| `firmware/shell.js` | The Puck's pins, timers, LEDs and radio around the core. First run on a Puck 2026-11-24 |
| `firmware/test-shell.js` | Runs the built file against stand-ins for Espruino's globals: `node firmware/test-shell.js` |
| `tools/build-puck.js` | Joins core and shell into one file to send to the Puck: `node tools/build-puck.js` |
| `tools/esp32-advertiser/` | An ESP32-C3 sketch that stands in for the sensor's radio in watch-side latency trials. The build command is at the top of the file |
| `tools/esp32-scanner/` | The same board flashed as a continuous scanner, for measuring the interval a transmitter really advertises at |
| `tools/puck-console/` | A one-button Web Bluetooth page for sending a program to the Puck from a browser tab an agent drives |
| `CHANGELOG.md` | What was done, what worked and what did not |

The watch-side code lives in the sibling repo `my-bangle`, under `apps/msense/`, with that repo's deploy tooling and measured platform limits.

## How work is tracked

The plan is a set of bd (beads) issues with dependencies, filed through `wyk`. `bd ready` lists what can be worked now. Tasks that need the owner's hands or a decision are handed off with `wyk handoff` and a runbook. `CLAUDE.md` has the conventions.

## Evidence rule

Every claim in these docs is either measured, with the date and the reading, or marked unverified. Vendor pages and forum posts count as unverified until checked on the bench.
