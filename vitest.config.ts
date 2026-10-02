import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["plugins/*/src/**/*.test.ts", "plugins/*/src/**/*.test.tsx", "template/src/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "happy-dom",
  },
});
