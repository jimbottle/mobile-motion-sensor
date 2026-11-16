#!/usr/bin/env node
/* Host tests for firmware/core.js.
 *
 *   node firmware/test-core.js      (from the repo root)
 *
 * These test the sensor's LOGIC against docs/protocol.md. They say nothing
 * about a Puck: no pin, timer or radio is involved, and a device check is
 * still required before anything that depends on this is closed.
 *
 * Two properties, borrowed from ../my-bangle/apps/battview/test-app.js:
 *   - it EXITS NON-ZERO on failure
 *   - every rule with a bug behind it is run again against a MUTANT, a copy
 *     of core.js with that rule broken. The mutant must make the named check
 *     fail. A mutation that no longer matches the source is itself a failure,
 *     so a reformat of core.js cannot quietly disarm a mutant.
 */
const fs = require("fs");
const path = require("path");
const SRC = fs.readFileSync(path.join(__dirname, "core.js"), "utf8");

function load(code) {
  const exports = {};
  new Function("exports", code)(exports);
  return exports;
}

/* Run every check against one build of core.js. Returns {name: true|false}. */
function suite(C) {
  const R = {};
  const check = (name, ok) => { R[name] = (name in R ? R[name] : true) && !!ok; };
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  /* A sensor that has booted at t=0 and is past the boot guard. */
  function booted(cfg, at) {
    const s = C.create(cfg);
    C.step(s, { t: "boot", now: 0, bootId: 0xBEEF, battery: 87 });
    return s;
  }
  const press = (s, now, heldMs) => C.step(s, { t: "button", now: now, heldMs: heldMs === undefined ? 200 : heldMs });
  const tick = (s, now) => C.step(s, { t: "tick", now: now });
  const pir = (s, now, level) => C.step(s, { t: "pir", now: now, level: level });
  /* Arm at t=5000 and run past settling. Returns the time it is armed at. */
  function armed(cfg) {
    const s = booted(cfg);
    press(s, 5000);
    const t = 5000 + s.cfg.settleMs;
    tick(s, t);
    return { s: s, t: t };
  }

  // ---- payload layout -------------------------------------------------
  {
    const { s, t } = armed();
    for (let i = 0; i < 258; i++) { pir(s, t + i * 1000, true); pir(s, t + i * 1000 + 100, false); }
    const last = t + 257 * 1000;
    check("payload: matches the protocol.md test vector",
      eq(C.payload(s, last + 1200), [0x4D, 0x01, 0x01, 0xEF, 0xBE, 0x01, 0x02, 0x01, 0x57, 0x0C]));
    check("payload: is 10 bytes, each 0-255",
      C.payload(s, last).length === 10 && C.payload(s, last).every((b) => b === (b & 0xFF)));
  }
  {
    const s = booted({ sensorId: 2 });
    check("payload: carries the configured sensor ID", C.payload(s, 10)[2] === 2);
    check("payload: age is 255 before any trigger", C.payload(s, 10)[9] === 255);
    check("payload: counter is 0 at boot", C.payload(s, 10)[6] === 0 && C.payload(s, 10)[7] === 0);
  }
  {
    const { s, t } = armed();
    pir(s, t + 10, true);
    check("payload: age counts tenths of a second", C.payload(s, t + 10 + 730)[9] === 7);
    check("payload: age is capped at 255", C.payload(s, t + 10 + 60000)[9] === 255);
  }

  // ---- flags ------------------------------------------------------------
  {
    const s = booted();
    check("flags: off sends none", C.flags(s) === 0);
    press(s, 5000);
    check("flags: settling is ARMED+SETTLING", C.flags(s) === (C.F_ARMED | C.F_SETTLING));
    tick(s, 5000 + s.cfg.settleMs);
    check("flags: armed is ARMED alone", C.flags(s) === C.F_ARMED);
    press(s, 50000);
    check("flags: disarming is DISARMING alone, ARMED clear", C.flags(s) === C.F_DISARMING);
  }
  {
    const s = booted({ dev: true });
    check("flags: a development build always says DEV", (C.flags(s) & C.F_DEV) !== 0);
    check("flags: a field build never says DEV", (C.flags(booted()) & C.F_DEV) === 0);
  }
  {
    const s = booted();
    C.step(s, { t: "battery", now: 2000, pct: 19 });
    check("flags: LOW_BATT below the threshold", (C.flags(s) & C.F_LOW_BATT) !== 0);
    C.step(s, { t: "battery", now: 3000, pct: 20 });
    check("flags: no LOW_BATT at the threshold", (C.flags(s) & C.F_LOW_BATT) === 0);
    C.step(s, { t: "battery", now: 4000, pct: NaN });
    check("battery: an unreadable level is sent as 255, without LOW_BATT",
      C.payload(s, 4000)[8] === 255 && (C.flags(s) & C.F_LOW_BATT) === 0);
    C.step(s, { t: "battery", now: 5000, pct: 140 });
    check("battery: clamped to 100", C.payload(s, 5000)[8] === 100);
  }

  // ---- button -------------------------------------------------------------
  {
    const s = booted();
    check("button: a short press arms, with the arm LED", eq(press(s, 5000), ["led:arm"]) && s.mode === C.SETTLING);
    check("button: a second short press disarms, with the disarm LED",
      eq(press(s, 9000), ["led:disarm"]) && s.mode === C.DISARMING);
    check("button: a press while disarming arms again", eq(press(s, 9500), ["led:arm"]) && s.mode === C.SETTLING);
  }
  {
    const s = booted();
    check("button: contact bounce is ignored", eq(press(s, 5000, 10), []) && s.mode === C.OFF);
  }
  {
    const s = booted();
    // released at 3000 after 2500 held: it went down at 500, inside the boot guard
    check("button: a press that began at power-up does nothing",
      eq(press(s, 3000, 2500), []) && s.mode === C.OFF && !s.maint);
    check("button: a short press that began at power-up does nothing",
      eq(press(s, 700, 200), []) && s.mode === C.OFF);
  }
  {
    const s = C.create();
    check("button: nothing counts before the boot event",
      eq(C.step(s, { t: "button", now: 9000, heldMs: 200 }), []) && s.mode === C.OFF);
  }

  // ---- maintenance window ---------------------------------------------------
  {
    const s = booted();
    check("maint: closed by default, so no console and no radio when off",
      C.view(s, 4000).console === false && C.view(s, 4000).adv === null);
    check("maint: a long press opens it, with its LED", eq(press(s, 8000, 2500), ["led:maint-open"]) && s.maint);
    const v = C.view(s, 8100);
    check("maint: open means console, connectable, and the MAINT flag",
      v.console && v.adv && v.adv.connectable === true && (v.adv.payload[5] & C.F_MAINT) !== 0);
    check("maint: a long press does not arm the sensor", s.mode === C.OFF);
    tick(s, 8000 + s.cfg.maintMs - 1);
    check("maint: still open just before its time is up", s.maint === true);
    tick(s, 8000 + s.cfg.maintMs);
    check("maint: closes by itself", s.maint === false && C.view(s, 8000 + s.cfg.maintMs).console === false);
  }
  {
    const s = booted();
    press(s, 8000, 2500);
    check("maint: a second long press closes it early", eq(press(s, 20000, 2500), ["led:maint-close"]) && !s.maint);
  }
  {
    const { s, t } = armed();
    const v = C.view(s, t + 5000);   // between heartbeats
    check("field build: never connectable and never a console while armed",
      v.console === false && (v.adv === null || v.adv.connectable === false));
    pir(s, t + 6000, true);
    check("field build: a trigger burst is not connectable", C.view(s, t + 6001).adv.connectable === false);
  }
  {
    const s = booted({ dev: true });
    const v = C.view(s, 4000);
    check("dev build: console and connectable even when off", v.console && v.adv && v.adv.connectable === true);
  }

  // ---- PIR power and settling -------------------------------------------------
  {
    const s = booted();
    check("pir power: off while disarmed", C.view(s, 4000).pirPower === false);
    press(s, 5000);
    check("pir power: on from the moment of arming", C.view(s, 5001).pirPower === true);
    pir(s, 6000, true); pir(s, 7000, false); pir(s, 8000, true);
    check("settling: edges during warm-up are not triggers", s.counter === 0);
    pir(s, 9000, false);
    tick(s, 5000 + s.cfg.settleMs - 1);
    check("settling: lasts the configured time", s.mode === C.SETTLING);
    tick(s, 5000 + s.cfg.settleMs);
    check("settling: then armed", s.mode === C.ARMED);
    press(s, 60000);
    check("pir power: cut at once on disarm", C.view(s, 60001).pirPower === false);
  }
  {
    // output goes high during warm-up and stays high through the end of it
    const s = booted();
    press(s, 5000);
    pir(s, 6000, true);
    const t = 5000 + s.cfg.settleMs;
    tick(s, t);
    pir(s, t + 10, true);   // the shell reads the pin again: still high, and still not an edge
    check("settling: an output already high when settling ends is not a trigger", s.counter === 0);
    pir(s, t + 1000, false); pir(s, t + 3000, true);
    check("settling: the next real rising edge is", s.counter === 1);
  }

  // ---- triggers -----------------------------------------------------------------
  {
    const { s, t } = armed();
    pir(s, t + 100, true);
    check("trigger: a rising edge while armed adds one", s.counter === 1);
    pir(s, t + 2100, false);
    check("trigger: a falling edge adds nothing", s.counter === 1);
    pir(s, t + 4400, true);
    check("trigger: the next rising edge adds one more", s.counter === 2);
    pir(s, t + 5500, true);
    check("trigger: a repeated high level is not an edge", s.counter === 2);
  }
  {
    const { s, t } = armed();
    pir(s, t + 100, true); pir(s, t + 150, false); pir(s, t + 200, true);
    check("trigger: a glitch inside the minimum gap counts once", s.counter === 1);
    pir(s, t + 300, false); pir(s, t + 100 + s.cfg.minGapMs, true);
    check("trigger: an edge at the minimum gap counts", s.counter === 2);
  }
  {
    const s = booted();
    pir(s, 4000, true);
    check("trigger: nothing counts while off", s.counter === 0);
    press(s, 5000); tick(s, 5000 + s.cfg.settleMs);
    pir(s, 40000, false); pir(s, 41000, true);
    press(s, 42000);
    pir(s, 42100, false); pir(s, 42200, true);
    check("trigger: nothing counts while disarming", s.counter === 1);
    press(s, 43000);
    check("counter: arming again does not reset it", s.counter === 1);
  }
  {
    const { s, t } = armed();
    s.counter = 65535;
    pir(s, t + 100, true);
    check("counter: wraps from 65535 to 0", s.counter === 0 && C.payload(s, t + 100)[6] === 0 && C.payload(s, t + 100)[7] === 0);
  }

  // ---- advertising schedule --------------------------------------------------------
  {
    const s = booted();
    press(s, 5000);
    const v = C.view(s, 5001);
    check("heartbeat: starts the moment the sensor is armed", v.adv !== null && v.adv.interval === s.cfg.burstInterval);
    check("heartbeat: lasts beatMs", C.view(s, 5000 + s.cfg.beatMs - 1).adv !== null && C.view(s, 5000 + s.cfg.beatMs).adv === null);
    check("heartbeat: wake is due when it ends", C.nextWake(s, 5001) === 5000 + s.cfg.beatMs);
    check("heartbeat: then the next wake is the next beat", C.nextWake(s, 5000 + s.cfg.beatMs) === 5000 + s.cfg.beatPeriod);
    tick(s, 5000 + s.cfg.beatPeriod);
    check("heartbeat: repeats every beatPeriod", C.view(s, 5000 + s.cfg.beatPeriod + 1).adv !== null);
    // a tick that arrives 4 s late must not pull the following beat forward
    tick(s, 5000 + 2 * s.cfg.beatPeriod + 4000);
    check("heartbeat: a late tick does not bunch the next beat up",
      s.nextBeat === 5000 + 3 * s.cfg.beatPeriod + 4000);
  }
  {
    const { s, t } = armed();
    tick(s, t + 5000);
    check("burst: radio is quiet between heartbeats", C.view(s, t + 5000).adv === null || t + 5000 < s.advUntil);
    const quietAt = s.advUntil + 10;
    tick(s, quietAt);
    pir(s, quietAt + 5, true);
    const v = C.view(s, quietAt + 6);
    check("burst: a trigger starts one at the burst interval", v.adv !== null && v.adv.interval === s.cfg.burstInterval);
    check("burst: it carries the new counter", v.adv.payload[6] === 1);
    check("burst: it lasts burstMs",
      C.view(s, quietAt + 5 + s.cfg.burstMs - 1).adv !== null);
    check("burst: the age byte is refreshed during it", C.nextWake(s, quietAt + 6) === quietAt + 6 + s.cfg.ageRefreshMs);
  }
  {
    const { s, t } = armed({ burstMs: 8000 });
    pir(s, t + 100, true);            // burst would run to t+8100, well past the disarm burst
    press(s, t + 500);                // disarm in the middle of it
    check("disarm: the burst says DISARMING", (C.view(s, t + 501).adv.payload[5] & C.F_DISARMING) !== 0);
    check("disarm: it lasts disarmMs and no longer",
      C.view(s, t + 500 + s.cfg.disarmMs - 1).adv !== null && s.advUntil === t + 500 + s.cfg.disarmMs);
    tick(s, t + 500 + s.cfg.disarmMs);
    check("disarm: then off, radio asleep, nothing pending",
      s.mode === C.OFF && C.view(s, t + 500 + s.cfg.disarmMs).adv === null && C.nextWake(s, t + 500 + s.cfg.disarmMs) === null);
  }
  {
    const s = booted();
    check("idle: an off sensor asks for no wake-up", C.nextWake(s, 4000) === null);
  }
  return R;
}

