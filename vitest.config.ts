import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    environment: "node",
    reporters: [
      "default",
      ["junit", { outputFile: "fixtures/bridge/vitest-junit.xml" }],
    ],
  },
});
