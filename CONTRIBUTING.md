# Contributing

Thanks for helping improve this extension!

## Quick start

1. Install dependencies: `npm install`
2. Run the Extension Host from VS Code (`F5`)
3. Use `npm run lint` and `npm test` before opening a PR

See `DEVELOPMENT.md` for detailed setup and packaging instructions.

## Pinout data model

Pinouts live under `media/pinouts/` and are loaded by the webview at runtime.

- `media/pinouts/index.json`: the registry that maps board IDs and SoC variants to JSON files.
- `media/pinouts/boards/`: board layouts with headers and labeled pins.
- `media/pinouts/soc/`: SoC GPIO grids (no headers).

### `index.json` fields

- `boards`: map of ESPHome board IDs to a board JSON file path.
- `soc`: map of SoC variant keys (e.g., `esp32s3`) to a SoC JSON file path.
- `aliases`: map of alternate board IDs to a canonical board ID (e.g., memory variants).
- `boardSocAliases`: map of board IDs to a SoC variant and optional display name when a full board layout isn’t available.

### Board JSON shape

Board JSON files in `media/pinouts/boards/` should follow this shape:

```json
{
  "id": "esp32-s3-devkitc-1",
  "displayName": "ESP32-S3 DevKitC-1",
  "kind": "header-board",
  "headers": [
    {
      "name": "J1",
      "side": "left",
      "pins": [
        { "headerNo": 1, "label": "3V3", "gpio": null, "type": "power" },
        { "headerNo": 4, "label": "GPIO4", "gpio": 4, "type": "gpio" }
      ]
    }
  ],
  "notes": ["Optional notes shown in tooltips."]
}
```

Notes:
- `kind` must be `"header-board"`.
- `side` is `"left"` or `"right"`.
- `type` is one of `power`, `ground`, `reset`, `gpio`.
- Use `gpio: null` for non‑GPIO pins.

### SoC JSON shape

SoC JSON files in `media/pinouts/soc/` should follow this shape:

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

## Adding a new board

1. Create a new JSON file under `media/pinouts/boards/`.
2. Add an entry in `media/pinouts/index.json` under `boards`.
3. If the board has known aliases (e.g., memory variants), add them to `aliases`.
4. Run `npm run lint` and `npm test`.

## Adding a new SoC

1. Create a new JSON file under `media/pinouts/soc/`.
2. Add an entry in `media/pinouts/index.json` under `soc`.
3. If a board should fall back to this SoC grid, add it to `boardSocAliases`.
4. Run `npm run lint` and `npm test`.
