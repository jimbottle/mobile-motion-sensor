# Bluetooth protocol

How the sensor tells the watch what it is doing. Version 1, drafted 2026-11-16.

**Nothing in this file has been measured.** No Puck has been powered and no scan has been run on the watch. Each figure is tagged:

- **[spec]** is a design choice made here. It is true by definition once the firmware implements it
- **[doc]** was read from Espruino's own text on 2026-11-16: `libs/bluetooth/jswrap_bluetooth.c` and `ChangeLog` on the `master` branch of `github.com/espruino/Espruino`, or `espruino.com/Puck.js`. It has not been checked on a device
- **[unverified]** comes from the brief (`docs/brief-2026-11-16.md`) or from arithmetic, and needs a measurement before anything depends on it

When a measurement lands, replace the tag with **[measured]**, the date and the reading, and note the change in `CHANGELOG.md`.

This file specifies candidate A, broadcast and scan. Candidate B, a held connection, only has its identifiers reserved at the end. The choice between them is the owner's, at the gate (`mobile-motion-sensor-k9t`).

## Roles

- The **sensor** is a Puck.js v2. In normal use it only advertises. It accepts no connections and exposes no console
- The **watch** is a Bangle.js 2. It scans from a boot file or widget, never connects to the sensor, and buzzes when a sensor's trigger counter moves
- The phone is not involved

## Advertising packet

One legacy advertising packet, no scan response. **[spec]**

| Part | Bytes | Content |
|---|---|---|
| Flags | 3 | Added by the firmware **[doc]** |
| Manufacturer data header | 4 | Length, type `0xFF`, company ID `0x0590` little-endian |
| Payload | 10 | The table below |

That is 17 of the 31 bytes a legacy packet holds. The device name is left out (`showName:false`) in normal use so the packet stays one size. **[spec]**

Company ID `0x0590` is registered to Pur3 Ltd, and Espruino's reference offers it for user data on official Espruino devices, which a Puck.js is. **[doc]** Since 2v26 every Espruino device advertises `0x0590` with no data by default **[doc]**, so the company ID alone does not identify this protocol. The magic byte does.

### Payload, version 1

| Byte | Field | Values |
|---|---|---|
| 0 | Magic | `0x4D`. Anything else is not this protocol |
| 1 | Protocol version | `1` |
| 2 | Sensor ID | `1` to `254`. `0` and `255` are reserved. The first sensor is `1` |
| 3 to 4 | Boot ID | 16-bit, little-endian, random at every power-up or reset |
| 5 | Flags | Bit table below |
| 6 to 7 | Trigger counter | 16-bit, little-endian. `0` at boot, plus one per trigger, wraps from 65535 to 0 |
| 8 | Battery | Percent, `0` to `100`. `255` means unknown |
| 9 | Age | Tenths of a second since the last trigger when the packet's data was set, capped at `255`. `255` also means no trigger since boot |

All of it is **[spec]**. It differs from the brief's starting layout in three ways, each deliberate:

- **A magic byte was added**, for the reason above
- **The boot ID is 16 bits, not 8.** With 8 bits, one battery change in 256 would reuse the old boot ID with the counter back at 0, and the watch would read that as a stale packet and ignore the sensor until the counter caught up
- **A development-build flag was added**, so a build with an open console is visible on the air as well as at boot

### Test vector

Sensor 1, boot ID `0xBEEF`, armed, counter 258, battery 87%, 1.2 s after its last trigger:

```
4D 01 01 EF BE 01 02 01 57 0C
```

`firmware/test-core.js` checks the encoder against these bytes.

### Flags

| Bit | Name | Meaning |
|---|---|---|
| 0 | `ARMED` | The PIR is powered and triggers count |
| 1 | `SETTLING` | Armed, but the PIR is still warming up and its output is ignored. Only set together with `ARMED` |
| 2 | `DISARMING` | The owner switched the sensor off. It will stop advertising shortly. `ARMED` is clear |
| 3 | `MAINT` | The maintenance window is open: the sensor is connectable and the console is reachable |
| 4 | `LOW_BATT` | Battery below the low threshold. The threshold is set after the used-cell bench test (`mobile-motion-sensor-il4`) |
| 5 | `DEV` | Development build: the console is always reachable. Never set in a field build |
| 6 to 7 | Reserved | Sent as 0. A version 1 receiver ignores them |

### Sensor states

