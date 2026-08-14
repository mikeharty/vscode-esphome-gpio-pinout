# ESPHome GPIO Pinout

[![Version](https://badgen.net/vs-marketplace/v/mikeharty.esphome-gpio-pinout?label=version)](https://marketplace.visualstudio.com/items?itemName=mikeharty.esphome-gpio-pinout)
[![Downloads](https://badgen.net/vs-marketplace/d/mikeharty.esphome-gpio-pinout?label=downloads)](https://marketplace.visualstudio.com/items?itemName=mikeharty.esphome-gpio-pinout)
[![Rating](https://badgen.net/vs-marketplace/rating/mikeharty.esphome-gpio-pinout?label=rating)](https://marketplace.visualstudio.com/items?itemName=mikeharty.esphome-gpio-pinout)
[![License](https://badgen.net/github/license/mikeharty/vscode-esphome-gpio-pinout)](LICENSE)

![ESPHome GPIO Pinout](media/esphome-gpio-pinout-ss.jpg)

This extension adds a GPIO pinout overlay for ESPHome board GPIO pins. It inspects the active ESPHome YAML file, detects used GPIO pins, and renders a board pinout. Warnings are displayed for pins used in the YAML that are problematic or not available on the selected board.

## Usage

1. Open an ESPHome YAML file in VS Code (language mode must be YAML).
2. Open the pinout pane using any of these:
   - Editor title button: **GPIO Pinout** (YAML editors)
   - Command palette: **ESPHome: GPIO Pinout**
3. Optional: enable automatic opening for ESPHome-like YAML files:
   - Setting: `esphomeGpioPinout.autoOpen`
   - Default: `false`
4. Click a pin or line button to jump to the YAML location.
5. Zoom with the header controls, `Ctrl/Cmd + scroll`, or the `+` / `-` / `0` keys; click the percentage to reset.

## Supported platforms

- **ESP32** (`esp32:`) — all ESPHome variants: ESP32, S2, S3, C2, C3, C5, C6, H2, P4
- **ESP8266** (`esp8266:`) — including silkscreen aliases like `D1`, `A0`, `RX`, `LED` per board
- **RP2040** (`rp2040:`) — Raspberry Pi Pico / Pico W
- **nRF52** (`nrf52:`) — including `P0.x` / `P1.x` pin notation
- **LibreTiny** (`bk72xx:` / `rtl87xx:`) — Tuya-style modules (CB2S, WB3S, WR3, ...) with `P#` / `PA##` pin names, each rendered with the module's actual broken-out pins

![LibreTiny module pinout](media/esphome-gpio-pinout-ss-libretiny.jpg)

Pin usages are detected from `pin:`, `*_pin:`, `pin_a`–`pin_d`, `sda:`/`scl:`, and `*_pins:` lists, through substitutions (`${sub}` or `$sub`) and nested `number:` blocks. Pins that live on I/O expanders (`pcf8574`, `mcp23017`, ...) are recognized and excluded from the board pinout.

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for setup, debugging, testing, and packaging details.

## Pinout Data Sources

Pinout data is generated from locked upstream commits and committed into this repo:

- PlatformIO board manifests (`pioarduino/platform-espressif32` — the fork ESPHome builds with — and `platform-espressif8266`) for board ID scope and SoC mapping.
- Wokwi custom board definitions (`board.json` + `board.svg`) for SVG-backed board layouts.
- Adafruit WipperSnapper board definitions for matched board GPIO subsets when no Wokwi layout exists.
- LibreTiny board definitions for `bk72xx`/`rtl87xx` module pin subsets and silkscreen aliases.
- Built-in SoC rule tables for chip-level warnings and fallback rendering.

Update and verify data with:

```sh
npm run pinouts:update
npm run pinouts:build
npm run pinouts:check
```

## Notes

- The extension reads from the active editor, including unsaved changes, and auto-refreshes on file save. The panel stays on the last ESPHome YAML when you switch to other files.
- Board coverage includes all ESPHome-relevant PlatformIO IDs for ESP32 + ESP8266, LibreTiny modules, and nRF52/RP2040 boards — with SoC fallback rendering when full board artwork is unavailable.
- The extension uses a simple YAML parser and may not handle all ESPHome YAML constructs (e.g. `!include` / `packages:` are not expanded). Please file an issue if you encounter problems.
- Feedback and contributions are welcome!

## Thanks

Thanks to the projects that provide the board and pinout source data used by this extension:

- [wokwi/wokwi-boards](https://github.com/wokwi/wokwi-boards)
- [pioarduino/platform-espressif32](https://github.com/pioarduino/platform-espressif32)
- [platformio/platform-espressif8266](https://github.com/platformio/platform-espressif8266)
- [adafruit/Wippersnapper_Boards](https://github.com/adafruit/Wippersnapper_Boards)
- [libretiny-eu/libretiny](https://github.com/libretiny-eu/libretiny)
