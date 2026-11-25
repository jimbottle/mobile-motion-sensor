/* Runs the built Puck file in Node against stand-ins for Espruino's globals.
 *
 *   node firmware/test-shell.js
 *
 * What this checks: that shell.js and core.js fit together, and that the
 * calls the shell makes carry what docs/protocol.md says. What it cannot
 * check: anything about a real Puck. The stand-ins below are my reading of
 * Espruino's API, so a wrong reading passes here and fails on the board.
 */
var vm = require("vm");
var build = require("../tools/build-puck.js").build;

var passed = 0, failed = 0;
function check(name, ok) {
  if (ok) passed++; else failed++;
  console.log((ok ? "  PASS  " : "  FAIL  ") + name);
}

function boot(opts, mutate) {
  var w = { clock: 5000,   // ms, kept whole so a timer due exactly at the end of run() fires
    timers: [], watches: {}, pins: {}, adv: [], sleeps: 0, wakes: 0, pulses: [], pirLevel: 0, intervals: 0, log: "", logThrows: false, handlers: {}, every: null, printed: [] };
  function pin(name) {
    return { name: name,
      write: function (v) { w.pins[name] = v; },
      read: function () { return name === "D1" ? w.pirLevel : 0; } };
  }
  var nextId = 1;
  var g = {
    D1: pin("D1"), D2: pin("D2"), BTN: pin("BTN"), LED1: pin("LED1"), LED2: pin("LED2"), LED3: pin("LED3"),
    getTime: function () { return w.clock / 1000; },
    digitalPulse: function (p) { w.pulses.push(p.name); },
    pinMode: function (p, m) { w.pins[p.name + ".mode"] = m; },
    setWatch: function (fn, p) { w.watches[p.name] = fn; return p.name; },
    clearWatch: function (id) { if (id === undefined) w.watches = {}; else delete w.watches[id]; },
    setTimeout: function (fn, ms) { var id = nextId++; w.timers.push({ id: id, at: w.clock + Math.round(ms), fn: fn }); return id; },
    clearTimeout: function (id) { w.timers = id === undefined ? [] : w.timers.filter(function (t) { return t.id !== id; }); },
    setInterval: function (fn) { w.intervals++; w.every = fn; return 0; },
    clearInterval: function () { w.intervals = 0; },
    E: { hwRand: function () { return 0x1234BEEF; }, getBattery: function () { return 87; }, getErrorFlags: function () { return []; } },
    process: {
      memory: function () { return { free: 2000 }; },
      on: function (name, fn) { w.handlers[name] = fn; },
      removeAllListeners: function (name) { delete w.handlers[name]; }
    },
    NRF: {
      setAdvertising: function (d, o) { w.adv.push(o); },
      sleep: function () { w.sleeps++; }, wake: function () { w.wakes++; }
    },
    Modules: { cache: {}, addCached: function (id, fn) { g.Modules.cache[id] = fn; } },
    require: function (id) {
      if (id === "Storage") return { open: function (name, mode) {
        if (w.logThrows) throw new Error("storage full");
        var at = 0;
        return { write: function (t) { w.log += t; },
                 read: function (n) { if (at >= w.log.length) return undefined; var p = w.log.substr(at, n); at += n; return p; } };
      } };
      var exports = {};
      // The module function reads the free variable `exports`, as it does on Espruino.
      vm.runInContext("(function(exports){(" + g.Modules.cache[id].toString() + ")();})", ctx)(exports);
      return exports;
    },
    print: function () { w.printed.push(Array.prototype.join.call(arguments, " ")); },
    Math: Math, JSON: JSON
  };
  var ctx = vm.createContext(g);
  if (opts && opts.before) opts.before(w);
  var src = build(opts || {});
  if (mutate) { var m = mutate(src); if (m === src) throw new Error("mutant changed nothing"); src = m; }
  vm.runInContext(src + "\nonInit();", ctx);
  w.g = g;
  /* Move the clock forward, firing timers that come due, in order. */
  w.run = function (ms) {
    var end = w.clock + ms;
    for (;;) {
      var due = w.timers.filter(function (t) { return t.at <= end; }).sort(function (a, b) { return a.at - b.at; })[0];
      if (!due) break;
      w.timers = w.timers.filter(function (t) { return t !== due; });
      w.clock = Math.max(w.clock, due.at);
      due.fn();
    }
    w.clock = end;
  };
  w.press = function (heldMs) {
    var down = w.clock; w.clock += heldMs;
    w.watches.BTN({ time: w.clock / 1000, lastTime: down / 1000, state: false });
  };
  w.pir = function (level) { w.pirLevel = level; if (w.watches.D1) w.watches.D1({ state: !!level }); };
  w.last = function () { return w.adv[w.adv.length - 1]; };
  return w;
}

