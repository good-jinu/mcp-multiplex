import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/adapters/express.ts",
    "src/adapters/hono.ts",
    "src/adapters/fastify.ts",
    "src/adapters/next.ts",
    "src/adapters/fetch.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  deps: {
    neverBundle: [
      "@modelcontextprotocol/server",
      "@modelcontextprotocol/hono",
      "express",
      "fastify",
      "hono",
      "zod",
    ],
  },
});
