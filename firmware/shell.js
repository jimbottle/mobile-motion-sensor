/* The Puck.js hardware around firmware/core.js: pins, timers, LEDs, radio.
 *
 * core.js decides; this file only turns hardware events into core events and
 * makes the hardware match core.view(). It is not uploaded on its own:
 * tools/build-puck.js joins it to core.js and puts a CONFIG line on top.
 *
 * NOT RUN ON A PUCK as of 2026-11-24. firmware/test-shell.js runs it in Node
 * against stand-ins for Espruino's globals, which checks the wiring between
 * this file and core.js and nothing about a real board.
 *
 * Wiring (docs/brief-2026-11-16.md, "Wiring to verify"): the PIR's power pin
 * on D2, its output on D1, its ground on GND.
 *
 * CONFIG, set by the build:
 *   core           overrides for core.js DEFAULTS, e.g. {dev:true}
 *   buttonTrigger  true: while armed, a short press counts as a trigger
 *                  instead of disarming. For proving the radio and the watch
 *                  with no PIR attached. Never in a field build.
 *   log            true: keep an event log in Storage (see logEv below)
 *
 * ES5 only, like core.js.
 */
var core = require("core");

var PIR_POWER = D2, PIR_OUT = D1;

var s = core.create(CONFIG.core);
var wakeTimer, pirWatch, pirOn = false, radioAwake = true, lastAdv = "";

function now() { return Math.round(getTime() * 1000); }

/* The event log, for working out afterwards what the sensor did when nobody
 * was connected. A StorageFile named LOG, one line per event:
 *
 *   <the Puck's clock in ms>,<letter>,<a>,<b>
 *
 *   B  started: battery percent, boot ID
 *   K  button released: ms held, mode afterwards
 *   P  PIR output changed: level, trigger counter afterwards
 *   M  mode changed: from, to   (0 off, 1 settling, 2 armed, 3 disarming)
 *   L  the trigger limit disarmed the sensor: counter
 *   H  every ten minutes: battery percent, free variables, error flags if any
 *   X  an uncaught error: its text
 *
 * The clock is getTime(): it starts from zero when the battery goes in, not
 * at every B line, and it jumps if anything sets the Puck's time (the Web IDE
 * does on connect). Ordinary events stop at LOG_MAX bytes, keeping the oldest;
 * X lines may run LOG_X_RESERVE bytes past that, so an error is still
 * recorded when the log is full. Any Storage error turns logging off: the
 * log must never be what stops the sensor.
 * To clear it while the program runs, reset the count too, or it goes on
 * counting the erased bytes:
 *   require("Storage").open("mslog","w").erase(); logLen = 0; logOff = !CONFIG.log;
 */
var LOG = "mslog", LOG_MAX = 16000, LOG_X_RESERVE = 1000, logLen = 0, logOff = !CONFIG.log;

function logEv(letter, a, b) {
  if (logOff) return;
  var line = now() + "," + letter + (a === undefined ? "" : "," + a) + (b === undefined ? "" : "," + b) + "\n";
  if (logLen + line.length > LOG_MAX + (letter === "X" ? LOG_X_RESERVE : 0)) return;
  try { require("Storage").open(LOG, "a").write(line); logLen += line.length; } catch (e) { logOff = true; }
}

/* How much is already in the log, by reading it: this does not depend on
 * which firmware versions have StorageFile.getLength(). */
function logSize() {
  var n = 0;
  try {
    var f = require("Storage").open(LOG, "r"), part;
    while ((part = f.read(512)) !== undefined) n += part.length;
  } catch (e) { logOff = true; }
  return n;
}

function play(fx) {
  if (fx === "led:arm") digitalPulse(LED2, 1, 300);            // green
  else if (fx === "led:disarm") digitalPulse(LED1, 1, 300);    // red
  else if (fx === "led:limit") digitalPulse(LED1, 1, [150, 150, 150, 150, 150]);   // red, three times
  else if (fx === "led:maint-open") digitalPulse(LED3, 1, [300, 150, 300]);   // blue, twice
  else if (fx === "led:maint-close") digitalPulse(LED3, 1, 300);
}

function onPir(e) { event({ t: "pir", level: e.state }); }

