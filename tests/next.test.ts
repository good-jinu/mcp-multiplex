import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMcpHandler, createNextHandler } from "../src/adapters/next.js";
import { defineAction, defineToolGroup } from "../src/index.js";

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
    cors: true,
  });

  it("should handle Next.js App Router GET requests", async () => {
    const req = new Request("http://localhost/api/products/p123", { method: "GET" });
    const res = await handler.GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
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

  it("should normalize trailing slash on MCP endpoint (/api/mcp/)", async () => {
    const mcpReq = new Request("http://localhost/api/mcp/", {
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

  it("should handle CORS preflight OPTIONS request", async () => {
    const optionsReq = new Request("http://localhost/api/mcp", { method: "OPTIONS" });
    const res = await handler.OPTIONS(optionsReq);

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    expect(res.headers.get("access-control-allow-headers")).toContain("MCP-Protocol-Version");
  });

  it("should auto-extract actions from toolGroups when actions array is omitted", async () => {
    const autoHandler = createNextHandler({
      toolGroups, // actions is omitted
      basePath: "/api",
    });

    const req = new Request("http://localhost/api/products/p999", { method: "GET" });
    const res = await autoHandler.GET(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: "anon", product: "p999" });
  });

  describe("createMcpHandler (dedicated MCP route)", () => {
    const mcpOnlyHandler = createMcpHandler({
      tools: [getProduct], // Direct 1:1 action tool!
      serverName: "dedicated-mcp",
      cors: true,
      getContext: () => ({ id: "mcp_user_100" }),
    });

    it("should handle MCP initialize and tools/list with direct action tools", async () => {
      // 1. OPTIONS preflight
      const optRes = await mcpOnlyHandler.OPTIONS(new Request("http://localhost/api/mcp", { method: "OPTIONS" }));
      expect(optRes.status).toBe(204);
      expect(optRes.headers.get("access-control-allow-origin")).toBe("*");

      // 2. tools/list
      const listReq = new Request("http://localhost/api/mcp", {
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

      const listRes = await mcpOnlyHandler.POST(listReq);
      expect(listRes.status).toBe(200);
      const listData: any = await listRes.json();
      expect(listData.result.tools[0].name).toBe("get_product");

      // 3. tools/call directly
      const callReq = new Request("http://localhost/api/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2025-11-25",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "get_product",
            arguments: { id: "direct_item" },
          },
        }),
      });

      const callRes = await mcpOnlyHandler.POST(callReq);
      expect(callRes.status).toBe(200);
      const callData: any = await callRes.json();
      expect(JSON.parse(callData.result.content[0].text)).toEqual({
        user: "mcp_user_100",
        product: "direct_item",
      });
    });
  });
});
