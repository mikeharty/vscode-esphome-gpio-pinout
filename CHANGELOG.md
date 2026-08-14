# Change Log

## [1.0.0] - 2026-08-14

Major release: new platforms, smarter pin parsing, and a refreshed UI.

### New platforms & boards

- LibreTiny support: `bk72xx:` (Beken BK7231) and `rtl87xx:` (Realtek RTL8710B / RTL8720C) platform blocks, with 56 module boards (CB2S, CB3S, CBU, WB2S, WB3S, WR3, T34, and more) rendered with each module's actual broken-out pin subset, silkscreen `P#`/`PA##` labels, and flashing/log-UART warnings derived from LibreTiny data.
- New ESP32 variants: ESP32-C2, ESP32-C5, ESP32-H2, and ESP32-P4 SoC grids with strapping-pin, flash, USB-JTAG, and ADC annotations.
- ESP32 board data now syncs from `pioarduino/platform-espressif32` — the fork ESPHome actually builds with — adding boards such as ESP32-H2-DevKitM-1, ESP32-P4, ESP32-C5-DevKitC-1, XIAO ESP32-C5, and M5Stack Tab5.
- New board artwork from Wokwi: Raspberry Pi Pico, AZ-Delivery DevKit V4, and the ESP32-H2/C5/P4 devkits.
- Board ID coverage grew from 292 to 402 targets.

### Pin parsing

- Silkscreen alias resolution: `D1`/`A0`/`LED`/`RX` on ESP8266 resolve through per-board tables (mirroring ESPHome's own mappings), `P26` resolves on `bk72xx`, and `PA05`/`PA_05` resolve on `rtl87xx`. Previously `pin: D1` was digit-guessed as GPIO1; on a D1 Mini it now correctly resolves to GPIO5 — or is flagged unresolved rather than shown wrong.
- `$substitution` references without braces are now supported (previously only `${substitution}`).
- Pins on I/O expanders (`pcf8574`, `mcp23017`, `sn74hc595`, `sx1509`, ...) are no longer misattributed to board GPIOs.
- Trailing `# comments` on pin values no longer mark the pin as "guessed".
- New pin keys: `pin_a`–`pin_d` (steppers, h-bridge fans, rotary encoders) and `*_pins` lists (e.g. `esp32_camera` `data_pins`), in both `[flow]` and block list styles.

### Fixes

- The `autoOpen` setting never triggered due to a broken heuristic regex.
- Edits that kept the file length unchanged (e.g. `GPIO4` → `GPIO5`) did not refresh the panel; change detection now hashes the content.
- SoC-fallback boards displayed every pin warning twice.
- The SoC pin grid overflowed the panel horizontally at 100% zoom.
- ESP32 GPIO16/17 are no longer flagged "danger" unconditionally — danger only when quad PSRAM is enabled, informational otherwise (they are ordinary GPIOs on WROOM modules).
- Switching focus to a non-YAML editor no longer blanks the panel; it stays on the last ESPHome document.
- The panel is restored after a window reload instead of closing.

### UI

- Refreshed header: detected board name in the title, segmented zoom control with click-to-reset, `Ctrl/Cmd + scroll` zoom, and `+`/`-`/`0` keyboard shortcuts.
- New legend bar, summary chips (pins used / warnings / dangers / unresolved), and hover cross-highlighting between the pin list and the diagram.
- Silkscreen labels on SoC grids (D-names on ESP8266 boards, `P#`/`PA##` on LibreTiny modules) with the existing GPIO/silkscreen toggle.
- Clearer unresolved-pin hints (distinguishes unknown board aliases from unparseable values) and refreshed empty states.

## [0.2.6] - 2026-05-01

- Added regression coverage for ESPHome `i2c` `sda`/`scl` pin detection, including list-form buses.
- Fixed `sda`/`scl` substitutions so referenced I2C GPIO substitutions no longer appear as unused.

## [0.2.5] - 2026-04-10

- Fixed commit attribution, thanks [@brookjordan](https://github.com/brookjordan))

## [0.2.4] - 2026-04-08

- Substitution-aware board detection, GUESSED pin badge, and Unused GPIO Substitutions panel (thanks [@brookjordan](https://github.com/brookjordan))
- New boards: `esp01`, `esp01_1m`, `lolin32_lite`, `m5stack-cores3`, `nologo_esp32c3_super_mini` (thanks [@brookjordan](https://github.com/brookjordan))

## [0.2.3] - 2026-02-09

- Added a light theme
- Added UI component to switch between GPIO / Silkscreen labels
  - Saves user preference
  - Only rendered if silkscreen labels are meaningfully different from GPIO labels
- Reworked zoom/centering: boards stay centered, horizontal scroll appears only when needed

## [0.2.2] - 2026-02-09

- Fixed editor icon SVG locations in package.json

## [0.2.1] - 2026-02-09

- Fixed ESPHome language YAML files not triggering extension

## [0.2.0] - 2026-02-08

- Added automated pinout ingestion from locked upstream sources with `pinouts:update`, `pinouts:build`, and `pinouts:check`.
- Expanded board coverage to ESP32 + ESP8266 PlatformIO IDs, plus `adafruit_feather_nrf52840`, `adafruit_itsybitsy_nrf52840`, `xiao_ble`, and `rpipicow`.
- Added SVG board rendering from generated assets with improved centering, dynamic sizing, richer labels, and cleaner tooltips.
- Improved parser support for `esp8266`, `rp2040`, and `nrf52` board blocks, including nRF `P0.x/P1.x` pin syntax and ultrasonic `trigger_pin`/`echo_pin` name propagation.
- Added SoC-aware warning overlays and updated warning styling for clearer warning vs danger states.
- Added release-time pinout drift verification in CI and integrated Prettier (`format` / `format:check`) for consistent formatting.
