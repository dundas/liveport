// ESLint flat config for tunnel-server
// Minimal config to pass lint checks during deployment

import globals from "globals";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "*.d.ts"
    ]
  },
  {
    files: ["**/*.js", "**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2021
      },
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      }
    },
    rules: {
      // Very permissive - just prevent syntax errors
      "no-console": "off"
    }
  }
];
