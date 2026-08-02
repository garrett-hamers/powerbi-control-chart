import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import powerbiVisualsConfigs from "eslint-plugin-powerbi-visuals";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"]
  },
  powerbiVisualsConfigs.configs.recommended,
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
        project: "./tsconfig.json"
      }
    },
    plugins: {
      "@typescript-eslint": tseslint
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "no-console": "error",
      "no-constant-condition": "error"
    }
  },
  {
    files: ["scripts/**/*.mjs"],
    rules: {
      "no-console": "error"
    }
  }
];
