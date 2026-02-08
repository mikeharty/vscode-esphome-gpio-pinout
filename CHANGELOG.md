# Change Log

## [0.2.0] - 2026-02-08

- Added automated pinout ingestion from locked upstream sources with `pinouts:update`, `pinouts:build`, and `pinouts:check`.
- Expanded board coverage to ESP32 + ESP8266 PlatformIO IDs, plus `adafruit_feather_nrf52840`, `adafruit_itsybitsy_nrf52840`, `xiao_ble`, and `rpipicow`.
- Added SVG board rendering from generated assets with improved centering, dynamic sizing, richer labels, and cleaner tooltips.
- Improved parser support for `esp8266`, `rp2040`, and `nrf52` board blocks, including nRF `P0.x/P1.x` pin syntax and ultrasonic `trigger_pin`/`echo_pin` name propagation.
- Added SoC-aware warning overlays and updated warning styling for clearer warning vs danger states.
- Added release-time pinout drift verification in CI and integrated Prettier (`format` / `format:check`) for consistent formatting.
