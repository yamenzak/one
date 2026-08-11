import { defineConfig } from "vitest/config";

/* ⚠️ Both extensions named in full. A `?(x)` glob is correct to vitest and
   opaque to the guard registry, which reads this file to prove a check it has
   been promised actually runs. */
export default defineConfig({
  test: { include: ["test/**/*.test.ts", "test/**/*.test.tsx"] },
});
