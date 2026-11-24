#!/usr/bin/env node
/* Joins firmware/core.js and firmware/shell.js into one file to send to a
 * Puck.js. From the repo root:
 *
 *   node tools/build-puck.js                    development build, PIR on D1/D2
 *   node tools/build-puck.js --button-trigger   development build where a short
 *                                               press while armed is a trigger
 *                                               and settling takes 2 s: for
 *                                               testing with no PIR attached
 *
 * Writes build/puck-dev.js or build/puck-dev-button.js (build/ is not
 * tracked). The file defines onInit(); after sending it, call onInit() to run
 * it from RAM, or save() to keep it across resets. onInit() may be called
 * before save(): it clears its own watches and timers each time it runs.
 *
 * Do not let the Espruino Web IDE set the Puck's clock while this runs (its
 * "Set Current Time" setting). The firmware's deadlines assume a clock that
 * does not jump.
 *
 * There is no field build here yet: it waits for the recovery paths to be
 * run on a board (docs/runbooks/puck-recovery.md).
 */
var fs = require("fs"), path = require("path");
var root = path.join(__dirname, "..");
var button = process.argv.indexOf("--button-trigger") >= 0;

function build(opts) {
  var config = { core: { dev: true }, buttonTrigger: !!opts.buttonTrigger };
  if (opts.buttonTrigger) config.core.settleMs = 2000;
  var coreSrc = fs.readFileSync(path.join(root, "firmware/core.js"), "utf8");
  var shellSrc = fs.readFileSync(path.join(root, "firmware/shell.js"), "utf8");
  return "var CONFIG = " + JSON.stringify(config) + ";\n" +
    "Modules.addCached(\"core\", function() {\n" + coreSrc + "\n});\n" + shellSrc;
}
exports.build = build;

if (require.main === module) {
  var out = path.join(root, "build", button ? "puck-dev-button.js" : "puck-dev.js");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  var src = build({ buttonTrigger: button });
  fs.writeFileSync(out, src);
  console.log(path.relative(root, out) + ": " + src.length + " bytes");
}
