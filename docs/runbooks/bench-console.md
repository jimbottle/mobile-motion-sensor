# Working on the Puck from a browser tab

How an agent loads a program onto the Puck.js, reads its event log, and what it must not do while connected. Written after the first bench day, 2026-11-24, from what worked and from the mistakes made then. `CHANGELOG.md` for that date has the detail behind each rule.

## Rules while connected

These come first because breaking them cost the owner an evening.

1. **Read state from the program's variables, never from the pins.** Use `s.mode`, `s.counter`, `s.pirHigh`, `pirOn`. On Espruino, `digitalRead(pin)` or `pin.read()` on a pin that was only ever written switches it to an input. `digitalRead(D2)` cut the sensor's power on 2026-11-24
2. **Never drive a pin from the console.** No `pin.write`, no `pinMode(..., "output")`, on any pin. The program drives D2 and nothing else. On 2026-11-24 D1 was driven high for 7 s as a test, into wiring already suspected of a short
3. **If a pin test seems necessary, say what it does and wait for the owner's yes.** The only test used that cannot push current into a fault is a weak pull-up or pull-down read (`pinMode(pin, "input_pullup")`, read, put it back). Even that changes pin modes: restore them, and do it only while the sensor is disarmed
4. **Arm and disarm through the program**, with `event({t:"button", heldMs:200})`, and not within 1 s of `onInit()`: the core ignores presses that close to a start
5. **Report what was read, then what is inferred, separately.** On 2026-11-24 five different causes were given for one evening's trouble, each stated as a finding. One of them (legs 3 and 4 swapped) was wrong and the owner was right not to act on it
6. **Disconnect as soon as the reading is done.** A connection is a load on the coin cell, and a watch buzz was felt at the moment of one connection (cause not established)
7. **Do not tell the owner to do something with their hands before picturing the rig.** The jumpers are 3 in long: whatever covers the sensor covers the Puck and its button

## Connecting

Chrome's device chooser needs a human click, every time. After any disconnect, `device.gatt.connect()` on the kept device fails with "Bluetooth Device is no longer in range" (four attempts, 2026-11-24), so each reconnect is another click. Spend them carefully: decide what will be read before asking for one.

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory tools/puck-console
```

Open `http://localhost:8765/` in a tab the agent opened. The owner clicks Connect and picks `Puck.js f538`. It must be the agent's tab: the owner once connected in a tab of their own, which the agent cannot reach.

## Loading a program

```bash
node tools/build-puck.js && cp build/puck-dev.js tools/puck-console/pir.tmp.js

# or, for the build where the button stands in for the sensor:
node tools/build-puck.js --button-trigger && cp build/puck-dev-button.js tools/puck-console/pir.tmp.js
```

Then, in the page:

```js
await puck.upload('/pir.tmp.js', 'poc.js')   // {ok:true, sent, back} when the read-back is identical
await puck.run('poc.js')                     // ends with free memory and error flags
await puck.persist('poc.js')                 // once: a one-line .bootcde that runs it at every start
```

The Puck on the bench already has that `.bootcde`. It was seen to work: after a battery reseat the program was running and armed with no upload.

## Reading the log

```js
await puck.readLog()
```

The format is at the top of `firmware/shell.js` (`logEv`). A saved example is `docs/logs/2026-11-24-puck-f538-mslog.txt`. Things that log taught:

- **`P,<level>,on` is a health check.** It is the sensor's output the instant it gets power. In the saved log there are five `P,1,on` power-ons: four went on to detect, and the fifth was the bowl test, where there was nothing to see. There are eight `P,0,on` power-ons and none produced a real detection. A `0` there means the sensor is not alive: check the wiring before anything else
- **A real detection is a pulse of about 2.6 s or longer.** Edges tens of milliseconds apart are electrical, not motion. One 40 ms pulse was counted as a trigger; the program does not filter them yet
- **Several `B` lines in a row with nothing between them is the Puck restarting in a loop.** The first number is the battery percent read at that start
- The log stops at 16000 bytes and keeps the oldest lines. Clear it before a long run, and reset the running program's own count in the same command, or it goes on counting the erased bytes and may log little or nothing until the next restart: `require("Storage").open("mslog","w").erase(); logLen = 0; logOff = !CONFIG.log;`

## What the LEDs mean

| Seen | Meaning |
|---|---|
| One brief red flash | The Puck's own power-on flash |
| Red, green and blue together ("white") | The development program started |
| Red then white, over and over | It is restarting in a loop. Each restart comes back disarmed |
| Green | Armed |
| Red | Disarmed by the button |
| Three red flashes | The trigger limit disarmed it (5 in 60 s) |
| Short blue blink | A trigger was counted |

A press in the first second after a start is ignored on purpose. During a restart loop that makes the button look dead.

## The sensor's legs

BS412, datasheet page 3. Hold it with the **legs toward you** and find the metal tab on the rim, which sits between two legs. Going **clockwise** from the tab: ground, **power (to D2)**, **signal (to D1)**, ground. The two legs beside the tab are both ground. Confirmed by a working sensor on 2026-11-24.

Do not describe this to the owner as "tab at upper right": the tab lines up with no leg, and that wording was rightly called meaningless.
