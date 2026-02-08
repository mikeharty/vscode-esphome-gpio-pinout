const Mocha = require("mocha");
const path = require("path");

function run() {
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
  });

  const testsRoot = __dirname;
  mocha.addFile(path.resolve(testsRoot, "./extension.test.js"));
  mocha.addFile(path.resolve(testsRoot, "./logic.test.js"));
  mocha.addFile(path.resolve(testsRoot, "./pinout-data.test.js"));

  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} tests failed.`));
      } else {
        resolve();
      }
    });
  });
}

module.exports = {
  run,
};
