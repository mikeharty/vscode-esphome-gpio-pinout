const assert = require("assert");
const vscode = require("vscode");

suite("ESPHome GPIO Pinout", () => {
  test("command is registered", async () => {
    const extension = vscode.extensions.getExtension("mikeharty.esphome-gpio-pinout");
    assert.ok(extension, "Extension not found");
    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("esphomeGpioPinout.open"), "Command not registered");
  });
});
