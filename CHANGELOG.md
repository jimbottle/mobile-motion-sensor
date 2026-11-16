# Changelog

What was done, what worked and what did not. Failed approaches stay in. Newest first.

## 2026-11-16: sensor logic and watch listener written, tested in Node only

Neither has run on a device. A passing host test says the logic matches `docs/protocol.md`, not that a Puck or the watch behaves that way.

- **`firmware/core.js`** (`mobile-motion-sensor-ssh`): the sensor's decisions with no pin, timer or radio in them. `node firmware/test-core.js`: 67 checks, 26 mutants, every mutant caught by a named check. The hardware shell that drives it is part of `mobile-motion-sensor-3mg` and needs the Puck
- **`../my-bangle/apps/msense/`** (`mobile-motion-sensor-40v`), commits `78c796d` and `e8cd831` there: boot code that scans, applies the protocol's watch rules and logs to Storage. 49 checks, 29 mutants. The second commit fixes a finding from an automated security pass: the log's size limit was only checked at boot (`../my-bangle/docs/review-findings.md`, 2026-11-16). Its `NOTES.md` lists what only the watch can answer
- **`../my-bangle/docs/bangle2-limits.md`** (`mobile-motion-sensor-6r8`): the one-connection line now says one incoming connection was measured and that an outgoing connection, or scanning, alongside the phone was not
- Added a test vector to `docs/protocol.md`
- Handed the owner the first watch device window with a runbook (`mobile-motion-sensor-29n`). The five watch measurements that need it now depend on it
- **Owner, in session:** a spare ESP32 exists and will be the advertiser for the latency and loss trials (`mobile-motion-sensor-xx0`) before the parts arrive. It was not to hand today. Noted on `mobile-motion-sensor-vqw`

### Decided while writing the code, not in the brief

- The sensor ignores a button press that began within 1 s of power-up, so Espruino's button-at-power-up recovery paths never double as a feature
- A long press toggles the maintenance window. The brief only says it opens it
- Two rising edges on the PIR line less than 500 ms apart count once. A guess at glitch rejection; the bench test for radio false triggers (`mobile-motion-sensor-mnc`) will say whether it is needed or enough
- PIR settling defaults to 30 s. A placeholder until `mobile-motion-sensor-56v`
- On the watch, the time a sensor was last heard is not saved across an app switch, so each switch restarts the 35 s lost-sensor clock

## 2026-11-16: plan filed, protocol and recovery runbook drafted

Nothing was measured today. No parts have arrived and no device was connected.

### Done

- Read `../my-bangle/docs/bangle2-limits.md`, `docs/banglejs-dev-reference.md`, `apps/README.md` and `docs/troubleshooting.md`
- Checked this repo against the brief's report. It matched: one unpushed commit (`cdafbce`), uncommitted edits to `CLAUDE.md`, `AGENTS.md` and `.claude/settings.json` (left untouched and not committed here), `/.roborev/` ignored. `wyk inbox` held nothing for this repo
- **The roborev post-commit hook is installed** (`.git/hooks/post-commit`, "roborev post-commit hook v5"), with `post-rewrite` and `pre-push` beside it. The brief had this as unconfirmed. `.roborev.toml` did not exist and was added with the single key `review_min_severity = 'medium'`
- Saved the brief as `docs/brief-2026-11-16.md`
- Filed the plan as 36 bd issues with dependencies. Three are owner handoffs: the parts order (`mobile-motion-sensor-4vy`), which advertiser to use for early measurements (`mobile-motion-sensor-vqw`), and four defaults to confirm (`mobile-motion-sensor-e1y`)
- Drafted `docs/protocol.md` (`mobile-motion-sensor-63o`) and `docs/runbooks/puck-recovery.md` (`mobile-motion-sensor-v16`)

### Where the brief and other sources disagree

Recorded as the brief asks. None is settled; each needs a measurement.

- **Burst advertising interval.** The brief plans a fast burst and cites 20 ms as the minimum advertising interval. Espruino's reference for `NRF.setAdvertising` (read 2026-11-16 from `libs/bluetooth/jswrap_bluetooth.c` on `master`) says non-connectable advertising cannot go below 100 ms. If the Puck's firmware enforces that, the watch's scan window has to be about three times longer and the predicted battery cost of candidate A triples. `docs/protocol.md`, "Open question"; measured in `mobile-motion-sensor-3ph`
- **Scan current.** The brief quotes about 6.5 mA from Nordic. Espruino's reference for `NRF.setScan` says "12mA or so", and its Puck.js page lists 12000 µA for `NRF.findDevices`. Neither is a Bangle.js 2 measurement. `mobile-motion-sensor-bak` measures the watch
- **Steady heartbeat.** The brief has the armed sensor send "a steady heartbeat". Arithmetic in `docs/protocol.md` says a duty-cycled scanner hears a slow steady beacon too rarely for a 30 s lost-sensor threshold, so the draft uses a short burst every 10 s instead. Arithmetic only
- **Payload layout.** The draft adds a magic byte and a development-build flag and widens the boot ID to 16 bits. Reasons are in `docs/protocol.md`
- **Puck connector.** The brief says the v2 connector carries GND, 3V, D1 and D2. Espruino's Puck.js page lists twelve pins on the v2 0.1 inch connector, those four among them. No effect on the wiring plan
- **Hard reset and bonding data.** The brief says a hard reset erases saved code and bonding data. The passage read on Espruino's Puck.js page mentions only saved code. The design uses no bonding

### Confirmed from Espruino's own text, still not from a device

- `NRF.setScan` gained `window` and `interval` in 2v22 (`ChangeLog`: "nRF52: Added window/interval arguments to NRF.setScan (default was 100ms)"). The watch runs 2v29
- `NRF.setScan` accepts a manufacturer-data filter, and `0x0590` is offered for user data on official Espruino devices
- Since 2v26 Espruino devices advertise company ID `0x0590` with no data by default, so the company ID alone does not identify this protocol

### Read from the watch snapshot `../my-bangle/snapshots/20261116T185607Z`

- Quiet mode is applied by callers: `messages` (`exports.buzz`) and `notify` each read `quiet` from `setting.json`. No match for `quiet` or `vibrate` in `bootupdate.js`
- `.boot0` and `setting.json` are not in the capture, so whether quiet mode or the Vibration setting can silence a direct `Bangle.buzz` call is not known. `mobile-motion-sensor-u1o`

### Not done

- **Watch-side measurements were not started.** They need a scan probe on the watch, which is not written (`mobile-motion-sensor-40v`), and a device window with the owner
- **The "one Bluetooth connection at a time" line in `../my-bangle/docs/bangle2-limits.md` was not amended.** `mobile-motion-sensor-6r8`
- Nothing was pushed
