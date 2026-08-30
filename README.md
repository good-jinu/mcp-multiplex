# `mcp-multiplex`

> **Effect-Grouped Action Multiplexing for Model Context Protocol (MCP) and Dual HTTP APIs.**

`mcp-multiplex` enables backend developers to define domain capabilities **once** and project them simultaneously into:
1. **Effect-Grouped MCP Tools** (`read`, `write`, `destructive`) with safety annotations (`readOnlyHint`, `destructiveHint`) for AI agents (Claude, Cursor, Copilot).
2. **Standard HTTP REST Routes** for Web/Mobile clients across **Hono, Express, Fastify, Next.js, and Web Standard Fetch**.

---

## 🚀 Why `mcp-multiplex`?

### The Problem with Standard MCP Integrations
* **Tool Explosion**: Converting 50 REST endpoints into 50 individual MCP tools floods the LLM context window with thousands of tokens on every turn.
* **Broken Safety Prompts**: MCP annotations (`readOnlyHint`, `destructiveHint`) are attached at the **tool level**. If you mix queries and deletions in a single tool, harmless `SELECT` queries trigger destructive confirmation warnings in Claude/Cursor.
* **Code Duplication**: Writing business logic, Zod validation, and auth checks once for your REST API and again for your MCP server.

### The Solution
`mcp-multiplex` groups actions by **Safety Effect** (`read`, `write`, `destructive`):
* The LLM sees only **3–5 high-level tools** (`read_tools`, `manage_tools`, `delete_tools`).
* Actions are dispatched dynamically with full Zod input validation and auth context injection.
* Sensitive human-only endpoints (`mcp: false` or `agent: false`) are excluded from AI tools by default.

---

## 📦 Installation

```bash
pnpm add mcp-multiplex zod @modelcontextprotocol/server
```

---

## ⚡ Quick Start: Define Actions & Tool Groups

```typescript
import { defineAction, defineToolGroup } from "mcp-multiplex";
import { z } from "zod";

// Define domain actions
export const searchDocs = defineAction({
  name: "search_documents",
  description: "Search workspace documents",
  effect: "read",
  input: z.object({ query: z.string(), limit: z.coerce.number().default(10) }),
  http: { method: "get", path: "/documents/search" },
  handler: async (ctx, input) => {
    return await db.documents.search(ctx.user.orgId, input);
  },
});

export const createIssue = defineAction({
  name: "create_issue",
  description: "Create a new issue ticket",
  effect: "write",
  input: z.object({ title: z.string().min(1), priority: z.enum(["low", "high"]) }),
  http: { method: "post", path: "/issues" },
  handler: async (ctx, input) => {
    return await db.issues.create({ userId: ctx.user.id, ...input });
  },
});

export const deleteIssue = defineAction({
  name: "delete_issue",
  description: "Permanently delete an issue",
  effect: "destructive",
  input: z.object({ id: z.string() }),
  http: { method: "delete", path: "/issues/:id" },
  handler: async (_ctx, input) => {
    return await db.issues.delete(input.id);
  },
});

// Group actions by effect into clean MCP tools
export const toolGroups = [
  defineToolGroup({
    name: "read_tools",
    title: "Read Operations",
    effect: "read", // Automatically marks tool as readOnlyHint: true
    summary: "Search and inspect documents.",
    actions: [searchDocs],
  }),
  defineToolGroup({
    name: "manage_tools",
    title: "Write Operations",
    effect: "write", // Automatically marks tool as readOnlyHint: false
    summary: "Create and update workspace resources.",
    actions: [createIssue],
  }),
  defineToolGroup({
    name: "delete_tools",
    title: "Destructive Operations",
    effect: "destructive", // Automatically marks tool as destructiveHint: true
    summary: "Permanently remove workspace resources.",
    actions: [deleteIssue],
  }),
];
```

---

## 🔌 Framework Adapters

### 1. Hono & `@modelcontextprotocol/hono`
```typescript
import { createMcpHonoApp } from "@modelcontextprotocol/hono";
import { registerMcpTools, createHonoRoutes } from "mcp-multiplex/hono";
import { searchDocs, createIssue, deleteIssue, toolGroups } from "./actions";

const app = createMcpHonoApp();

// Mount REST routes: GET /api/documents/search, POST /api/issues, DELETE /api/issues/:id
app.route("/api", createHonoRoutes([searchDocs, createIssue, deleteIssue]));

// Mount MCP Streamable HTTP endpoint
app.all("/mcp", async (c) => {
  const server = new McpServer({ name: "my-hono-mcp", version: "1.0.0" });
  registerMcpTools(server, c.get("user"), toolGroups);

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(c.req.raw, { parsedBody: c.get("parsedBody") });
});

export default app;
```

---

### 2. Next.js (App Router)
```typescript
// app/api/[...route]/route.ts
import { createNextHandler } from "mcp-multiplex/next";
import { searchDocs, createIssue, deleteIssue, toolGroups } from "@/lib/actions";

// Serves both REST routes (/api/documents/search, etc.) and the /api/mcp endpoint!
export const { GET, POST, DELETE, PATCH } = createNextHandler({
  actions: [searchDocs, createIssue, deleteIssue],
  toolGroups,
  basePath: "/api",
  mcpPath: "/api/mcp",
  getUser: async (req) => await getAuthSession(req),
});
```

---

### 3. Fastify
```typescript
import Fastify from "fastify";
import { fastifyMultiplex } from "mcp-multiplex/fastify";
import { searchDocs, createIssue, deleteIssue } from "./actions";

const fastify = Fastify();

// Mounts all action HTTP endpoints directly onto Fastify
await fastify.register(fastifyMultiplex, {
  actions: [searchDocs, createIssue, deleteIssue],
});

fastify.listen({ port: 8080 });
```

---

### 4. Express
```typescript
import express from "express";
import { createExpressRouter, registerMcpTools } from "mcp-multiplex/express";
import { searchDocs, createIssue, deleteIssue, toolGroups } from "./actions";

const app = express();
app.use(express.json());

// Mount REST routes
app.use("/api", createExpressRouter([searchDocs, createIssue, deleteIssue]));

app.listen(8080);
```

---

## 🛡️ AI Safety Exclusion

To prevent AI agents from calling sensitive admin, billing, or credential management routes:

```typescript
export const updateCard = defineAction({
  name: "update_card",
  description: "Update billing credit card",
  effect: "write",
  input: z.object({ token: z.string() }),
  http: { method: "post", path: "/billing/card" },
  mcp: false, // 👈 Completely stripped from MCP tools
  handler: async (ctx, input) => { ... },
});
```

---

## 📜 License

MIT
