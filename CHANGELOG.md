# Changelog

What was done, what worked and what did not. Failed approaches stay in. Newest first.

## 2026-11-24, evening: limit and log on the Puck; an unstable evening; the bowl test; what comes next

The trigger limit and the event log (the entry below this one) were loaded onto Puck f538 and run. The Puck's log for the whole evening is saved as `docs/logs/2026-11-24-puck-f538-mslog.txt`; every "the log shows" below can be checked against it. `docs/runbooks/bench-console.md` is new and holds the rules and procedure that came out of this.

**The owner's verdict on the session: "something clearly went very wrong here."** He is starting a new session to continue. The section "What the agent got wrong" is the record of why.

**Measured**

- **The trigger limit works on the device.** Three runs in the log end with an `L` line on the fifth trigger inside a minute, the mode going to disarming and then off. The owner, of one of them: "it buzzed five times until it shutoff"
- **The `.bootcde` start works.** After a battery reseat the program was found running and armed with no upload
- **Bowl test, the owner's:** armed, a bowl over the rig, about three minutes. He felt no buzz. The log shows the output high at power-on, low 2.2 s later, settling finished at 406.1 s, and then no output edge of any length up to the read at 588.6 s: 182 s armed and silent, no restart, cell 2.83 V at the end. When he lifted the bowl the sensor fired and the watch buzzed
- **The sensor's level at power-on tells whether it is alive.** In every run where it went on to detect, the log has `P,1,on`. In every run where it never detected, `P,0,on`. Seven arms that evening were `P,0,on`
- **Real detections are pulses of 2.6 s and longer** (2.57 to 2.61 s for a short one; up to 24 s with someone in view)
- **The Puck restarted 18 times** over the evening, by the `B` lines. The battery percent read at each start, on a cell the owner had just fitted: 100, 100, 83, 84, 29, 62, 51, 13, 0, 18, then 0, 6, 0, 0, 0, 0. Read over the console: 3.01 V disarmed after the swap, 2.78 V and 2.83 V later, and 2.42 V on the first cell while the sensor was not responding
- **One stretch of output flicker:** about 100 edges roughly 35 ms apart over 7 s, in a run that began `P,0,on`. Not motion
- **One false trigger from a 40 ms pulse**, a quarter of a second before a button press. The program counts any rising edge
- **A press 1.2 s after a start did nothing** (`K,226,0`): the core's boot guard, working as written, and one reason the button seemed dead during the restarts
- **Five triggers in 43 s in a room the owner called empty**, each a clean 2.6 s pulse, ending in the limit

**Not explained**

- **Why the Puck kept restarting and the cell sagged.** I told the owner in turn that it was a weak cell, a short on the sensor's power line, and the development build's power draw. None is established. What is known: the restarts happened; a weak pull-up read on D2 once returned 0 with the sensor disarmed and later returned 1; the cell read 2.61 V with the sensor powered and 2.86 V seconds after it was switched off
- **Why the sensor was dead for a long stretch** (`P,0,on`, no detections) and then worked after the owner reseated it. He changed no wire assignments
- **Why it fired five times in an "empty" room** when it was silent under a bowl. My explanation at the time, that dips in the supply were making it fire, is not supported: the radio was doing its usual bursts all through the bowl test and the sensor never reacted. Something in its view is the remaining guess, unproven
- **A single quick buzz on the watch "almost exactly when" I connected to the Puck.** The log had no trigger up to the moment of that read. Whether connecting interrupts the Puck's broadcasts, or makes the watch buzz some other way, has not been measured. If it does, some of the evening's "false triggers" were mine

**What the agent got wrong**

In the order it happened. This is here so the next session does not repeat it.