/* Each scenario returns named results; the same scenarios run against mutants. */
function scenarios(mutate) {
  var r = {};
  var w = boot({}, mutate);
  var a = w.last();
  r["boot: advertises on company ID 0x0590, no name"] = !!a && a.manufacturer === 0x0590 && a.showName === false;
  r["boot: payload is 10 bytes, magic 4D, version 1, boot ID BEEF, DEV flag, battery 87"] =
    !!a && a.manufacturerData.length === 10 && a.manufacturerData.slice(0, 6).join() === [0x4D, 1, 1, 0xEF, 0xBE, 32].join() && a.manufacturerData[8] === 87;
  r["boot: dev build is connectable at the slow interval"] = !!a && a.connectable === true && a.interval === 375;
  r["boot: PIR power is off"] = w.pins.D2 === 0;
  r["boot: dev build flashes all three LEDs"] = w.pulses.join() === "LED1,LED2,LED3";

  w.run(2000); w.press(200);
  a = w.last();
  r["arm: PIR power on, D1 pulled down and watched"] = w.pins.D2 === 1 && w.pins["D1.mode"] === "input_pulldown" && !!w.watches.D1;
  r["arm: flags ARMED+SETTLING+DEV, burst interval 20"] = a.manufacturerData[5] === (1 | 2 | 32) && a.interval === 20;
  r["arm: green LED"] = w.pulses[w.pulses.length - 1] === "LED2";

  w.pir(1); w.pir(0);
  r["settling: PIR output ignored"] = w.last().manufacturerData[6] === 0;

  w.run(31000);
  r["settled: flags ARMED+DEV"] = w.last().manufacturerData[5] === (1 | 32);
  var n = w.adv.length;
  w.pir(1);
  a = w.last();
  r["trigger: counter 1 on the air at once, burst interval"] = w.adv.length > n && a.manufacturerData[6] === 1 && a.interval === 20;
  r["trigger: blue LED blink in a dev build"] = w.pulses[w.pulses.length - 1] === "LED3";
  w.run(1000);
  r["trigger: age byte refreshed during the burst"] = w.last().manufacturerData[9] >= 9 && w.last().manufacturerData[9] <= 11;
  w.pir(0); w.run(5000); w.pir(1);
  r["second trigger: counter 2"] = w.last().manufacturerData[6] === 2;
  w.pir(0);

  w.run(5000); w.press(200);
  r["disarm: DISARMING flag, PIR power off, watch removed, red LED"] =
    w.last().manufacturerData[5] === (4 | 32) && w.pins.D2 === 0 && !w.watches.D1 && w.pulses[w.pulses.length - 1] === "LED1";
  w.run(4000);
  r["after disarm: dev build still advertises, flags DEV only, slow"] = w.last().manufacturerData[5] === 32 && w.last().interval === 375;
  r["dev build never puts the radio to sleep"] = w.sleeps === 0;

  w.press(2500);
  r["long press: MAINT flag, blue LED"] = (w.last().manufacturerData[5] & 8) === 8 && w.pulses[w.pulses.length - 1] === "LED3";

  var b = boot({ buttonTrigger: true }, mutate);
  b.run(2000); b.press(200); b.run(2500);
  r["button build: settled 2.5 s after arming"] = b.last().manufacturerData[5] === (1 | 32);
  b.press(200);
  r["button build: a short press while armed is a trigger, not a disarm"] =
    b.last().manufacturerData[6] === 1 && (b.last().manufacturerData[5] & 1) === 1 && b.pins.D2 === 1;
  b.run(1000); b.press(200);
  r["button build: a second press is a second trigger"] = b.last().manufacturerData[6] === 2;

  // save() after onInit() makes Espruino run onInit() a second time on the
  // live state. Model that: arm, trigger, then run onInit() again.
  var c = boot({}, mutate);
  c.run(2000); c.press(200); c.run(31000); c.pir(1); c.pir(0);
  var live = c.watches.BTN;
  c.g.onInit();
  r["second onInit: starts fresh, counter 0, not armed, PIR off, one battery interval"] =
    c.last().manufacturerData[6] === 0 && (c.last().manufacturerData[5] & 1) === 0 && c.pins.D2 === 0 && !c.watches.D1 && c.intervals === 1;
  c.run(2000); c.press(200);
  // A watch left over from the first run would still be callable on a real
  // board; fire it too, as Espruino would.
  if (c.g.__stale) live({ time: c.clock / 1000, lastTime: c.clock / 1000 - 0.2, state: false });
  r["second onInit: one short press leaves it armed"] = (c.last().manufacturerData[5] & 1) === 1;

  // ---- the event log -------------------------------------------------
  var lines = function (x) { return x.log.split("\n").filter(Boolean).map(function (l) { return l.split(",").slice(1).join(","); }); };
  var d = boot({}, mutate);
  r["log: a start is logged with battery and boot ID"] = lines(d)[0] === "B,87," + 0xBEEF;
  d.run(2000); d.press(200);
  r["log: a button press and the mode change are logged"] = lines(d).slice(1).join(" ") === "K,200,1 M,0,1 P,0,on";
  d.run(31000); d.pir(1); d.pir(0);
  r["log: PIR edges are logged with the counter"] = lines(d).slice(-2).join(" ") === "P,1,1 P,0,1";
  for (var k = 0; k < 4; k++) { d.run(5000); d.pir(1); d.pir(0); }
  r["log: the limit disarming the sensor is logged, with three red flashes"] =
    lines(d).indexOf("L,5") >= 0 && lines(d).indexOf("M,2,3") >= 0 && d.pulses.slice(-2).join() === "LED1,LED3";
  d.every();
  r["log: the ten-minute line has battery and free memory"] = lines(d).slice(-1)[0] === "H,87,2000";
  d.handlers.uncaughtException("boom");
  r["log: an uncaught error is logged"] = lines(d).slice(-1)[0] === "X,boom";
  r["log: an uncaught error is still printed on the console"] = d.printed.join() === "Uncaught boom";

  var full = boot({ before: function (x) { x.log = new Array(16000 - 5).join("x") + "\n"; } }, mutate);
  var size = full.log.length;
  full.run(2000); full.press(200);
  r["log: nothing is written past the size limit, counting what was there at start"] = full.log.length === size;
  r["log: a full log does not stop the sensor"] = (full.last().manufacturerData[5] & 1) === 1;
  full.handlers.uncaughtException("late");
  r["log: an error is still recorded when the log is full"] = /,X,late\n$/.test(full.log);
  var n0 = full.log.length;
  for (var q = 0; q < 200; q++) full.handlers.uncaughtException("flood");
  r["log: errors cannot run past their reserve"] = full.log.length > n0 && full.log.length <= 16000 + 1000;

  var broken = boot({ before: function (x) { x.logThrows = true; } }, mutate);
  broken.run(2000); broken.press(200);
  r["log: a Storage error does not stop the sensor"] = (broken.last().manufacturerData[5] & 1) === 1;
  return r;
}

