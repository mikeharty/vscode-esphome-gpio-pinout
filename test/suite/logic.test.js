const assert = require("assert");
const path = require("path");

const logic = require(path.resolve(__dirname, "../../media/esphome-gpio-pinout-parser"));

suite("Pinout logic", () => {
  test("parses board, variant, psram, substitutions, and pin usage", () => {
    const yaml = [
      "esphome:",
      "  name: test",
      "esp32:",
      "  board: esp32-s3-devkitc-1",
      "  variant: esp32s3",
      "psram:",
      "  mode: octal",
      "substitutions:",
      "  led_pin: GPIO4",
      "binary_sensor:",
      "  - platform: gpio",
      "    pin: ${led_pin}",
      "    name: \"Btn\""
    ].join("\n");

    const parsed = logic.parseEsphomeYaml(yaml);
    assert.ok(parsed.ok, "Expected YAML to be detected as ESPHome");
    assert.strictEqual(parsed.board, "esp32-s3-devkitc-1");
    assert.strictEqual(parsed.variant, "esp32s3");
    assert.strictEqual(parsed.psramMode, "octal");

    const usages = parsed.usedPins.get(4);
    assert.ok(usages, "Expected GPIO4 to be detected");
    const pinUsage = usages.find((u) => u.key === "pin");
    assert.ok(pinUsage, "Expected a pin usage entry");
    assert.strictEqual(pinUsage.line, 12);
    assert.strictEqual(pinUsage.platform, "gpio");
  });

  test("parses nested pin.number usage", () => {
    const yaml = [
      "esphome:",
      "  name: test",
      "sensor:",
      "  - platform: dht",
      "    pin:",
      "      number: GPIO14",
      "    name: \"DHT\""
    ].join("\n");

    const parsed = logic.parseEsphomeYaml(yaml);
    assert.ok(parsed.ok, "Expected YAML to be detected as ESPHome");

    const usages = parsed.usedPins.get(14);
    assert.ok(usages, "Expected GPIO14 to be detected");
    assert.strictEqual(usages[0].line, 6);
    assert.strictEqual(usages[0].key, "pin");
  });

  test("rejects non-ESPHome YAML", () => {
    const parsed = logic.parseEsphomeYaml("foo: bar\n");
    assert.strictEqual(parsed.ok, false);
  });
});
