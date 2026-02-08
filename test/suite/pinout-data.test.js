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

    assert.strictEqual(index.schemaVersion, 2);
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
