import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./apps/audience-web/src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["apps/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
