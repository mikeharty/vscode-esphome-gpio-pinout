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

## Build (package)

```sh
npm run build
```

The build command produces a `.vsix` package in the repository root.

## Project layout

- `extension.js`: Extension activation + VS Code integration
- `media/`: Webview UI (JS/CSS)
- `test/`: Extension test harness
- `.vscode/`: Debug configuration for Extension Host
