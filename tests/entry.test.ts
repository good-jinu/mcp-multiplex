import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const OPTIONAL_PEERS = ["express", "fastify", "hono", "@modelcontextprotocol/server", "@modelcontextprotocol/hono"];

/** Every package (non-relative) import reachable from `entry`, following relative imports. */
function packageImports(entry: string, seen = new Set<string>()): Set<string> {
  const packages = new Set<string>();
  if (seen.has(entry)) return packages;
  seen.add(entry);

  const source = readFileSync(entry, "utf8");
  for (const [, typeOnly, spec] of source.matchAll(/^\s*(?:import|export)\s+(type\s+)?[^;]*?from\s+"([^"]+)"/gms)) {
    if (typeOnly) continue; // erased at build time
    if (spec!.startsWith(".")) {
      const next = resolve(dirname(entry), spec!.replace(/\.js$/, ".ts"));
      for (const pkg of packageImports(next, seen)) packages.add(pkg);
    } else {
      packages.add(spec!);
    }
  }
  return packages;
}

describe("package entry points", () => {
  it("the root entry loads no optional peer, so it works with only zod installed", () => {
    const imports = packageImports(resolve(SRC, "index.ts"));
    expect([...imports]).toEqual(["zod"]);
  });

  it.each([
    ["express", ["express"]],
    ["fastify", []], // a plugin: it only uses Fastify types
    ["hono", ["hono"]],
    ["fetch", []],
    ["next", ["@modelcontextprotocol/server"]],
  ])("the %s adapter loads only its own peers", (adapter, peers) => {
    const imports = [...packageImports(resolve(SRC, `adapters/${adapter}.ts`))].filter((p) =>
      OPTIONAL_PEERS.includes(p),
    );
    expect(imports.sort()).toEqual([...peers].sort());
  });
});
