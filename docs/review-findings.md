# Review findings

Defects that code review (roborev) caught after a change was committed: what was wrong, how it was fixed, and the rule that would have prevented it. Newest first. The watch-side code has its own file, `../my-bangle/docs/review-findings.md`.

A finding goes here when it was **valid**: it described a real defect, and fixing it changed a file. Rejected findings stay in the review's own comment thread.

## Recurring patterns

Check these before committing.

- **A library call used from its header, without reading what it keeps.** A signature says what a call takes, not what it stores between calls. Before a loop or callback runs for an unbounded time, read the library's handler for anything that accumulates. Review 7681 #1

## 2026-11-24

### Review 7681 of `9d716b5`, `tools/esp32-scanner/esp32-scanner.ino`

- **High. Valid.** The scanner asked for every packet (duplicates on) and never removed devices from the library's result map. In core `esp32:esp32` 3.3.12 the map keeps one entry per address and appends each packet's bytes to it, so memory would have grown for as long as the scan ran, and the by-value copy into the callback would have grown with it, adding delay to the very gaps being measured. I had checked the scan API's signatures and the meaning of a zero duration, not what `handleGAPEvent` stores. **Fixed:** the callback erases the library's entry for every packet (the callback's argument is a deep copy, checked in `BLEAdvertisedDevice.cpp`), and the `c` command prints the free heap. **Not yet verified on a board:** the check is a flat free-heap figure over a 10-minute scan near the Puck
