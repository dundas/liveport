import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "db/index": "src/db/index.ts",
    "db/migrations/index": "src/db/migrations/index.ts",
    "db/migrations/all": "src/db/migrations/all.ts",
    "redis/index": "src/redis/index.ts",
    "keys/index": "src/keys/index.ts",
    "auth/index": "src/auth/index.ts",
    "crypto/index": "src/crypto/index.ts",
    "logging/index": "src/logging/index.ts",
    "email/index": "src/email/index.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
});
