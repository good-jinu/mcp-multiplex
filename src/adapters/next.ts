import { McpServer, WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { registerMcpTools } from "../core/mcp.js";
import type { ActionDefinition, ContextResolver, PreparedMcpTool, ToolGroupDefinition } from "../core/types.js";
import { createFetchHandler } from "./fetch.js";

export interface NextAdapterOptions {
  /** List of domain actions for HTTP REST */
  actions: ActionDefinition[];
  /** Optional tool groups to expose over MCP */
  toolGroups?: (PreparedMcpTool | ToolGroupDefinition)[];
  /** MCP endpoint path. Defaults to '/api/mcp' */
  mcpPath?: string;
  /** MCP server name. Defaults to 'next-mcp-server' */
  mcpServerName?: string;
  /** Base path prefix for HTTP REST routes (e.g. '/api') */
  basePath?: string;
  /** Extract user session/identity from Next.js Web Request */
  getUser?: (request: Request) => any | Promise<any>;
  /** Default context resolver */
  contextResolver?: ContextResolver;
}

/**
 * Creates Next.js App Router HTTP handlers (`GET`, `POST`, `PATCH`, `DELETE`, etc.)
 * supporting both REST API routes and the `/api/mcp` Streamable HTTP endpoint.
 *
 * @example
 * ```ts
 * // app/api/[...route]/route.ts
 * import { createNextHandler } from "mcp-multiplex/next";
 * import { actions, toolGroups } from "@/lib/actions";
 *
 * export const { GET, POST, DELETE, PATCH } = createNextHandler({
 *   actions,
 *   toolGroups,
 *   mcpPath: "/api/mcp",
 * });
 * ```
 */
export function createNextHandler(options: NextAdapterOptions) {
  const fetchHandler = createFetchHandler(options.actions, {
    basePath: options.basePath,
    getUser: options.getUser,
    contextResolver: options.contextResolver,
  });

  const mcpPath = options.mcpPath || "/api/mcp";
  const mcpServerName = options.mcpServerName || "next-mcp-server";

  const handleRequest = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    // 1. Check if request targets the MCP endpoint
    if (options.toolGroups && url.pathname === mcpPath) {
      const user = options.getUser ? await options.getUser(request) : undefined;
      const server = new McpServer({ name: mcpServerName, version: "1.0.0" });

      registerMcpTools(server, user, options.toolGroups);

      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);

      let parsedBody: unknown;
      if (request.method !== "GET" && request.method !== "HEAD") {
        try {
          parsedBody = await request.clone().json();
        } catch {
          parsedBody = undefined;
        }
      }

      return await transport.handleRequest(request, { parsedBody });
    }

    // 2. Dispatch to standard REST action fetch handler
    return await fetchHandler(request);
  };

  return {
    GET: handleRequest,
    POST: handleRequest,
    PUT: handleRequest,
    PATCH: handleRequest,
    DELETE: handleRequest,
    OPTIONS: handleRequest,
    HEAD: handleRequest,
  };
}
