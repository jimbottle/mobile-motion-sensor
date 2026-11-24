# Changelog

What was done, what worked and what did not. Failed approaches stay in. Newest first.

## 2026-11-24: proof of concept works. First results from real devices

The first time anything in this repo ran on hardware. One Puck.js, one BS412 on four jumper wires pushed through the Puck's holes, no soldering, and the watch.

**Measured, 2026-11-24**

- **The Puck's button buzzes the watch.** Button-trigger build on the Puck, `msense` 0.01 on the watch at its default scan (40 ms window, 1000 ms interval). The owner pressed 8 times (the Puck's counter read 8 afterwards) and felt a buzz each time, "within a second to second and a half", by feel, not timed
- **A BS412 on jumper wires buzzes the watch.** After 40 s covered by a mug the watch's record showed counter 0; after the mug came off and the owner waved, it showed counter 3 and he felt buzzes. His words: it "kind of worked", "a little inconsistent", "did trigger correctly a few times". How many waves did not trigger was not counted
- **The BS412's leg numbering as read from the datasheet is right**: legs toward you, rim tab at upper right, top is 1, right 2, bottom 3, left 4; with 1 and 2 to GND, 3 to D2 and 4 to D1 it triggered. That also confirms the brief's wiring table for this sensor
- The Puck is `Puck.js f538`, firmware **2v27**, 2630 variables in total. With the development build running, 2129 to 2159 were free, so the 13.5 kB file with its comments fits
- `NRF.setAdvertising` accepted `interval: 20` with `connectable: true` and manufacturer data on `0x0590` without an error, and the watch heard it. The interval actually transmitted was not measured, and the non-connectable case is still untested (`mobile-motion-sensor-3ph`)
- With the sensor powered from D2 and the owner sitting in front of it, D1 read high continuously for the 50 s it was watched. Whether that was warm-up or continuous re-triggering was not separated
- Watch: `msense.boot.js` 7114 B, CRC32 `01194fd0`, and `msense.info` 195 B, CRC32 `d5159551`, both read back identical. The listener was started with `eval` of the stored file in the Settings app's context, not by `load()`, so that the "Stay Connectable?" prompt stayed up. The watch's battery read 10% throughout

- **Room test, same day, console disconnected and the watch back on the phone:** armed, the sensor did not react to the owner walking in front of it. It first triggered when he picked the rig up, and after that "it did trigger correctly", buzzing the watch on movement. So the listener did restart by itself after the watch left the Settings screen. Why it was deaf at first is not known. Two candidates, not separated: a leaning jumper that was not making contact until the rig was handled (a power or ground wire reconnecting would also produce the first rising edge); or the sensor's output sitting high from power-on, which the firmware does not count until it has dropped and risen again

