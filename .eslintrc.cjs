module.exports = {
  root: true,
  env: {
    es2021: true,
    node: true,
  },
  extends: ["eslint:recommended"],
  parserOptions: {
    ecmaVersion: "latest",
  },
  ignorePatterns: ["node_modules", ".vscode-test", "out", "dist"],
  overrides: [
    {
      files: ["media/**/*.js"],
      env: {
        browser: true,
        es2021: true,
      },
      globals: {
        acquireVsCodeApi: "readonly",
      },
    },
    {
      files: ["test/**/*.js"],
      env: {
        mocha: true,
        node: true,
        es2021: true,
      },
    },
  ],
};
