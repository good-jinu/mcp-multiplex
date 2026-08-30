import { createMcpHonoApp } from "@modelcontextprotocol/hono";
import { McpServer, WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { z } from "zod";
import { createHonoRoutes, defineAction, defineToolGroup, registerMcpTools } from "../src/index.js";

// 1. Define Actions
const getOrder = defineAction({
  name: "get_order",
  description: "Get order status and details",
  effect: "read",
  input: z.object({ orderId: z.string() }),
  http: { method: "get", path: "/orders/:orderId" },
  handler: async (ctx, input) => {
    return {
      orderId: input.orderId,
      status: "delivered",
      requestedBy: ctx.user?.email || "anonymous",
    };
  },
});

const createOrder = defineAction({
  name: "create_order",
  description: "Create a new product order",
  effect: "write",
  input: z.object({ productId: z.string(), quantity: z.number().int().min(1) }),
  http: { method: "post", path: "/orders" },
  handler: async (ctx, input) => {
    return {
      orderId: `ord_${Math.floor(Math.random() * 100000)}`,
      productId: input.productId,
      quantity: input.quantity,
      buyer: ctx.user?.email || "anonymous",
    };
  },
});

const deleteOrder = defineAction({
  name: "delete_order",
  description: "Permanently delete/cancel an order",
  effect: "destructive",
  input: z.object({ orderId: z.string() }),
  http: { method: "delete", path: "/orders/:orderId" },
  handler: async (_ctx, input) => {
    return { success: true, deletedOrderId: input.orderId };
  },
});

// 2. Define MCP Tool Groups
const toolGroups = [
  defineToolGroup({
    name: "read_tools",
    title: "Read Operations",
    effect: "read",
    summary: "Inspect and query order data",
    actions: [getOrder],
  }),
  defineToolGroup({
    name: "manage_tools",
    title: "Write Operations",
    effect: "write",
    summary: "Manage product orders",
    actions: [createOrder],
  }),
  defineToolGroup({
    name: "delete_tools",
    title: "Destructive Operations",
    effect: "destructive",
    summary: "Permanent deletion operations",
    actions: [deleteOrder],
  }),
];

// 3. Setup Hono App with @modelcontextprotocol/hono
const app = createMcpHonoApp();

// Auth Middleware
app.use("*", async (c, next) => {
  c.set("user", { id: "usr_hono_1", email: "hono_dev@example.com" });
  await next();
});

// Mount HTTP REST API routes
app.route("/api", createHonoRoutes([getOrder, createOrder, deleteOrder]));

// Mount MCP Streamable HTTP endpoint
app.all("/mcp", async (c) => {
  const user = c.get("user");
  const server = new McpServer({ name: "hono-mcp-demo", version: "1.0.0" });

  registerMcpTools(server, user, toolGroups);

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);

  return transport.handleRequest(c.req.raw, { parsedBody: c.get("parsedBody") });
});

export default app;