- **Later the same day the Puck stopped responding** with the sensor circuit unplugged (the owner's report; which symptom, LEDs or button, was not recorded). Lifting the coin cell off its contact for a second brought it back: "that worked". That is the first sign the `.bootcde` start works after a reset, but the LED sequence he saw was not recorded, so it is not confirmed. **Why it stopped responding is not known**: nothing was connected to read its state or error flags before the reset cleared them

**How it was done**

- **`tools/puck-console/index.html`**, new: a one-button Web Bluetooth page served from localhost. The owner clicks Connect and picks the Puck; the rest is driven from the page's JavaScript. The built file goes to the Puck's Storage as `poc.js` in 192-byte pieces, each acknowledged, and is read back byte for byte before it is run with `eval`. This is the dev loop `mobile-motion-sensor-3ph` asked for, less the interval measurement
  - As first committed (`37a8940`) the page held only the connection and a raw send; the upload, read-back, run and `.bootcde` steps lived in the browser session that ran them. Review 7685 caught that. They are now `puck.upload`, `puck.run` and `puck.persist` in the page, written from the session's code. **The committed versions have not been run against a Puck**
- A one-line `.bootcde` on the Puck, `eval(require("Storage").read("poc.js"));`, now evals `poc.js` at every start, so a power glitch does not lose the program. Whether it runs after a reset was not observed

**Did not work, or got in the way**

- **Chrome will not reconnect to the Puck without a new chooser click.** After a disconnect, `device.gatt.connect()` on the kept device object failed four times with "Bluetooth Device is no longer in range". Every reconnect cost the owner a click
- **Leaning jumper pins drop the Puck's power when the board is moved.** The console connection was lost twice during wiring and covering, and one of those was a reboot (uptime read 91 s afterwards, the program gone from RAM). Watching the sensor over the console during the test was abandoned for that reason; the Puck's blue blink and the watch's own record were used instead
- **My first console command to arm the sensor was ignored**, correctly: it came within a second of `onInit()`, inside the core's boot guard
- **I told the owner to put a mug over the sensor and then to press the button and watch the LEDs.** The jumpers are 3 in long; the Puck was under the mug too
- No snapshot of the watch was taken before or after, against `../my-bangle`'s rule. The change there is two new files

**Not known after today**

- Why some waves did not trigger: the sensor's 2.3 s lock time after each 2 s output, the 30 s settle guess, the loose contacts and the watch's scan pattern are all candidates and none was isolated
- Anything about range, false triggers, battery cost on either device, or behaviour across app switches on the watch

## 2026-11-24: scope cut to a proof of concept; Puck hardware shell written, never run

- **Owner, in session:** the full bench plan is far too much for a first proof. The first goal is one Puck, one PIR on jumper wires and the watch buzzing on a walk-past. No soldering: jumper pins pushed through the Puck's holes. The brief's bench steps (3V reading, recovery paths, pigtails, range, current, case) are later work and happen when he asks for them
- **`firmware/shell.js`**, new (`mobile-motion-sensor-3mg`): the pins, timers, LEDs and radio calls around `firmware/core.js`. D2 powers the PIR, D1 reads it with a pull-down so a loose wire reads low. A development build flashes all three LEDs at start and blinks blue on every counted trigger. **It has not run on a Puck.** `node firmware/test-shell.js` runs the built file against stand-ins for Espruino's globals: 23 checks, 17 mutants, all caught (two of each added after review 7683 found that calling `onInit()` and then `save()` would have doubled the button handler; `start()` now clears and rebuilds everything). The stand-ins are my reading of Espruino's API, so this proves the shell and the core fit together and nothing about a board
- **`tools/build-puck.js`**, new: joins core and shell into `build/puck-dev.js` (13003 bytes with comments; whether that fits comfortably in the Puck's memory is unverified). `--button-trigger` builds a variant where a short press while armed counts as a trigger and settling takes 2 s, for proving the radio and the watch with no PIR attached. There is no field build yet
- **Brief found wrong:** the BS412 pin drawing is on page 3 of Adafruit's datasheet, not page 7 (read 2026-11-24 from `cdn-shop.adafruit.com/product-files/4666/Datasheet.pdf`). It labels 1 VSS, 2 ONTIME, 3 VDD, 4 REL, with the can's tab between pins 1 and 2, which matches the brief's wiring table. The four legs sit on a 2.54 mm diamond, so pushed straight into a breadboard two of them share a row; they have to be spread. I read the drawing as a view from the leg side, because the tab moves from lower right in the window view to upper right in the pin view. **Unverified** until a real sensor is wired: if the view is the other way, pins 3 and 4 swap
- **Handoff replaced:** `mobile-motion-sensor-maf` is now the proof of concept, in two parts: the Puck's button buzzes the watch, then the PIR does. The bench session 1 runbook written earlier the same day is gone from it

## 2026-11-24: parts in hand; two fixes to the ESP32-C3 stand-in, still never run

- **Owner, in session:** the Adafruit order has arrived (`mobile-motion-sensor-4vy` closed). A second Puck.js was ordered, so the second sensor ID is proven on a second device (`mobile-motion-sensor-jee`). On hand: a soldering iron, a multimeter with a microamp range and calipers. A 3D printer is potential access, not his own, which matters for `mobile-motion-sensor-zef`
- **`tools/esp32-advertiser/esp32-advertiser.ino`** (`mobile-motion-sensor-7o0`), two low review findings fixed before any trial depends on the sketch:
  - `radioOn` was set to true even when `adv->start()` failed, so status reported a burst that was not on the air. It now follows the result of `start()`, and a failed start is retried after 1 s
  - the boot ID was drawn from `esp_random()` before `BLEDevice::init`, when the radio is off and the numbers are not truly random. It is drawn after
- It compiles (622101 bytes, 47%) with the same command and core as on 2026-11-16. **It has still not run on a board**, and the failed-start path cannot be exercised until one is plugged in
- **`tools/esp32-scanner/esp32-scanner.ino`**, new, for `mobile-motion-sensor-3ph`: the same ESP32-C3 board flashed as a continuous passive scanner that prints one timestamped line per packet on company ID `0x0590`. It is how the Puck's real advertising interval gets measured, since the Puck may accept an interval and transmit at another. It compiles (619967 bytes, 47%); **it has not run on a board**. In core 3.3.12's NimBLE build a scan duration of 0 means forever (`BLEScan.cpp`, read 2026-11-24)
  - **Review finding, high, fixed:** as first committed (`9d716b5`) the scanner would have run out of memory. With duplicates reported, the library keeps one entry per address and appends each packet's bytes to it, and nothing removed the entries. The callback now erases the entry for every packet, and `c` prints the free heap so a 10-minute run near the Puck can show it stays flat. Unverified until then
- **Handed to the owner:** bench session 1 (`mobile-motion-sensor-maf`), one runbook covering the Puck's first power-up and 3V reading, the dev loop (`mobile-motion-sensor-3ph`), both recovery paths (`mobile-motion-sensor-9n7`) and soldering the four pigtails (`mobile-motion-sensor-w9w`). The PIR and capacitors are left for the session after, once the BS412 pin drawing has been read

## 2026-11-16: ESP32-C3 stand-in transmitter written; compiles, never run

- **Changed plan:** the owner has no spare ESP32 after all. The board on hand, an UNO with an ESP8266, has no Bluetooth. The owner is adding an ESP32-C3-DevKit-RUST-2 (Adafruit 5787) to the parts order as the controlled advertiser, so the latency and loss trials (`mobile-motion-sensor-xx0`) wait for the box. This part is not in the brief's parts table
- **`tools/esp32-advertiser/esp32-advertiser.ino`** (`mobile-motion-sensor-7o0`): advertises the protocol v1 payload and takes commands over USB serial. It compiles for `esp32:esp32:esp32c3:CDCOnBoot=cdc` with arduino-cli 1.6.0 and core `esp32:esp32` 3.3.12: 622043 bytes, 47% of program space. **It has not run on a board.** Whether the C3 accepts a 20 ms non-connectable interval, and whether `CDCOnBoot=cdc` is the right serial setting for this board, are unknown until one is plugged in
- **Didn't work:** the first build used `ADV_TYPE_NONCONN_IND`, the Bluedroid constant. Core 3.3.12 builds the C3 on NimBLE (`CONFIG_BT_NIMBLE_ENABLED=y` in its sdkconfig), where the type is `BLE_GAP_CONN_MODE_NON`
- Installed on this Mac: `arduino-cli` 1.6.0 from Homebrew and the `esp32:esp32` 3.3.12 core

## 2026-11-16: sensor logic and watch listener written, tested in Node only

Neither has run on a device. A passing host test says the logic matches `docs/protocol.md`, not that a Puck or the watch behaves that way.

- **`firmware/core.js`** (`mobile-motion-sensor-ssh`): the sensor's decisions with no pin, timer or radio in them. `node firmware/test-core.js`: 67 checks, 26 mutants, every mutant caught by a named check. The hardware shell that drives it is part of `mobile-motion-sensor-3mg` and needs the Puck
- **`../my-bangle/apps/msense/`** (`mobile-motion-sensor-40v`), commits `78c796d` to `82122af` there: boot code that scans, applies the protocol's watch rules and logs to Storage. 55 checks, 33 mutants. Three follow-up commits fixed review findings, all logged in `../my-bangle/docs/review-findings.md` under 2026-11-16: the log's size limit was only checked at boot; the sensor record was only saved at app switch, so a watch reset could re-buzz an old trigger; and `86a981c` was committed with one mutant surviving, because the test and the commit were chained without checking the exit code Its `NOTES.md` lists what only the watch can answer
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