| State | Flags | Advertising |
|---|---|---|
| Off | none sent | None. The radio is asleep |
| Settling | `ARMED` + `SETTLING` | Heartbeat |
| Armed | `ARMED` | Heartbeat, with a trigger burst after each trigger |
| Disarming | `DISARMING` | One burst, then Off |

`MAINT`, `LOW_BATT` and `DEV` can accompany any state. A sensor that is Off with the maintenance window open advertises with `MAINT` alone.

## Counter and boot ID rules

**[spec]**

- The counter moves only forward, by exactly one per trigger. It is not reset by arming or disarming, only by a reboot
- The watch keeps, per sensor ID: boot ID, last counter, last flags and the time it last heard the sensor
- Same boot ID: let `d = (received - last) & 0xFFFF`
  - `d == 0`: nothing new
  - `1 <= d <= 32767`: `d` triggers happened. Buzz once, log `d`, store the new counter. A `d` above 1 means the watch missed triggers, which the log must show
  - `d >= 32768`: the packet is older than what the watch has. Ignore it and log it once
- Different boot ID, or a sensor ID with no stored record: adopt the received boot ID and counter as the new baseline. Buzz only if `ARMED` is set, the counter is not 0 and the age is under 255, which means a trigger happened in the last 25 seconds and the watch has no record of having reported it
- The watch's record must survive `load()`, which resets the interpreter on every app switch (`../my-bangle/docs/bangle2-limits.md`, "What costs RAM"). It is written to Storage when it changes and on `E.on("kill")`. If the record is lost anyway, the rule above still catches a recent trigger

## Timing

Starting values. All **[unverified]**, and all meant to be replaced by measurements.

### The constraint that sets everything

The watch saves power by scanning in short windows. A window catches a packet only if the sensor transmits during it. The sensor sends on all three advertising channels in each advertising event and the scanner listens on one channel per window, so the channel does not matter, but the timing does:

- **The scan window must be longer than the burst's advertising interval plus 10 ms.** The 10 ms is the random delay the Bluetooth spec adds to every advertising event. Then every window contains at least one whole advertising event
- **A burst must last longer than the scan interval plus one window.** Then at least one whole window falls inside every burst
- Worst-case radio latency is then one scan interval, so the scan interval must fit inside 2 seconds minus the sensor's own delay from motion to its output rising. That delay is unknown. Adafruit describes these small PIRs as slower to trigger than its larger modules **[unverified]**

### Open question: how fast may a non-connectable burst advertise?

The brief assumed 20 ms. Espruino's reference says of `NRF.setAdvertising`: "Non-`connectable` advertising can't have an advertising interval less than 100ms according to the BLE spec." **[doc]** That limit comes from Bluetooth 4.x and was dropped in Bluetooth 5, so the note may be out of date for the Puck's firmware, or the firmware may still enforce it. It decides the watch's battery cost, because the scan window has to outlast the interval:

| If the burst interval can be | Scan window | Duty at a 1000 ms scan interval | Predicted extra watch current |
|---|---|---|---|
| 20 ms | 40 ms | 4% | about 0.26 mA |
| 100 ms | 120 ms | 12% | about 0.78 mA |

The prediction is duty times the 6.5 mA receive current the brief quotes from Nordic. Espruino's own reference says scanning draws "12mA or so" **[doc]**, which would double both figures. The brief puts the watch's everyday draw near 0.3 mA, so the first row roughly halves battery life and the second cuts it to about a quarter. None of this is measured.

The first session with a Puck measures the smallest non-connectable interval the firmware accepts and actually transmits at (`mobile-motion-sensor-3ph`). If 100 ms is the floor, one alternative is a burst that is connectable at 20 ms where the sensor drops any connection at once and still exposes no console. That weakens "accepts no connections" to "holds no connections", so it goes to the owner before it is adopted.

### Starting values

| Item | Value | Why |
|---|---|---|
| Trigger burst | Fastest allowed interval, for 3 s | Three scan intervals, so two windows can be lost to interference and the trigger still arrives |
| Heartbeat while settling or armed | A 1.2 s burst at the burst interval, every 10 s | See below |
| Disarm burst | Burst interval, for 3 s, with `DISARMING` set, then stop advertising | The watch must hear "switched off" or it will report the sensor lost |
| Age field refresh | Every 200 ms during a trigger burst, and at each heartbeat | Bounds the latency log's error at 0.2 s |
| Watch scan | Passive, window from the table above, interval 1000 ms | Leaves 1 s of the 2 s bar for the sensor's own delay |
| Lost threshold | 35 s unheard, which is three missed heartbeats | Close to the 30 s the brief proposes |

