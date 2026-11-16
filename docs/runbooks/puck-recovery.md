# Puck.js recovery

What to do when a Puck.js v2 cannot be reached over Bluetooth: a field build with its console removed, a program that crashes at boot, or one that never advertises.

**Unverified as of 2026-11-16.** This was written from `https://www.espruino.com/Puck.js`, read that day, before any Puck was in hand. The quoted lines are Espruino's. `mobile-motion-sensor-9n7` runs both button paths on the real board, and the LED behaviour and timings here get corrected from what is seen then. **No field build is flashed until that issue is closed.**

## Before reaching for this

In order, cheapest first:

1. **Open the maintenance window.** A long press on the button makes a field build connectable with its console for a few minutes. If that works, nothing below is needed
2. **Plain reset.** Reboots and runs the saved code again. Fixes a hang, not a bad program
3. **Skip saved code.** Boots clean once, without erasing anything. Use it to get a console on a board whose saved program is the problem
4. **Hard reset.** Erases the saved program. Last resort

## What a normal power-up looks like

> "As the battery is inserted the red LED should flash once, very briefly."

> "If the green LED lights or red stays lit, it is because you have accidentally pressed the button down"

If that happens, take the battery out and put it back without touching the button. The button sits beside the battery holder, so it is easy to press while seating the cell.

## Plain reset

Saved code is kept and runs again.

1. Slide a fingernail between the battery and the board
2. Lift the battery off its contact for 1 second and let go
3. The red LED flashes once: the Puck has rebooted

## Skip saved code, without erasing it

For a saved program that locks you out or crashes. The program stays in flash and runs again at the next reset.

1. Hold the button down
2. Do a plain reset while holding it
3. The green LED lights, then all three LEDs light
4. **Release the button while all three LEDs are on**
5. A self-test runs. Espruino: "The green LED will blink on success, or red on failure."
6. The Puck is now running with no saved code loaded. Espruino: "Saved code will not be loaded from flash, but will not be erased from flash either"
7. Connect from the Web IDE and fix or replace the program. Until you do, "a subsequent reset will start Espruino up loading the saved code as normal."

Not yet known, to record at the bench: how long the all-three-LEDs stage lasts, and so how much time there is to let go.

## Hard reset: erase the saved program

This cannot be undone. The firmware on the sensor is in this repo, so what is lost is only what was on the board. The brief says a hard reset also erases Bluetooth bonding data; the passage read on 2026-11-16 mentions only saved code. The sensor design uses no bonding, so it does not matter here, but check before relying on it elsewhere.

1. Hold the button down
2. Do a plain reset while holding it, and **keep holding for about 10 seconds**
3. Espruino: "The green LED should light, followed by all 3 LEDs, then the red LED will blink 5 times."
4. Espruino: "Release the button at least 1 second after the blinking has stopped - this will clear out any previously saved code"
5. Connect from the Web IDE. The Puck should answer as a factory-fresh board
6. Upload the firmware again

## Rules that keep these paths working

- **The firmware never gives the button a job at power-up.** Espruino already uses button-held-at-power-up for everything above. A feature there would make recovery ambiguous
- **A field build always has the long-press maintenance window.** It is the first line of recovery, and the button paths are the backstop for when the program is too broken to service a long press
- **Do not flash a field build on a board whose recovery paths have not been run.** That is what `mobile-motion-sensor-9n7` is for
