const path = require("path");
const { runTests } = require("@vscode/test-electron");

async function main() {
  try {
    // Ensure VS Code's Electron launches in app mode on macOS.
    if (process.env.ELECTRON_RUN_AS_NODE) {
      delete process.env.ELECTRON_RUN_AS_NODE;
    }

    const extensionDevelopmentPath = path.resolve(__dirname, "..");
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");
    await runTests({ extensionDevelopmentPath, extensionTestsPath });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
