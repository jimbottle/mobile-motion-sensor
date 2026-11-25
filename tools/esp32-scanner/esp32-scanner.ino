/* A listener that never sleeps, for measuring what a transmitter really sends.
 *
 * The Puck may accept an advertising interval and transmit at another
 * (docs/protocol.md, "Open question"). This scans continuously and prints one
 * line per advertising packet that carries manufacturer data on company ID
 * 0x0590, with the time it arrived. The gaps between lines are the interval
 * on the air. First use: mobile-motion-sensor-3ph.
 *
 * What it can and cannot show: a scanner sits on one of the three advertising
 * channels at a time and each advertising event is sent on all three, so a
 * continuous scan should catch most events, not all. Read the SMALLEST common
 * gap as the interval; larger gaps are missed packets. The times are stamped
 * when the callback runs, so expect a few ms of jitter on top of the 0 to
 * 10 ms random delay the Bluetooth spec adds to every event.
 *
 * Board: ESP32-C3-DevKit-RUST-2 (Adafruit 5787), the same board as
 * tools/esp32-advertiser. Flashing one replaces the other. Build, from the
 * repo root:
 *
 *   arduino-cli compile --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc tools/esp32-scanner
 *
 * Serial, 115200. Output, one line per packet:
 *
 *   P,<micros>,<address>,<rssi>,<manufacturer data after the company ID, hex>
 *
 * Commands, one per line:
 *
 *   m            only packets whose data starts with the protocol's magic 0x4D
 *   e            every packet on company ID 0x0590 (default)
 *   c            print  C,<seen>,<printed>,<free heap bytes>  and zero the two
 *                counts. The free heap must stay flat over a long run
 */
#include <BLEDevice.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>

static volatile bool magicOnly = false;
static volatile uint32_t seen = 0, printed = 0;

class Listener : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice dev) override {
    uint32_t at = micros();
    seen++;
    // The library keeps an entry per address and, with duplicates on, appends
    // every packet's bytes to it, so memory would grow for as long as the scan
    // runs. `dev` is a deep copy, so the library's entry can go now. Nothing
    // in core 3.3.12's handleGAPEvent reads it after this callback returns.
    BLEDevice::getScan()->erase(dev.getAddress());
    if (!dev.haveManufacturerData()) return;
    String m = dev.getManufacturerData();
    if (m.length() < 2 || (uint8_t)m[0] != 0x90 || (uint8_t)m[1] != 0x05) return;
    if (magicOnly && (m.length() < 3 || (uint8_t)m[2] != 0x4D)) return;
    printed++;
    Serial.printf("P,%lu,%s,%d,", (unsigned long)at, dev.getAddress().toString().c_str(), dev.getRSSI());
    for (unsigned i = 2; i < m.length(); i++) Serial.printf("%02X", (uint8_t)m[i]);
    Serial.println();
  }
};

void setup() {
  Serial.begin(115200);
  BLEDevice::init("");
  BLEScan *scan = BLEDevice::getScan();
  scan->setAdvertisedDeviceCallbacks(new Listener(), true);   // true: report every packet, not one per device
  scan->setActiveScan(false);                                  // passive, like the watch
  scan->setInterval(100);
  scan->setWindow(100);                                        // window == interval: always listening
  delay(1500);                                                 // let USB serial come up
  Serial.println("scanner for company ID 0x0590. m = magic 0x4D only, e = everything, c = counts");
  if (!scan->start(0, nullptr, false)) Serial.println("! scan did not start");
}

void loop() {
  static String line;
  while (Serial.available()) {
    char ch = Serial.read();
    if (ch != '\n' && ch != '\r') { if (line.length() < 20) line += ch; continue; }
    line.trim();
    if (line == "m") { magicOnly = true; Serial.println("magic 0x4D only"); }
    else if (line == "e") { magicOnly = false; Serial.println("every 0x0590 packet"); }
    else if (line == "c") {
      Serial.printf("C,%lu,%lu,%lu\n", (unsigned long)seen, (unsigned long)printed, (unsigned long)ESP.getFreeHeap());
      seen = 0; printed = 0;
    } else if (line.length()) Serial.println("? m e c");
    line = "";
  }
  delay(5);
}
