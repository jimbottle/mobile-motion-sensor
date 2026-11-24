# Review findings

Defects that code review (roborev) caught after a change was committed: what was wrong, how it was fixed, and the rule that would have prevented it. Newest first. The watch-side code has its own file, `../my-bangle/docs/review-findings.md`.

A finding goes here when it was **valid**: it described a real defect, and fixing it changed a file. Rejected findings stay in the review's own comment thread.

## Recurring patterns

Check these before committing.

- **"Read back identical" proves the copy, not the source.** A byte-for-byte read-back passes for the wrong file as readily as for the right one. Validate what is about to be sent before the destructive step. Review 7687 #1
- **A procedure that worked, left in the session that ran it.** If a record says a tool did something, the code that did it has to be in the tool. Before committing a result, check that every step that produced it can be repeated from the repo. Review 7685 #1
- **A stand-in that models less than the platform does.** The Node stand-ins for Espruino had no `save()`, so a bug that only exists across `save()` passed. When a test double leaves out a platform behaviour the instructions rely on, say so next to the instructions or model it. Review 7683 #1
- **A library call used from its header, without reading what it keeps.** A signature says what a call takes, not what it stores between calls. Before a loop or callback runs for an unbounded time, read the library's handler for anything that accumulates. Review 7681 #1

## 2026-11-24

### Review 7687 of `5f0bdf3`, `tools/puck-console/index.html`

- **Medium. Valid.** `puck.upload` did not check the HTTP status of the file it fetched. A wrong path would have erased the program on the Puck and stored the server's 404 page in its place, reporting success because the read-back matched. **Fixed:** the fetch is checked, and the body must be non-empty ASCII, before the erase is sent. Syntax-checked in Node; not run against a Puck

### Review 7685 of `37a8940`, `tools/puck-console/index.html`

- **Medium. Valid.** The changelog credited the page with the chunked upload, the read-back and the `.bootcde`, but those were typed into the browser session and never committed, so the next session could not have repeated the procedure from the repo. **Fixed** in `5f0bdf3`: `puck.ask`, `puck.upload`, `puck.run` and `puck.persist` are in the page. Syntax-checked in Node; not run against a Puck since being committed

### Review 7683 of `2aa0fb9`, `firmware/shell.js` and `tools/build-puck.js`

- **Medium. Valid.** The build header said to call `onInit()` to try the program and `save()` to keep it. Espruino's `save()` keeps live watches and timers and runs `onInit()` again at boot, so that sequence would have left two button watches: one press arms, then disarms. **Fixed:** `start()` clears every watch and timer and rebuilds its state each time it runs. Two checks and two mutants in `firmware/test-shell.js`. Not verified on a board
- **Low. Noted, not fixed in code.** The Web IDE sets the Puck's clock on connect, which would jump the firmware's deadlines. The build header now says not to let it. A clock of the shell's own is the real fix if the IDE is ever used with a saved build

### Review 7681 of `9d716b5`, `tools/esp32-scanner/esp32-scanner.ino`

- **High. Valid.** The scanner asked for every packet (duplicates on) and never removed devices from the library's result map. In core `esp32:esp32` 3.3.12 the map keeps one entry per address and appends each packet's bytes to it, so memory would have grown for as long as the scan ran, and the by-value copy into the callback would have grown with it, adding delay to the very gaps being measured. I had checked the scan API's signatures and the meaning of a zero duration, not what `handleGAPEvent` stores. **Fixed:** the callback erases the library's entry for every packet (the callback's argument is a deep copy, checked in `BLEAdvertisedDevice.cpp`), and the `c` command prints the free heap. **Not yet verified on a board:** the check is a flat free-heap figure over a 10-minute scan near the Puck