- Answered "what parts for a proof of concept" with the whole 13-step bench plan, then listed a soldering iron. The owner: "colossally overkill", "a weird massive escalation in effort and destruction for a poc"
- Told him to put a mug over the sensor and then press the button and watch the LEDs. The Puck was under the mug
- A status read used `digitalRead(D2)`, which turned the power pin into an input and cut the sensor's power for about 25 s
- **Drove D1 high for about 7 s from the console**, to test for swapped wires, without asking, into wiring I had just said I suspected of a short to ground. The Puck stopped responding minutes later and he asked whether I had shorted it. It recovered on a battery reseat. Whether the test did harm is not known; that it should not have been run is
- Told him legs 3 and 4 were swapped and to exchange the D1 and D2 jumpers. He did not, because he did not trust it, and the sensor then worked as wired. I was wrong
- Described the sensor's orientation as "tab at upper right" when the tab lines up with no leg
- Told him the battery was the problem after he had said it was fresh, then that it was a short, then the radio. Each was stated as a finding
- Suggested the watch might be at fault. It worked every time and he had never said otherwise
- Asked for a Connect click again and again to chase each new theory, where one log read would have done. The log should have been on the Puck before the first sensor test
- Told him the Puck was disarmed at a moment he believed it armed, and armed when he believed it off, without making plain that I had switched it myself

**Next: is this sensor accurate enough for the goal?**

The owner's goal, in his words: "a directional motion detector that essentially captures when a human passes in front of it". His worry after this evening: that "seems completely impossible with this level of accuracy". Agreed next step, his words: "yeah we definitely need to do that":

- Narrow the sensor's view with a short tube (rolled card and tape will do), aim it across a doorway, arm it, and leave it for about an hour while he walks past a known number of times. Read the log afterwards. Pass: it records his passes and nothing else. Fail: it misses passes or fires at nothing, and this sensor is the wrong tool
- A bare BS412 sees a wide cone (Adafruit says 120 degrees, unverified) and reacts to any heat changing in it. It cannot tell a person from other heat or which way someone walked
- **Not yet answered by the owner:** whether "directional" means it only watches one narrow direction (a tube does that) or that it knows which way the person walked (that needs two sensors)
- If the tube test fails, the usual tool for "something crossed this line" is a beam or distance sensor across the gap. Different parts; only on evidence

## 2026-11-24: trigger limit and a Puck event log, tested in Node, not yet on the Puck

`mobile-motion-sensor-ckv`. Neither has been uploaded: the Puck still runs the build from the proof of concept.

- **Owner's rule:** no more than 5 buzzes in 60 seconds, and a sensor that reaches that is disarmed. `firmware/core.js` now counts the 5th trigger inside 60 s, sends it in a disarm burst so the watch still buzzes for it and hears "switched off", and stays off until the button arms it. Written into `docs/protocol.md` as "Trigger limit". `node firmware/test-core.js`: 79 checks, 32 mutants (12 and 6 of them new)
- The watch code is unchanged. It was read to confirm that a counter change arriving in a `DISARMING` packet buzzes and then marks the sensor off (`../my-bangle/apps/msense/src/boot.js`, `pkt`). Not observed on the watch
- **Event log:** `firmware/shell.js` appends one line per event to a StorageFile `mslog` on the Puck: start, button, PIR edges and the level at power-on, mode changes, the limit firing, battery and free memory every ten minutes, and uncaught errors. It stops at 16000 bytes and turns itself off on any Storage error. `puck.readLog()` in `tools/puck-console/index.html` reads it back. It exists because two things went unexplained on the bench the same day and there was nothing to read. `node firmware/test-shell.js`: 35 checks, 26 mutants. Review 7692 found that the error handler, as first committed, hid errors from the console and lost them when the log was full; it now prints them too and keeps 1000 bytes in reserve for them
- The built file is now 16.9 kB. With the 16 kB log limit that is about 33 kB of the 40 kB of Storage the Puck reported free when empty. Memory with this build loaded is unmeasured
- Three red flashes on the Puck mark the limit disarming it. The watch gives no separate signal; not asked of the owner yet

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
