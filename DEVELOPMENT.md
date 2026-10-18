# Development

## Prerequisites

- Node.js 18+ (LTS recommended)
- VS Code 1.85+ (Extension Host)

## Setup

```sh
npm install
```

## Run the extension

1. Open this folder in VS Code.
2. Press `F5` (Run Extension) to launch an Extension Host window.
3. In the Extension Host, open an ESPHome YAML file and run **ESPHome: GPIO Pinout** from the command palette.

## Lint

```sh
npm run lint
```

## Tests

```sh
npm test
```

## Pinout data sync

Pinout files under `media/pinouts/` are generated from locked upstream commits.

Update lock + regenerate:

```sh
npm run pinouts:update
```

Regenerate from current lock:

```sh
npm run pinouts:build
```

Verify committed generated outputs match the lock:

```sh
npm run pinouts:check
```

## Regenerating images

Marketplace/editor icons are rendered from `media/esphome-gpio-pinout-icon.svg`
(the master) with `rsvg-convert` (`brew install librsvg`):

```sh
rsvg-convert -w 512 -h 512 media/esphome-gpio-pinout-icon.svg -o media/esphome-gpio-pinout-512.png
rsvg-convert -w 128 -h 128 media/esphome-gpio-pinout-icon.svg -o media/esphome-gpio-pinout-128.png
```

`package.json` ships the 128px PNG; the 512px render and the SVG masters are
repo-only (see `.vscodeignore`). The editor title icons
(`-icon-light.svg` / `-icon-dark.svg`) are hand-authored on a 24px viewBox with a
1.5 stroke so they land on 1px lines at their 16px render size — check any edit
at 16px, not just zoomed in.

README screenshots are captured from the real webview rather than mocked up. The
panel HTML in `getWebviewHtml()` only needs `acquireVsCodeApi()` stubbed and an
`{type:"update"}` message replayed, so a static harness page plus headless Chrome
reproduces it exactly. Two things to watch when reframing a capture:

- `centerBoardInViewport()` centres the _board_, not the whole SVG. When the
  scaled diagram is shorter than the panel it shifts the layer up, which slides
  the board's title block under the header. Size the window so the scaled
  diagram roughly fills the diagram column and the shift goes to zero.
- Board-photo layouts (`data-fit-mode="tall-board"`) fit to width, so the
  diagram's height follows the window _width_. Widen the window to grow the
  board; don't reach for the zoom control, which overflows and clips instead.

Save screenshots as PNG — they are mostly small UI text, which JPEG rings around.

## Build (package)

```sh
npm run build
```

The build command produces a `.vsix` package in `./build/`.

## Project layout

- `extension.js`: Extension activation + VS Code integration
- `media/`: Webview UI (JS/CSS)
- `scripts/sync-pinouts.mjs`: pinout ingestion/generation pipeline
- `test/`: Extension test harness
- `.vscode/`: Debug configuration for Extension Host
