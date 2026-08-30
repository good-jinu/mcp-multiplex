import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createNextHandler, defineAction, defineToolGroup } from "../src/index.js";

describe("mcp-multiplex Next.js App Router Adapter", () => {
  const getProduct = defineAction({
    name: "get_product",
    description: "Get product",
    effect: "read",
    input: z.object({ id: z.string() }),
    http: { method: "get", path: "/products/:id" },
    handler: async (ctx, input) => ({ user: ctx?.id || "anon", product: input.id }),
  });

  const createProduct = defineAction({
    name: "create_product",
    description: "Create product",
    effect: "write",
    input: z.object({ name: z.string().min(2) }),
    http: { method: "post", path: "/products" },
    handler: async (_ctx, input) => ({ id: "prod_1", name: input.name }),
  });

  const toolGroups = [
    defineToolGroup({
      name: "product_tools",
      effect: "read",
      summary: "Product tools",
      actions: [getProduct],
    }),
  ];

  const handler = createNextHandler({
    actions: [getProduct, createProduct],
    toolGroups,
    basePath: "/api",
    mcpPath: "/api/mcp",
    getUser: () => ({ id: "next_user_42" }),
  });

  it("should handle Next.js App Router GET requests", async () => {
    const req = new Request("http://localhost/api/products/p123", { method: "GET" });
    const res = await handler.GET(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: "next_user_42", product: "p123" });
  });

  it("should handle Next.js App Router POST requests", async () => {
    const req = new Request("http://localhost/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Mechanical Keyboard" }),
    });
    const res = await handler.POST(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "prod_1", name: "Mechanical Keyboard" });
  });

  it("should dispatch to MCP endpoint when requesting /api/mcp", async () => {
    const mcpReq = new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    const mcpRes = await handler.POST(mcpReq);
    expect(mcpRes.status).toBe(200);
    const mcpData: any = await mcpRes.json();
    expect(mcpData.result.tools).toBeDefined();
    expect(mcpData.result.tools[0].name).toBe("product_tools");
  });
});
