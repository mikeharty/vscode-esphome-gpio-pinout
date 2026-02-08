# Contributing

Thanks for helping improve this extension!

## Quick start

1. Install dependencies: `npm install`
2. Run the Extension Host from VS Code (`F5`)
3. Use `npm run pinouts:check`, `npm run lint`, and `npm test` before opening a PR

See `DEVELOPMENT.md` for detailed setup and packaging instructions.

## Pinout data model

Pinouts live under `media/pinouts/` and are loaded by the webview at runtime. Most files are generated and should not be edited manually.

- `media/pinouts/index.json`: generated registry (schema v2) with source metadata, board mappings, aliases, and SoC fallbacks.
- `media/pinouts/boards/generated/`: generated board definitions (`svg-board` and board-specific `soc-grid` files).
- `media/pinouts/assets/wokwi/`: copied SVG assets for Wokwi-backed boards.
- `media/pinouts/soc/`: generated SoC GPIO/rule definitions.
- `media/pinouts/targets.json`: generated source-of-truth board scope for integrity tests.
- `media/pinouts/generated-manifest.json`: generated managed-file list used by `pinouts:check`.
- `scripts/pinout-sources.lock.json`: commit-pinned upstream source lock.
- `scripts/sync-pinouts.mjs`: ingestion/generation script.

### `index.json` fields

- `schemaVersion`: currently `2`.
- `generated`: lock timestamp, source SHAs, and board counts.
- `boards`: map of ESPHome board IDs to a board JSON file path.
- `soc`: map of SoC variant keys (e.g., `esp32s3`) to a SoC JSON file path.
- `aliases`: map of alternate board IDs to a canonical board ID (e.g., memory variants).
- `boardSocAliases`: map of board IDs to a SoC variant and optional display name when a full board layout isn’t available.

### Board JSON shape

Generated board definitions support:

```json
{
  "id": "esp32-s3-devkitc-1",
  "displayName": "Espressif ESP32-S3-DevKitC-1-N8 (8 MB QD, No PSRAM)",
  "kind": "svg-board",
  "socRef": "esp32s3",
  "svgPath": "assets/wokwi/esp32-s3-devkitc-1.svg",
  "sizeMm": { "width": 25.527, "height": 70.057 },
  "pins": [{ "label": "TX", "x": 24.19, "y": 10.207, "targetRaw": "GPIO43", "gpio": 43, "type": "gpio" }]
}
```

Other possible `kind` values are:

- `header-board`: legacy/manual left/right header render.
- `soc-grid`: grid render using `gpios`.

### SoC JSON shape

```json
{
  "id": "esp32s3",
  "variant": "esp32s3",
  "kind": "soc-grid",
  "displayName": "ESP32-S3 (SoC pin grid)",
  "gpios": [0, 1, 2, 3, 4, 5]
}
```

Notes:

- `kind` must be `"soc-grid"`.
- `gpios` is the list of available GPIO numbers for that SoC.

## Regenerating pinout data

Run:

```sh
npm run pinouts:update
```

This updates the source lock to latest upstream branch heads and regenerates all managed pinout files.

If you only want to rebuild from the existing lock:

```sh
npm run pinouts:build
```

To validate that committed generated files are in sync with the lock:

```sh
npm run pinouts:check
```