### Why the heartbeat is a short burst and not a steady beacon

The brief describes "a steady heartbeat". A steady slow beacon is received badly by a duty-cycled scanner, because each advertising event only lands in a scan window with probability equal to the duty cycle:

- At a 4% duty and a 375 ms beacon, the watch hears one packet about every 9 s on average, and goes 30 s without hearing any about 4% of the time
- That would raise the lost-sensor buzz on a sensor that is working, several times an hour

A 1.2 s burst is longer than the scan interval plus a window, so every heartbeat is heard unless the radio path fails. It costs more sensor power than a beacon: 60 packets per 10 s is about as many as a steady 170 ms beacon. Espruino lists 22 µA for a steady 375 ms non-connectable beacon **[doc]**, so the armed sensor may draw about twice that. On a CR2032 that is still months of continuous arming, but it is a guess until the current is measured (`mobile-motion-sensor-c5s`).

The alternative in the brief, two scan rates on the watch, stays open. It trades sensor power for watch complexity and is worth trying only if the measured numbers call for it.

## Watch rules

**[spec]**

- Scan with a filter on company ID `0x0590`. `NRF.setScan` accepts `{ filters: [{ manufacturerData: { 0x0590: {} } }] }` **[doc]**, and `window` and `interval` in milliseconds since firmware 2v22 **[doc]**. The watch runs 2v29
- Drop any packet whose payload is not 10 bytes or more with magic `0x4D`. A payload longer than 10 bytes with version 1 is read as version 1 and the extra bytes are ignored
- Drop any packet with a version the watch does not know, and log the version once per sensor ID
- Act only on sensor IDs listed in the watch's configuration. Log others once. Adding a second sensor is adding its ID to that list
- **Trigger**: the counter rule above. Buzz, no popup, regardless of quiet mode
- **Switched off**: on `DISARMING`, mark the sensor off. No alert, and no lost-sensor alert later
- **Lost**: a sensor last heard with `ARMED` set and not heard for longer than the lost threshold raises the lost-sensor buzz once. Hearing it again clears the state
- **Log** to Storage: every trigger with sensor ID, boot ID, counter, `d`, age and receive time; every scan start; every lost and regained event. The age at the first packet of a new counter is the radio latency for that alert, which needs no synchronised clocks

Buzz patterns, repeat behaviour and the arming confirmation are owner decisions (`mobile-motion-sensor-cp9`).

On the watch build captured in `../my-bangle/snapshots/20261116T185607Z`, quiet mode is applied by each caller: the `messages` library and `notify` both read `quiet` from `setting.json` before they buzz or light the screen. Nothing in that capture shows `Bangle.buzz` itself checking it, but `.boot0` is not in the capture, so whether quiet mode or the separate Vibration setting can silence a direct `Bangle.buzz` call is not known. `mobile-motion-sensor-u1o` measures it.

## Security

- The payload carries no secret, and there is none anywhere in this design
- In a field build the sensor is not connectable and has no console service. In a maintenance window, opened by a long press on the sensor's button, it is connectable and says so with `MAINT`. Physical access is the credential
- **Anyone in range can forge or replay a broadcast.** What the counter rule gives: a replayed old trigger is ignored, because its counter is not ahead. What it does not give: a forger can send a higher counter and make the watch buzz, can send `DISARMING` to suppress a lost-sensor alert until the next real heartbeat, or can pick a new boot ID. Proposed position: accept and document. This is the owner's decision (`mobile-motion-sensor-e1y`)
- The sensor's Bluetooth address is visible to anything scanning, as with any beacon

## Reserved for candidate B

Only used if the gate picks a held connection. Generated with `uuidgen` on 2026-11-16. Never the Nordic UART service.

| Item | UUID |
|---|---|
| Motion sensor service | `cc3c3693-1ae7-4d8c-9f84-4ee8f81a5390` |
| Trigger count characteristic (read, notify) | `9650de20-654a-43c5-be74-5b29370ae423` |

The characteristic's value would be the same 10-byte payload, so the watch's decoder is shared.

## Changing this protocol

- A change a version 1 watch can safely ignore (a new flag in bits 6 to 7, bytes appended after byte 9) keeps version 1
- Any other change takes a new version number. The watch rejects versions it does not know, so update the watch first
