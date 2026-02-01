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

 The build command produces a `.vsix` package in `./build/`.

## Release

Releases are automated from git tags that match `vX.Y.Z`.

1. Update `package.json` version (semver) and commit.
2. Create and push a tag that matches the version:

```sh
git tag v0.1.3
git push origin v0.1.3
```

The release workflow builds the VSIX, creates a GitHub Release, and publishes to the VS Code Marketplace.
Ensure the repo secret `VSCE_PAT` is set with a Marketplace Personal Access Token.

## Project layout

- `extension.js`: Extension activation + VS Code integration
- `media/`: Webview UI (JS/CSS)
- `test/`: Extension test harness
- `.vscode/`: Debug configuration for Extension Host