var base = scenarios(null);
Object.keys(base).forEach(function (k) { check(k, base[k]); });

/* Mutants: each puts a plausible bug into the built file. A mutant is caught
 * when at least one scenario that passes on the real code fails, or it throws. */
var mutants = [
  ["wrong company ID", function (s) { return s.replace("manufacturer: 0x0590", "manufacturer: 0x0591"); }],
  ["name left in the packet", function (s) { return s.replace("showName: false", "showName: true"); }],
  ["PIR power never switched on", function (s) { return s.replace("PIR_POWER.write(1)", "PIR_POWER.write(0)"); }],
  ["PIR power never switched off", function (s) { return s.replace("clearWatch(pirWatch);\n      PIR_POWER.write(0)", "clearWatch(pirWatch);\n      PIR_POWER.write(1)"); }],
  ["PIR watch left behind on disarm", function (s) { return s.replace("clearWatch(pirWatch);", ""); }],
  ["PIR input left floating", function (s) { return s.replace('"input_pulldown"', '"input"'); }],
  ["PIR level inverted", function (s) { return s.replace("level: e.state }", "level: !e.state }"); }],
  ["advertising only set once", function (s) { return s.replace("if (key !== lastAdv) {", "if (lastAdv === \"\") {"); }],
  ["wake timer never set", function (s) { return s.replace("if (w !== null) wakeTimer", "if (false) wakeTimer"); }],
  ["button held time in seconds, not ms", function (s) { return s.replace("(e.time - e.lastTime) * 1000", "(e.time - e.lastTime)"); }],
  ["boot ID not from the hardware", function (s) { return s.replace("E.hwRand() & 0xFFFF", "0"); }],
  ["battery not read at boot", function (s) { return s.replace("battery: E.getBattery() });\n  logOff", "});\n  logOff"); }],
  ["button build disarms on a short press", function (s) { return s.replace("CONFIG.buttonTrigger && s.mode", "false && s.mode"); }],
  ["no dev LED pattern at boot", function (s) { return s.replace("if (s.cfg.dev) { digitalPulse(LED1", "if (false) { digitalPulse(LED1"); }],
  ["start() does not clear earlier watches and timers", function (s) { return s.replace("clearWatch();\n  clearInterval();", "__stale = true;"); }],
  ["start() keeps the old state", function (s) { return s.replace("s = core.create(CONFIG.core);\n  wakeTimer", "wakeTimer"); }],
  ["log has no size limit", function (s) { return s.replace("if (logLen + line.length > LOG_MAX + (letter === \"X\" ? LOG_X_RESERVE : 0)) return;", ""); }],
  ["errors get no reserve in a full log", function (s) { return s.replace("LOG_MAX + (letter === \"X\" ? LOG_X_RESERVE : 0)", "LOG_MAX"); }],
  ["error handler hides errors from the console", function (s) { return s.replace("print(\"Uncaught\", e); ", ""); }],
  ["log size not read at start", function (s) { return s.replace("if (!logOff) logLen = logSize();", ""); }],
  ["a Storage error escapes the log", function (s) { return s.replace("try { require(\"Storage\").open(LOG, \"a\").write(line); logLen += line.length; } catch (e) { logOff = true; }", "require(\"Storage\").open(LOG, \"a\").write(line); logLen += line.length;").replace("  } catch (e) { logOff = true; }\n  return n;", "  } finally {}\n  return n;"); }],
  ["PIR edges not logged", function (s) { return s.replace("if (ev.t === \"pir\") logEv(\"P\", ev.level ? 1 : 0, s.counter);", ""); }],
  ["mode changes not logged", function (s) { return s.replace("if (s.mode !== mode) logEv(\"M\", mode, s.mode);", ""); }],
  ["uncaught errors not logged", function (s) { return s.replace("logEv(\"X\", String(e)); });", "});"); }],
  ["limit has no LED pattern", function (s) { return s.replace("else if (fx === \"led:limit\")", "else if (false)"); }],
  ["no blink on a counted trigger", function (s) { return s.replace("if (s.cfg.dev && s.counter !== before)", "if (false)"); }]
];
var caught = 0;
mutants.forEach(function (m) {
  var by = null;
  try {
    var r = scenarios(m[1]);
    Object.keys(base).forEach(function (k) { if (!by && base[k] && !r[k]) by = k; });
  } catch (e) {
    by = /mutant changed nothing/.test(e.message) ? null : "threw: " + e.message;
    if (!by) console.log("  FAIL  mutant did not apply: " + m[0]);
  }
  if (by) caught++;
  console.log((by ? "  PASS  mutant caught: " : "  FAIL  mutant survived: ") + m[0] + (by ? "  [" + by + "]" : ""));
});

console.log("\n" + (passed + failed) + " checks, " + passed + " passed; " + mutants.length + " mutants, " + caught + " caught");
process.exit(failed || caught !== mutants.length ? 1 : 0);
