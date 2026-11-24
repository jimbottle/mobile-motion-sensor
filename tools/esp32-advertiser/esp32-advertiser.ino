/* A stand-in for the motion sensor's radio, for testing the watch.
 *
 * It advertises the protocol v1 payload (docs/protocol.md) as manufacturer
 * data on company ID 0x0590, and does what it is told over USB serial. It has
 * no PIR and no button: "t" is a trigger. Its job is the latency and loss
 * trials (mobile-motion-sensor-xx0), where the watch needs a transmitter
 * whose counter changes at a moment this side can print.
 *
 * It is NOT the sensor. It says nothing about what a Puck.js can do: its
 * fastest advertising interval, its range and its current are its own.
 *
 * Board: ESP32-C3-DevKit-RUST-2 (Adafruit 5787). Build, from the repo root:
 *
 *   arduino-cli compile --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc tools/esp32-advertiser
 *
 * Serial, 115200, one command per line:
 *
 *   a            arm: heartbeat bursts start, flags = ARMED
 *   d            disarm: one burst with DISARMING, then the radio stops
 *   t            trigger: counter + 1, then a trigger burst
 *   n <count> <gap_ms>   run <count> triggers, <gap_ms> apart plus up to 1 s
 *                        of random extra, so they do not lock to the watch's
 *                        scan interval
 *   i <ms>       advertising interval inside any burst (default 20)
 *   b <ms>       trigger burst length (default 3000)
 *   h <ms> <period_ms>   heartbeat burst length and period (default 1200 10000)
 *   id <n>       sensor ID (default 1)
 *   r            new random boot ID and counter 0, as if the sensor restarted
 *   s            print the settings and the current payload
 *   x            stop any run started with n
 *
 * Every trigger prints  T,<millis>,<counter>  at the moment the counter
 * changes. The watch's log carries the age byte from the packet it caught,
 * which is this board's own measure of how long after that moment the packet
 * went out, so the two clocks never need to agree.
 */
#include <BLEDevice.h>
#include <BLEAdvertising.h>

static const uint8_t F_ARMED = 1, F_DISARMING = 4;

static BLEAdvertising *adv;
static uint8_t sensorId = 1;
static uint16_t bootId, counter = 0;
static bool armed = false, disarming = false, radioOn = false;
static bool haveTrigger = false;
static uint32_t lastTriggerAt = 0;
static uint32_t advUntil = 0, nextBeat = 0, lastRefresh = 0, radioRetryAt = 0;
static uint32_t burstInterval = 20, burstMs = 3000, beatMs = 1200, beatPeriod = 10000;
static uint32_t runLeft = 0, runGap = 0, runNext = 0;

static void buildPayload(uint8_t *p, uint32_t now) {
  uint32_t age = 255;
  if (haveTrigger) { age = (now - lastTriggerAt) / 100; if (age > 255) age = 255; }
  uint8_t flags = disarming ? F_DISARMING : (armed ? F_ARMED : 0);
  p[0] = 0x4D; p[1] = 1; p[2] = sensorId;
  p[3] = bootId & 0xFF; p[4] = bootId >> 8;
  p[5] = flags;
  p[6] = counter & 0xFF; p[7] = counter >> 8;
  p[8] = 100;            // battery: this board is on USB
  p[9] = (uint8_t)age;
}

/* Put the current payload on the air. Safe to call while advertising. */
static void refresh(uint32_t now) {
  uint8_t p[10];
  buildPayload(p, now);
  String m;
  m += (char)0x90; m += (char)0x05;          // company ID 0x0590, little-endian
  for (int i = 0; i < 10; i++) m += (char)p[i];
  BLEAdvertisementData d;
  d.setFlags(0x06);
  d.setManufacturerData(m);
  if (!adv->setAdvertisementData(d)) Serial.println("! advertising data rejected");
  lastRefresh = now;
}

/* radioOn is what the radio is doing, not what was asked for. If start() fails
 * it stays false, so status and the age refresh never claim a burst that is
 * not on the air, and the next try waits a second so the message is not
 * printed every loop. */
static void radio(bool on, uint32_t now) {
  if (on == radioOn) return;
  if (!on) {
    adv->stop();
    radioOn = false;
    return;
  }
  if ((int32_t)(now - radioRetryAt) < 0) return;
  uint16_t units = (uint16_t)((burstInterval * 1000UL) / 625UL);   // 0.625 ms units
  adv->setMinInterval(units);
  adv->setMaxInterval(units);
  refresh(now);
  if (adv->start()) {
    radioOn = true;
  } else {
    radioRetryAt = now + 1000;
    Serial.printf("! advertising did not start at %lu ms interval, retry in 1 s\n", (unsigned long)burstInterval);
  }
}

