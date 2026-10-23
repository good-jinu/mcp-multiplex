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

Requires Zod 4 and the MCP TypeScript SDK v2. The package root (`mcp-multiplex`) is framework-free and only
needs `zod`; each adapter is its own entry point and needs only its framework:

| Import | Needs |
| --- | --- |
| `mcp-multiplex` | `zod` |
| `mcp-multiplex/next` | `@modelcontextprotocol/server` |
| `mcp-multiplex/hono` | `hono` |
| `mcp-multiplex/express` | `express` |
| `mcp-multiplex/fastify` | (a Fastify plugin; no runtime import) |
| `mcp-multiplex/fetch` | nothing extra |

---

## ⚡ Quick Start: Define Actions & Context

Use `initMultiplex<TContext>()` for automatic type inference of `ctx` across all your actions:

```typescript
import { initMultiplex, autoGroupActions } from "mcp-multiplex";
import { z } from "zod";

interface AppContext {
  user: { id: string; orgId: string };
}

// 1. Initialize with your application's context type
export const m = initMultiplex<AppContext>();

// 2. Define domain actions (ctx is automatically typed as AppContext!)
export const searchDocs = m.action({
  name: "search_documents",
  description: "Search workspace documents",
  effect: "read",
  input: z.object({ query: z.string(), limit: z.coerce.number().default(10) }),
  http: { method: "get", path: "/documents/search" },
  handler: async (ctx, input) => {
    return await db.documents.search(ctx.user.orgId, input);
  },
});

export const createIssue = m.action({
  name: "create_issue",
  description: "Create a new issue ticket",
  effect: "write",
  input: z.object({ title: z.string().min(1), priority: z.enum(["low", "high"]) }),
  http: { method: "post", path: "/issues" },
  handler: async (ctx, input) => {
    return await db.issues.create({ userId: ctx.user.id, ...input });
  },
});

export const deleteIssue = m.action({
  name: "delete_issue",
  description: "Permanently delete an issue",
  effect: "destructive",
  input: z.object({ id: z.string() }),
  http: { method: "delete", path: "/issues/:id" },
  handler: async (_ctx, input) => {
    return await db.issues.delete(input.id);
  },
});

// 3. Group actions by effect into clean MCP tools (or use autoGroupActions)
export const toolGroups = autoGroupActions([searchDocs, createIssue, deleteIssue]);
// Generates: read_tools (searchDocs), manage_tools (createIssue), delete_tools (deleteIssue)
```

---

## 🔌 Framework Adapters

### 1. Hono & `@modelcontextprotocol/hono`
```typescript
import { createMcpHonoApp } from "@modelcontextprotocol/hono";
import { McpServer, WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { registerMcpTools } from "mcp-multiplex";
import { createHonoRoutes } from "mcp-multiplex/hono";
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

### 2. Next.js App Router

#### Dedicated MCP Endpoint (`app/api/mcp/route.ts`)
If you only need to host an MCP endpoint:
```typescript
// app/api/mcp/route.ts
import { createMcpHandler } from "mcp-multiplex/next";
import { toolGroups } from "@/lib/actions";
import { getAuthContext } from "@/lib/auth";

export const { GET, POST, OPTIONS } = createMcpHandler({
  tools: toolGroups, // or pass actions directly: [searchDocs, createIssue]
  serverName: "workspace-mcp",
  getContext: async (req) => await getAuthContext(req),
  cors: true, // auto-handles preflight OPTIONS and sets CORS headers
});
```

#### Dual REST + MCP Catch-all (`app/api/[...route]/route.ts`)
If you want both REST routes (`/api/documents/search`, etc.) and the `/api/mcp` endpoint in a single handler:
```typescript
// app/api/[...route]/route.ts
import { createNextHandler } from "mcp-multiplex/next";
import { toolGroups } from "@/lib/actions";
import { getAuthContext } from "@/lib/auth";

export const { GET, POST, DELETE, PATCH, OPTIONS } = createNextHandler({
  toolGroups, // actions are automatically extracted for REST routes!
  basePath: "/api",
  mcpPath: "/api/mcp",
  getContext: async (req) => await getAuthContext(req),
  cors: true,
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
import { createExpressRouter } from "mcp-multiplex/express";
import { searchDocs, createIssue, deleteIssue } from "./actions";

const app = express();
app.use(express.json());

// Mount REST routes
app.use("/api", createExpressRouter([searchDocs, createIssue, deleteIssue]));

app.listen(8080);
```

---

## 📥 HTTP Input & Errors

Unless an action sets `http.parseInput`, its input is the query string, then the JSON body, then the path
parameters; later sources win, so a body can never override `:id` in `DELETE /issues/:id`.

Failures use one shape everywhere: HTTP responds with `{ error, message, details }` and the error's status, and
MCP returns an error result with the message. Throw (or map with `mapError`) any object that has a numeric
`status`, a string `code` and a string `message` to control both; anything else becomes `500 internal_error`.
Invalid arguments are `400 invalid_input`, and the message names each failing field (`title: Required`). Over MCP,
the error also includes the action's expected JSON schema, so the agent can correct its call.

Pass the same `contextResolver` to your HTTP adapter and to `registerMcpTools` (`createNextHandler` does this for
you), so an action sees the same context whichever way it is called.

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
