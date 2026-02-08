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
      '    name: "Btn"',
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
      '    name: "DHT"',
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

  test("detects esp8266 board block", () => {
    const yaml = [
      "esphome:",
      "  name: test",
      "esp8266:",
      "  board: nodemcuv2",
      "binary_sensor:",
      "  - platform: gpio",
      "    pin: GPIO4",
    ].join("\n");

    const parsed = logic.parseEsphomeYaml(yaml);
    assert.ok(parsed.ok, "Expected YAML to be detected as ESPHome");
    assert.strictEqual(parsed.board, "nodemcuv2");
    assert.ok(parsed.usedPins.has(4), "Expected GPIO4 usage to be detected");
  });

  test("detects rp2040 board block", () => {
    const yaml = [
      "esphome:",
      "  name: pico",
      "rp2040:",
      "  board: rpipicow",
      "output:",
      "  - platform: gpio",
      "    pin: GPIO15",
    ].join("\n");

    const parsed = logic.parseEsphomeYaml(yaml);
    assert.ok(parsed.ok, "Expected YAML to be detected as ESPHome");
    assert.strictEqual(parsed.board, "rpipicow");
    assert.ok(parsed.usedPins.has(15), "Expected GPIO15 usage to be detected");
  });

  test("detects nrf52 board and parses P0/P1 pin notation", () => {
    const yaml = [
      "esphome:",
      "  name: xiao-ble",
      "nrf52:",
      "  board: xiao_ble",
      "output:",
      "  - platform: gpio",
      "    pin: P0.26",
      "  - platform: gpio",
      "    pin:",
      "      number: P1.11",
    ].join("\n");

    const parsed = logic.parseEsphomeYaml(yaml);
    assert.ok(parsed.ok, "Expected YAML to be detected as ESPHome");
    assert.strictEqual(parsed.board, "xiao_ble");
    assert.ok(parsed.usedPins.has(26), "Expected P0.26 to map to GPIO26");
    assert.ok(parsed.usedPins.has(43), "Expected P1.11 to map to GPIO43");
  });

  test("backfills name/id for ultrasonic trigger/echo pins", () => {
    const yaml = [
      "esphome:",
      "  name: test",
      "esp32:",
      "  board: esp32dev",
      "sensor:",
      "  - platform: ultrasonic",
      "    trigger_pin: GPIO2",
      "    id: parking_distance",
      "    echo_pin: GPIO1",
      '    name: "Parking Distance Ultrasonic Sensor"',
      "    update_interval: 5s",
    ].join("\n");

    const parsed = logic.parseEsphomeYaml(yaml);
    assert.ok(parsed.ok, "Expected YAML to be detected as ESPHome");

    const trigger = (parsed.usedPins.get(2) || []).find((u) => u.key === "trigger_pin");
    const echo = (parsed.usedPins.get(1) || []).find((u) => u.key === "echo_pin");

    assert.ok(trigger, "Expected trigger_pin usage on GPIO2");
    assert.ok(echo, "Expected echo_pin usage on GPIO1");

    assert.strictEqual(trigger.line, 7);
    assert.strictEqual(echo.line, 9);
    assert.strictEqual(trigger.id, "parking_distance");
    assert.strictEqual(echo.id, "parking_distance");
    assert.strictEqual(trigger.name, "Parking Distance Ultrasonic Sensor");
    assert.strictEqual(echo.name, "Parking Distance Ultrasonic Sensor");
  });
});
