import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: {
    "@": fileURLToPath(new URL("./apps/audience-web/src", import.meta.url)),
    "@layertalk/billing-channel": fileURLToPath(new URL("./apps/presenter-app/src/lib/billing.direct.ts", import.meta.url)),
  } },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["apps/**/*.test.{ts,tsx}", "packages/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
