const assert = require("assert");
const fs = require("fs");
const path = require("path");

const pinoutRoot = path.resolve(__dirname, "../../media/pinouts");

function readJson(relPath) {
  const abs = path.join(pinoutRoot, relPath);
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

suite("Pinout data integrity", () => {
  test("generated index covers exactly the configured board scope", () => {
    const index = readJson("index.json");
    const targets = readJson("targets.json");

    assert.strictEqual(index.schemaVersion, 3);
    assert.ok(Array.isArray(targets.all), "targets.all must be an array");

    const targetSet = new Set(targets.all);
    const covered = new Set([...Object.keys(index.boards || {}), ...Object.keys(index.boardSocAliases || {})]);

    assert.strictEqual(covered.size, targetSet.size, "Covered board ID count should match target scope count");

    for (const boardId of covered) {
      assert.ok(targetSet.has(boardId), `Unexpected out-of-scope board in index: ${boardId}`);
    }

    for (const boardId of targetSet) {
      assert.ok(covered.has(boardId), `Missing target board from index: ${boardId}`);
    }
  });

  test("all referenced board and SoC files exist", () => {
    const index = readJson("index.json");

    for (const relPath of Object.values(index.boards || {})) {
      const abs = path.join(pinoutRoot, relPath);
      assert.ok(fs.existsSync(abs), `Missing board definition: ${relPath}`);
    }

    for (const relPath of Object.values(index.soc || {})) {
      const abs = path.join(pinoutRoot, relPath);
      assert.ok(fs.existsSync(abs), `Missing SoC definition: ${relPath}`);
    }

    for (const [boardId, alias] of Object.entries(index.boardSocAliases || {})) {
      assert.ok(alias && alias.soc, `Missing boardSocAliases.soc for ${boardId}`);
      assert.ok(index.soc[alias.soc], `boardSocAliases references unknown soc '${alias.soc}' for ${boardId}`);
    }
  });

  test("new platform SoC definitions are present", () => {
    const index = readJson("index.json");
    for (const soc of ["esp32c2", "esp32c5", "esp32h2", "esp32p4", "bk72xx", "rtl8710b", "rtl8720c"]) {
      assert.ok(index.soc[soc], `Missing SoC entry: ${soc}`);
      const def = readJson(index.soc[soc]);
      assert.ok(Array.isArray(def.gpios) && def.gpios.length > 0, `SoC ${soc} has no gpios`);
    }
  });

  test("LibreTiny board definitions carry GPIO subsets and aliases", () => {
    const index = readJson("index.json");
    assert.ok(index.boards["cb2s"], "cb2s board definition missing");
    const cb2s = readJson(index.boards["cb2s"]);
    assert.strictEqual(cb2s.kind, "soc-grid");
    assert.strictEqual(cb2s.socRef, "bk72xx");
    assert.ok(cb2s.gpios.includes(26), "cb2s should break out P26 (GPIO26)");
    assert.ok(!cb2s.gpios.includes(28), "cb2s should not break out P28");
    assert.ok(cb2s.pinAliases && Number.isFinite(cb2s.pinAliases.D1), "cb2s should expose D-style aliases");

    const soc = readJson(index.soc[cb2s.socRef]);
    const socGpios = new Set(soc.gpios);
    for (const gpio of cb2s.gpios) {
      assert.ok(socGpios.has(gpio), `cb2s GPIO${gpio} not present in ${cb2s.socRef} SoC grid`);
    }
  });

  test("esp8266 boards expose silkscreen pin aliases", () => {
    const index = readJson("index.json");
    const soc = readJson(index.soc.esp8266);
    assert.strictEqual(soc.pinAliases.RX, 3);
    assert.strictEqual(soc.pinAliases.TX, 1);
    assert.strictEqual(soc.pinAliases.A0, 17);

    const d1mini = index.boardSocAliases.d1_mini;
    assert.ok(d1mini, "d1_mini fallback entry missing");
    assert.strictEqual(d1mini.pinAliases.D1, 5);
    assert.strictEqual(d1mini.pinAliases.D4, 2);
    assert.strictEqual(d1mini.pinLabels[5], "D1");
  });

  test("all pinAliases and pinLabels reference valid GPIO numbers", () => {
    const index = readJson("index.json");

    function checkAliases(owner, def, gpios) {
      const gpioSet = gpios ? new Set(gpios) : null;
      for (const [name, gpio] of Object.entries(def.pinAliases || {})) {
        assert.ok(Number.isFinite(gpio), `${owner} alias ${name} is not a number`);
      }
      for (const [gpio] of Object.entries(def.pinLabels || {})) {
        if (gpioSet) assert.ok(gpioSet.has(Number(gpio)), `${owner} label GPIO${gpio} outside its grid`);
      }
    }

    for (const [boardId, relPath] of Object.entries(index.boards)) {
      const def = readJson(relPath);
      checkAliases(boardId, def, def.kind === "soc-grid" ? def.gpios : null);
    }
    for (const [socId, relPath] of Object.entries(index.soc)) {
      const def = readJson(relPath);
      checkAliases(socId, def, def.gpios);
    }
  });

  test("svg-board definitions reference existing SVG assets", () => {
    const index = readJson("index.json");

    for (const relPath of Object.values(index.boards || {})) {
      const def = JSON.parse(fs.readFileSync(path.join(pinoutRoot, relPath), "utf8"));
      if (def.kind !== "svg-board") continue;

      assert.ok(def.svgPath, `svg-board missing svgPath: ${def.id}`);
      const svgAbs = path.join(pinoutRoot, def.svgPath);
      assert.ok(fs.existsSync(svgAbs), `Missing SVG asset for ${def.id}: ${def.svgPath}`);
      assert.ok(
        def.sizeMm && Number.isFinite(def.sizeMm.width) && Number.isFinite(def.sizeMm.height),
        `Invalid sizeMm for ${def.id}`,
      );
      assert.ok(Array.isArray(def.pins) && def.pins.length > 0, `svg-board has no pins for ${def.id}`);
    }
  });
});