/* Each mutant breaks one rule and names a check that must then fail. */
const MUTANTS = [
  ["counts falling edges too", "s.pirHigh && !was && s.mode === ARMED", "s.mode === ARMED", "trigger: a falling edge adds nothing"],
  ["counts a level, not an edge", "s.pirHigh && !was && s.mode === ARMED", "s.pirHigh && s.mode === ARMED", "trigger: a repeated high level is not an edge"],
  ["triggers while settling", "!was && s.mode === ARMED &&", "!was && s.mode !== OFF && s.mode !== DISARMING &&", "settling: edges during warm-up are not triggers"],
  ["forgets the PIR level during warm-up", "    s.pirHigh = !!ev.level;", "    s.pirHigh = s.mode === ARMED && !!ev.level;", "settling: an output already high when settling ends is not a trigger"],
  ["no minimum gap between triggers", "now - s.lastTriggerAt >= c.minGapMs", "true", "trigger: a glitch inside the minimum gap counts once"],
  ["counter does not wrap", "s.counter = (s.counter + 1) & 0xFFFF;", "s.counter = s.counter + 1;", "counter: wraps from 65535 to 0"],
  ["arming resets the counter", "  s.mode = SETTLING;\n", "  s.mode = SETTLING; s.counter = 0;\n", "counter: arming again does not reset it"],
  ["boot ID sent big-endian", "s.bootId & 0xFF, s.bootId >> 8, flags(s)", "s.bootId >> 8, s.bootId & 0xFF, flags(s)", "payload: matches the protocol.md test vector"],
  ["age in whole seconds", "(now - s.lastTriggerAt) / 100)", "(now - s.lastTriggerAt) / 1000)", "payload: age counts tenths of a second"],
  ["age not capped", "age = Math.min(255, Math.floor(", "age = (Math.floor(", "payload: age is capped at 255"],
  ["disarming still says ARMED", "if (s.mode === DISARMING) f |= F_DISARMING;", "if (s.mode === DISARMING) f |= F_DISARMING | F_ARMED;", "flags: disarming is DISARMING alone, ARMED clear"],
  ["field build says DEV", "if (s.cfg.dev) f |= F_DEV;", "f |= F_DEV;", "flags: a field build never says DEV"],
  ["unknown battery reads as low", "if (s.battery !== 255 && s.battery < s.cfg.lowBattPct)", "if (s.battery < s.cfg.lowBattPct || s.battery === 255)", "battery: an unreadable level is sent as 255, without LOW_BATT"],
  ["button at power-up is honoured", "if (now - ev.heldMs < s.bootAt + c.bootGuardMs) return fx;", "", "button: a press that began at power-up does nothing"],
  ["contact bounce arms the sensor", "if (ev.heldMs < c.minPressMs) return fx;", "", "button: contact bounce is ignored"],
  ["a long press also arms", "      return fx;\n    }\n    if (s.mode === OFF", "    }\n    if (s.mode === OFF", "maint: a long press does not arm the sensor"],
  ["maintenance window never closes", "if (s.maint && now >= s.maintUntil) s.maint = false;", "", "maint: closes by itself"],
  ["console open in a field build", "var open = c.dev || s.maint;", "var open = true;", "maint: closed by default, so no console and no radio when off"],
  ["bursts are connectable", "connectable: open,", "connectable: true,", "field build: a trigger burst is not connectable"],
  ["PIR stays powered after disarm", "pirPower: s.mode === SETTLING || s.mode === ARMED,", "pirPower: s.mode !== OFF,", "pir power: cut at once on disarm"],
  ["disarm keeps the longer trigger burst", "  s.advUntil = now + s.cfg.disarmMs;", "  if (now + s.cfg.disarmMs > s.advUntil) s.advUntil = now + s.cfg.disarmMs;", "disarm: it lasts disarmMs and no longer"],
  ["never goes quiet after disarming", "if (s.mode === DISARMING && now >= s.advUntil) s.mode = OFF;", "", "disarm: then off, radio asleep, nothing pending"],
  ["heartbeat does not start on arming", "  s.nextBeat = now;        // so", "  s.nextBeat = now + s.cfg.beatPeriod;        // so", "heartbeat: starts the moment the sensor is armed"],
  ["late tick bunches beats up", "    s.nextBeat = now + c.beatPeriod;", "    s.nextBeat = s.nextBeat + c.beatPeriod;", "heartbeat: a late tick does not bunch the next beat up"],
  ["trigger starts no burst", "      if (now + c.burstMs > s.advUntil) s.advUntil = now + c.burstMs;\n", "", "burst: a trigger starts one at the burst interval"],
  ["age byte never refreshed", "if (s.lastTriggerAt !== null && now - s.lastTriggerAt < 25500) t.push(now + c.ageRefreshMs);", "", "burst: the age byte is refreshed during it"],
];

let failed = 0;
const real = suite(load(SRC));
const names = Object.keys(real);
for (const n of names) {
  if (real[n]) console.log("  PASS  " + n);
  else { failed++; console.log("  FAIL  " + n); }
}

let killed = 0;
for (const [what, from, to, mustFail] of MUTANTS) {
  if (!SRC.includes(from)) { failed++; console.log("  FAIL  MUTANT '" + what + "' no longer matches core.js"); continue; }
  if (!(mustFail in real)) { failed++; console.log("  FAIL  MUTANT '" + what + "' names a check that does not exist: " + mustFail); continue; }
  let r;
  try { r = suite(load(SRC.replace(from, to))); } catch (e) { r = { [mustFail]: false }; }
  if (r[mustFail] === false) { killed++; console.log("  PASS  mutant caught: " + what); }
  else { failed++; console.log("  FAIL  mutant survived: " + what + "  [expected to fail: " + mustFail + "]"); }
}

console.log("\n" + names.length + " checks, " + names.filter((n) => real[n]).length + " passed; " +
            MUTANTS.length + " mutants, " + killed + " caught");
process.exit(failed ? 1 : 0);