/* Make the hardware match what core.js wants right now. */
function apply() {
  var t = now(), v = core.view(s, t);

  if (v.pirPower !== pirOn) {
    pirOn = v.pirPower;
    if (pirOn) {
      PIR_POWER.write(1);
      // Pulled down so a loose or missing wire reads low, not noise.
      pinMode(PIR_OUT, "input_pulldown");
      pirWatch = setWatch(onPir, PIR_OUT, { repeat: true, edge: "both" });
      var level = PIR_OUT.read();
      core.step(s, { t: "pir", now: t, level: level });
      logEv("P", level ? 1 : 0, "on");     // the level right after power-on, not an edge
    } else {
      clearWatch(pirWatch);
      PIR_POWER.write(0);
    }
  }

  if (!v.adv) {
    if (radioAwake) { NRF.sleep(); radioAwake = false; lastAdv = ""; }
  } else {
    if (!radioAwake) { NRF.wake(); radioAwake = true; }
    var key = v.adv.interval + (v.adv.connectable ? "c" : "n") + v.adv.payload.join(",");
    if (key !== lastAdv) {
      lastAdv = key;
      NRF.setAdvertising({}, {
        showName: false,
        manufacturer: 0x0590,
        manufacturerData: v.adv.payload,
        interval: v.adv.interval,
        connectable: v.adv.connectable
      });
    }
  }

  if (wakeTimer) clearTimeout(wakeTimer);
  wakeTimer = undefined;
  var w = core.nextWake(s, t);
  if (w !== null) wakeTimer = setTimeout(tick, Math.max(1, w - t));
}

function event(ev) {
  ev.now = now();
  var before = s.counter, mode = s.mode;
  var fx = core.step(s, ev);
  for (var i = 0; i < fx.length; i++) {
    play(fx[i]);
    if (fx[i] === "led:limit") logEv("L", s.counter);
  }
  if (ev.t === "pir") logEv("P", ev.level ? 1 : 0, s.counter);
  else if (ev.t === "button") logEv("K", ev.heldMs, s.mode);
  if (s.mode !== mode) logEv("M", mode, s.mode);
  // Development builds show each counted trigger, so "the sensor saw it" and
  // "the watch heard it" can be told apart at the bench.
  if (s.cfg.dev && s.counter !== before) digitalPulse(LED3, 1, 40);
  apply();
}

function tick() { wakeTimer = undefined; event({ t: "tick" }); }

function onButton(e) {
  var heldMs = Math.round((e.time - e.lastTime) * 1000);
  if (CONFIG.buttonTrigger && s.mode === core.ARMED && heldMs < s.cfg.longPressMs) {
    if (heldMs < s.cfg.minPressMs) return;
    event({ t: "pir", level: 1 });
    event({ t: "pir", level: 0 });
    return;
  }
  event({ t: "button", heldMs: heldMs });
}

/* Safe to run more than once. Espruino's save() keeps live watches and
 * timers and runs onInit() again at every boot, so if this had already run
 * before a save() there would be two button watches, and one press would arm
 * and then disarm. Every watch and timer on the board belongs to this file,
 * so start by clearing them all and going back to a fresh state. */
function start() {
  clearWatch();
  clearInterval();
  clearTimeout();
  if (!radioAwake) NRF.wake();
  s = core.create(CONFIG.core);
  wakeTimer = undefined; pirOn = false; radioAwake = true; lastAdv = "";
  PIR_POWER.write(0);
  core.step(s, { t: "boot", now: now(), bootId: E.hwRand() & 0xFFFF, battery: E.getBattery() });
  logOff = !CONFIG.log;
  if (!logOff) logLen = logSize();
  logEv("B", s.battery, s.bootId);
  process.removeAllListeners("uncaughtException");
  // Catching an error here stops Espruino printing it, so print it as well:
  // the console is the first place anyone looks at the bench.
  process.on("uncaughtException", function (e) { print("Uncaught", e); logEv("X", String(e)); });
  // The button reads high while pressed, so a falling edge is the release
  // and e.lastTime is when it went down.
  setWatch(onButton, BTN, { repeat: true, edge: "falling", debounce: 25 });
  setInterval(function () {
    event({ t: "battery", pct: E.getBattery() });
    var flags = E.getErrorFlags();
    logEv("H", s.battery, process.memory().free + (flags.length ? "," + flags.join("+") : ""));
  }, 600000);
  // A development build says so at every start: red, green and blue together.
  if (s.cfg.dev) { digitalPulse(LED1, 1, 150); digitalPulse(LED2, 1, 150); digitalPulse(LED3, 1, 150); }
  apply();
}

function onInit() { start(); }
