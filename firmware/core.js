/* Sensor logic for the Puck.js, with no hardware in it.
 *
 * Everything the sensor decides lives here: the armed state, the trigger
 * counter, what a button press means, when to advertise and what the packet
 * says (docs/protocol.md, version 1). Nothing here touches a pin, a timer or
 * the radio, so the same file runs under Node for tests (firmware/test-core.js)
 * and on Espruino as a module.
 *
 * The hardware shell (not written yet) does three things in a loop:
 *
 *   1. turn something that happened into an event and call step(state, event)
 *   2. make the hardware match view(state, now): PIR power, advertising, console
 *   3. set one timer for nextWake(state, now) and send {t:"tick"} when it fires
 *
 * Times are milliseconds on any clock that only moves forward. Every event
 * carries `now`. A late tick is harmless: each call first applies whatever
 * deadlines have passed.
 *
 * Written in ES5 on purpose. The Puck's interpreter is not Node.
 */

var OFF = 0, SETTLING = 1, ARMED = 2, DISARMING = 3;

var F_ARMED = 1, F_SETTLING = 2, F_DISARMING = 4, F_MAINT = 8, F_LOW_BATT = 16, F_DEV = 32;

/* Starting values from docs/protocol.md, "Timing". None is measured. */
var DEFAULTS = {
  sensorId: 1,
  dev: false,            // development build: console and connections always open
  burstInterval: 20,     // ms between packets in any burst. May have to be 100: protocol.md, "Open question"
  slowInterval: 375,     // ms between packets when connectable and not in a burst
  burstMs: 3000,         // length of the burst after a trigger
  beatMs: 1200,          // length of one heartbeat burst
  beatPeriod: 10000,     // ms from one heartbeat's start to the next
  disarmMs: 3000,        // how long the sensor says DISARMING before the radio sleeps
  settleMs: 30000,       // PIR warm-up after power-on. A guess until the bench measures it
  maintMs: 180000,       // how long a maintenance window stays open
  ageRefreshMs: 200,     // how often the age byte is refreshed during a trigger burst
  minPressMs: 30,        // shorter than this is contact bounce
  longPressMs: 2000,     // this long or longer opens or closes the maintenance window
  bootGuardMs: 1000,     // a press that began this soon after boot is ignored
  minGapMs: 500,         // two rising edges closer than this count once
  lowBattPct: 20
};

function create(overrides) {
  var cfg = {}, k;
  for (k in DEFAULTS) cfg[k] = DEFAULTS[k];
  for (k in overrides || {}) cfg[k] = overrides[k];
  return {
    cfg: cfg,
    mode: OFF,
    maint: false,
    maintUntil: 0,
    bootAt: null,       // null until the boot event arrives
    bootId: 0,
    counter: 0,
    lastTriggerAt: null,
    pirHigh: false,
    battery: 255,       // 255 = unknown
    advUntil: 0,        // a burst is on the air until this time
    nextBeat: 0,
    settleUntil: 0
  };
}

/* Apply every deadline that has passed. Called at the start of each step. */
function advance(s, now) {
  var c = s.cfg;
  if (s.maint && now >= s.maintUntil) s.maint = false;
  if (s.mode === SETTLING && now >= s.settleUntil) s.mode = ARMED;
  if (s.mode === DISARMING && now >= s.advUntil) s.mode = OFF;
  if ((s.mode === SETTLING || s.mode === ARMED) && now >= s.nextBeat) {
    if (now + c.beatMs > s.advUntil) s.advUntil = now + c.beatMs;
    s.nextBeat = now + c.beatPeriod;   // from now, not from the old deadline: a late tick must not bunch beats up
  }
}

function arm(s, now) {
  s.mode = SETTLING;
  s.settleUntil = now + s.cfg.settleMs;
  s.pirHigh = false;       // the shell reports the real level once the sensor has power
  s.nextBeat = now;        // so the watch hears "armed" straight away
  advance(s, now);
}

function disarm(s, now) {
  s.mode = DISARMING;
  s.advUntil = now + s.cfg.disarmMs;
}

/* Feed one event in. Returns the one-shot effects the shell should play, as
 * a list of names: "led:arm", "led:disarm", "led:maint-open", "led:maint-close".
 *
 *   {t:"boot",    now, bootId, battery}   once, first. bootId is a random 16-bit number
 *   {t:"button",  now, heldMs}            on release, with how long it was down
 *   {t:"pir",     now, level}             the PIR output changed, or was read after power-on
 *   {t:"battery", now, pct}               a new battery reading, 0-100
 *   {t:"tick",    now}                    the nextWake timer fired
 */
