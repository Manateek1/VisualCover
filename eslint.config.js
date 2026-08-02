import eslint from "@eslint/js";
import babelParser from "@babel/eslint-parser";
import globals from "globals";

export default [
  { ignores: ["dist", "coverage", "src-tauri/target", "docs/design"] },
  eslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    languageOptions: {
      ecmaVersion: 2024,
      globals: { ...globals.browser, ...globals.node },
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: [
            "@babel/preset-typescript",
            ["@babel/preset-react", { runtime: "automatic" }],
          ],
        },
      },
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-console": ["warn", { "allow": ["info", "warn", "error"] }]
    },
  },
];
