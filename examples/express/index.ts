import { McpServer, WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import express from "express";
import { createExpressRouter, defineAction, defineToolGroup, registerMcpTools } from "mcp-multiplex";
import { z } from "zod";

// 1. Define Domain Actions
const searchDocs = defineAction({
  name: "search_documents",
  description: "Search workspace documentation",
  effect: "read",
  input: z.object({ query: z.string(), limit: z.coerce.number().default(10) }),
  http: { method: "get", path: "/documents/search" },
  handler: async (ctx, input) => {
    return {
      requester: ctx.user?.email || "anonymous",
      results: [`Document match for: ${input.query}`],
      limit: input.limit,
    };
  },
});

const createIssue = defineAction({
  name: "create_issue",
  description: "Create a new issue ticket",
  effect: "write",
  input: z.object({ title: z.string().min(1), priority: z.enum(["low", "high"]) }),
  http: { method: "post", path: "/issues" },
  handler: async (ctx, input) => {
    return {
      id: `issue_${Date.now()}`,
      creator: ctx.user?.email || "anonymous",
      title: input.title,
      priority: input.priority,
    };
  },
});

const updateBilling = defineAction({
  name: "update_billing",
  description: "Update credit card details",
  effect: "write",
  input: z.object({ token: z.string() }),
  http: { method: "post", path: "/billing/card" },
  mcp: false, // 🛡️ Excluded from AI tools
  handler: async (_ctx, input) => {
    return { success: true, token: input.token };
  },
});

// 2. Define MCP Tool Groups
const toolGroups = [
  defineToolGroup({
    name: "read_assets",
    title: "Read Operations",
    effect: "read",
    summary: "Inspect and search workspace assets",
    actions: [searchDocs],
  }),
  defineToolGroup({
    name: "manage_assets",
    title: "Write Operations",
    effect: "write",
    summary: "Create and update workspace resources",
    actions: [createIssue, updateBilling], // updateBilling will be automatically filtered out
  }),
];

// 3. Express Application Setup
const app = express();
app.use(express.json());

// Mock Auth
app.use((req, _res, next) => {
  (req as any).user = { id: "usr_1", email: "alice@example.com" };
  next();
});

// Mount HTTP REST API routes (GET /api/documents/search, POST /api/issues, POST /api/billing/card)
app.use("/api", createExpressRouter([searchDocs, createIssue, updateBilling]));

// Mount MCP Streamable HTTP endpoint at /mcp
app.post("/mcp", async (req, res) => {
  const server = new McpServer({ name: "express-mcp-demo", version: "1.0.0" });
  const user = (req as any).user;

  registerMcpTools(server, user, toolGroups);

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);

  // Convert Node req to Web Standard fetch Request
  const fullUrl = `http://${req.headers.host}${req.url}`;
  const webReq = new Request(fullUrl, {
    method: req.method,
    headers: req.headers as any,
    body: JSON.stringify(req.body),
  });

  const webRes = await transport.handleRequest(webReq, { parsedBody: req.body });
  res.status(webRes.status);
  webRes.headers.forEach((v, k) => {
    res.setHeader(k, v);
  });
  res.send(await webRes.text());
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Express REST + MCP server running at http://localhost:${PORT}`);
  console.log(`- REST endpoints: /api/documents/search, /api/issues, /api/billing/card`);
  console.log(`- MCP endpoint: POST /mcp`);
});