function step(s, ev) {
  var c = s.cfg, now = ev.now, fx = [];

  if (ev.t === "boot") {
    s.bootAt = now;
    s.bootId = ev.bootId & 0xFFFF;
    if (ev.battery !== undefined) setBattery(s, ev.battery);
    return fx;
  }
  if (s.bootAt === null) return fx;   // nothing counts before boot
  advance(s, now);

  if (ev.t === "button") {
    // Holding the button while the battery goes in belongs to Espruino's own
    // recovery paths (docs/runbooks/puck-recovery.md). A press that started
    // at or just after power-up is never given a meaning here.
    if (now - ev.heldMs < s.bootAt + c.bootGuardMs) return fx;
    if (ev.heldMs < c.minPressMs) return fx;
    if (ev.heldMs >= c.longPressMs) {
      if (s.maint) { s.maint = false; fx.push("led:maint-close"); }
      else { s.maint = true; s.maintUntil = now + c.maintMs; fx.push("led:maint-open"); }
      return fx;
    }
    if (s.mode === OFF || s.mode === DISARMING) { arm(s, now); fx.push("led:arm"); }
    else { disarm(s, now); fx.push("led:disarm"); }
    return fx;
  }

  if (ev.t === "pir") {
    var was = s.pirHigh;
    s.pirHigh = !!ev.level;
    // A trigger is a RISING EDGE while armed and settled. A sensor whose
    // output is already high when settling ends has not risen, so it does
    // not count until it has dropped and come back.
    if (s.pirHigh && !was && s.mode === ARMED &&
        (s.lastTriggerAt === null || now - s.lastTriggerAt >= c.minGapMs)) {
      s.counter = (s.counter + 1) & 0xFFFF;
      s.lastTriggerAt = now;
      if (now + c.burstMs > s.advUntil) s.advUntil = now + c.burstMs;
    }
    return fx;
  }

  if (ev.t === "battery") setBattery(s, ev.pct);
  return fx;
}

function setBattery(s, pct) {
  if (typeof pct !== "number" || isNaN(pct)) { s.battery = 255; return; }
  s.battery = Math.max(0, Math.min(100, Math.round(pct)));
}

function flags(s) {
  var f = 0;
  if (s.mode === SETTLING) f |= F_ARMED | F_SETTLING;
  if (s.mode === ARMED) f |= F_ARMED;
  if (s.mode === DISARMING) f |= F_DISARMING;
  if (s.maint) f |= F_MAINT;
  if (s.battery !== 255 && s.battery < s.cfg.lowBattPct) f |= F_LOW_BATT;
  if (s.cfg.dev) f |= F_DEV;
  return f;
}

/* The 10 payload bytes of docs/protocol.md, version 1. */
function payload(s, now) {
  var age = 255;
  if (s.lastTriggerAt !== null) age = Math.min(255, Math.floor((now - s.lastTriggerAt) / 100));
  return [0x4D, 1, s.cfg.sensorId & 0xFF, s.bootId & 0xFF, s.bootId >> 8, flags(s),
          s.counter & 0xFF, s.counter >> 8, s.battery, age];
}

/* What the hardware should be doing at `now`. Read-only: call step() with a
 * tick first if deadlines may have passed.
 *
 *   pirPower     drive the PIR's supply pin high
 *   console      the serial console service exists
 *   adv          null for radio asleep, else {interval, connectable, payload}
 */
function view(s, now) {
  var c = s.cfg;
  var open = c.dev || s.maint;
  var bursting = now < s.advUntil && s.mode !== OFF;
  var adv = null;
  if (bursting || open)
    adv = { interval: bursting ? c.burstInterval : c.slowInterval, connectable: open, payload: payload(s, now) };
  return { pirPower: s.mode === SETTLING || s.mode === ARMED, console: open, adv: adv };
}

/* The next time the shell must send a tick, or null if nothing is pending. */
function nextWake(s, now) {
  var c = s.cfg, t = [];
  if (s.maint) t.push(s.maintUntil);
  if (s.mode === SETTLING) t.push(s.settleUntil);
  if (s.mode === SETTLING || s.mode === ARMED) t.push(s.nextBeat);
  if (s.mode !== OFF && now < s.advUntil) {
    t.push(s.advUntil);
    // keep the age byte fresh while it is still counting
    if (s.lastTriggerAt !== null && now - s.lastTriggerAt < 25500) t.push(now + c.ageRefreshMs);
  }
  var best = null;
  for (var i = 0; i < t.length; i++) if (t[i] > now && (best === null || t[i] < best)) best = t[i];
  return best;
}

exports.OFF = OFF; exports.SETTLING = SETTLING; exports.ARMED = ARMED; exports.DISARMING = DISARMING;
exports.F_ARMED = F_ARMED; exports.F_SETTLING = F_SETTLING; exports.F_DISARMING = F_DISARMING;
exports.F_MAINT = F_MAINT; exports.F_LOW_BATT = F_LOW_BATT; exports.F_DEV = F_DEV;
exports.DEFAULTS = DEFAULTS;
exports.create = create; exports.step = step; exports.view = view;
exports.nextWake = nextWake; exports.payload = payload; exports.flags = flags;
