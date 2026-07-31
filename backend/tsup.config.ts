import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  shims: true,
  external: ["@prisma/client", "prisma"],
});