static void trigger(uint32_t now) {
  if (!armed) { Serial.println("! not armed, trigger ignored"); return; }
  counter++;
  haveTrigger = true;
  lastTriggerAt = now;
  if (now + burstMs > advUntil) advUntil = now + burstMs;
  Serial.printf("T,%lu,%u\n", (unsigned long)now, counter);
  if (radioOn) refresh(now);
}

static void status(uint32_t now) {
  uint8_t p[10];
  buildPayload(p, now);
  Serial.printf("id=%u boot=%u counter=%u armed=%d interval=%lu burst=%lu beat=%lu/%lu radio=%d payload=",
                sensorId, bootId, counter, armed, (unsigned long)burstInterval, (unsigned long)burstMs,
                (unsigned long)beatMs, (unsigned long)beatPeriod, radioOn);
  for (int i = 0; i < 10; i++) Serial.printf("%02X ", p[i]);
  Serial.println();
}

static void command(String line, uint32_t now) {
  line.trim();
  if (!line.length()) return;
  int sp = line.indexOf(' ');
  String c = sp < 0 ? line : line.substring(0, sp);
  String rest = sp < 0 ? "" : line.substring(sp + 1);
  rest.trim();
  long a1 = rest.toInt();
  int sp2 = rest.indexOf(' ');
  long a2 = sp2 < 0 ? 0 : rest.substring(sp2 + 1).toInt();

  if (c == "a") {
    armed = true; disarming = false; nextBeat = now;
    Serial.printf("A,%lu\n", (unsigned long)now);
  } else if (c == "d") {
    armed = false; disarming = true; runLeft = 0;
    advUntil = now + 3000;
    if (radioOn) refresh(now);
    Serial.printf("D,%lu\n", (unsigned long)now);
  } else if (c == "t") {
    trigger(now);
  } else if (c == "n" && a1 > 0 && a2 > 0) {
    runLeft = a1; runGap = a2; runNext = now + 1000;
    Serial.printf("run: %ld triggers, %ld ms apart plus up to 1000\n", a1, a2);
  } else if (c == "x") {
    runLeft = 0;
  } else if (c == "i" && a1 >= 20 && a1 <= 10000) {
    burstInterval = a1; radio(false, now); radioRetryAt = now;   // restarts with the new interval on the next loop
  } else if (c == "b" && a1 > 0) {
    burstMs = a1;
  } else if (c == "h" && a1 > 0 && a2 > 0) {
    beatMs = a1; beatPeriod = a2;
  } else if (c == "id" && a1 >= 1 && a1 <= 254) {
    sensorId = a1;
  } else if (c == "r") {
    bootId = esp_random() & 0xFFFF; counter = 0; haveTrigger = false;
  } else if (c != "s") {
    Serial.println("? a d t n i b h id r s x");
    return;
  }
  status(now);
}

void setup() {
  Serial.begin(115200);
  BLEDevice::init("");
  // After init, not before: esp_random() is only truly random once the radio
  // is running. Before that, two power-ups could draw the same boot ID.
  bootId = esp_random() & 0xFFFF;
  adv = BLEDevice::getAdvertising();
  // Accepts no connections and answers no scan requests, like a field build.
  // arduino-esp32 3.3 builds the C3 on NimBLE, so the type is NimBLE's constant.
  adv->setAdvertisementType(BLE_GAP_CONN_MODE_NON);
  adv->setScanResponse(false);
  delay(1500);                                         // let USB serial come up
  Serial.println("motion sensor stand-in, protocol v1. 's' for status, anything else for help");
  status(millis());
}

void loop() {
  static String line;
  uint32_t now = millis();

  while (Serial.available()) {
    char ch = Serial.read();
    if (ch == '\n' || ch == '\r') { command(line, now); line = ""; }
    else if (line.length() < 60) line += ch;
  }

  if (runLeft && (int32_t)(now - runNext) >= 0) {
    trigger(now);
    runLeft--;
    runNext = now + runGap + (esp_random() % 1000);
    if (!runLeft) Serial.println("run: done");
  }

  if (armed && (int32_t)(now - nextBeat) >= 0) {
    if (now + beatMs > advUntil) advUntil = now + beatMs;
    nextBeat = now + beatPeriod;
  }

  bool want = (armed || disarming) && (int32_t)(advUntil - now) > 0;
  if (disarming && !want) disarming = false;           // the disarm burst is over: radio off
  radio(want, now);
  if (radioOn && now - lastRefresh >= 200) refresh(now);   // keeps the age byte current

  delay(2);
}
