import { McpServer, WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { applyCorsHeaders, handleCorsPreflight, normalizePath } from "../core/http.js";
import { prepareMcpTools, registerMcpTools } from "../core/mcp.js";
import type { ActionDefinition, ContextResolver, CorsOptions, McpToolInput } from "../core/types.js";
import { createFetchHandler } from "./fetch.js";

export interface NextAdapterOptions<TContext = any> {
  /** List of domain actions for HTTP REST. Optional if `toolGroups` or `tools` is provided. */
  actions?: ActionDefinition<TContext>[];
  /** Optional tool groups or direct actions to expose over MCP */
  toolGroups?: McpToolInput[];
  /** Alias of `toolGroups` */
  tools?: McpToolInput[];
  /** MCP endpoint path. Defaults to '/api/mcp' */
  mcpPath?: string;
  /** MCP server name. Defaults to 'next-mcp-server' */
  mcpServerName?: string;
  /** MCP server version. Defaults to '1.0.0' */
  mcpServerVersion?: string;
  /** Base path prefix for HTTP REST routes (e.g. '/api') */
  basePath?: string;
  /** Extract user/context from Next.js Web Request */
  getContext?: (request: Request) => TContext | Promise<TContext>;
  /** Extract user session/identity from Next.js Web Request (alias of getContext) */
  getUser?: (request: Request) => TContext | Promise<TContext>;
  /** Default context resolver, used by both the REST routes and the MCP tools */
  contextResolver?: ContextResolver<any, TContext>;
  /** CORS configuration */
  cors?: boolean | CorsOptions;
}

/**
 * Creates Next.js App Router HTTP handlers (`GET`, `POST`, `PATCH`, `DELETE`, etc.)
 * supporting both REST API routes and the `/api/mcp` Streamable HTTP endpoint.
 *
 * @example
 * ```ts
 * // app/api/[...route]/route.ts
 * import { createNextHandler } from "mcp-multiplex/next";
 * import { toolGroups } from "@/lib/actions";
 *
 * export const { GET, POST, DELETE, PATCH, OPTIONS } = createNextHandler({
 *   toolGroups, // actions automatically extracted for REST!
 *   mcpPath: "/api/mcp",
 *   cors: true,
 * });
 * ```
 */
export function createNextHandler(options: NextAdapterOptions) {
  const effectiveTools = options.tools ?? options.toolGroups;

  // Extract actions for REST routes if not explicitly provided
  let actions: ActionDefinition[] = [];
  if (options.actions) {
    actions = options.actions;
  } else if (effectiveTools) {
    for (const item of effectiveTools) {
      if ("actions" in item && Array.isArray(item.actions)) {
        actions.push(...item.actions);
      } else if ("handler" in item && "input" in item) {
        actions.push(item as ActionDefinition);
      }
    }
  }

  const contextFn = options.getContext ?? options.getUser;

  const fetchHandler = createFetchHandler(actions, {
    basePath: options.basePath,
    getContext: contextFn,
    contextResolver: options.contextResolver,
    cors: options.cors,
  });

  const mcpPath = normalizePath(options.mcpPath || "/api/mcp");
  const mcpServerName = options.mcpServerName || "next-mcp-server";
  const mcpServerVersion = options.mcpServerVersion || "1.0.0";

  // Compile MCP tools: either from explicit tools/toolGroups, or fallback to actions
  const mcpInputs = effectiveTools ?? (options.actions ? options.actions : undefined);
  const compiledTools = mcpInputs ? prepareMcpTools(mcpInputs) : undefined;

  const handleRequest = async (request: Request): Promise<Response> => {
    // 1. Handle CORS preflight
    if (request.method === "OPTIONS") {
      const preflight = handleCorsPreflight(options.cors);
      if (preflight) return preflight;
    }

    const url = new URL(request.url);

    // 2. Check if request targets the MCP endpoint (with trailing slash normalization)
    if (compiledTools && normalizePath(url.pathname) === mcpPath) {
      const user = contextFn ? await contextFn(request) : undefined;
      const server = new McpServer({ name: mcpServerName, version: mcpServerVersion });

      registerMcpTools(server, user, compiledTools, { contextResolver: options.contextResolver });

      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);

      let parsedBody: unknown;
      if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS") {
        try {
          parsedBody = await request.clone().json();
        } catch {
          parsedBody = undefined;
        }
      }

      const response = await transport.handleRequest(request, { parsedBody });
      return applyCorsHeaders(response, options.cors);
    }

    // 3. Dispatch to standard REST action fetch handler
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

export interface McpHandlerOptions<TContext = any> {
  /** Array of tool groups or direct actions to expose over MCP */
  tools: McpToolInput[];
  /** MCP server name. Defaults to 'mcp-server' */
  serverName?: string;
  /** MCP server version. Defaults to '1.0.0' */
  serverVersion?: string;
  /** Resolve context from standard Web Request */
  getContext?: (request: Request) => TContext | Promise<TContext>;
  /** Alias of getContext for backward compatibility */
  getUser?: (request: Request) => TContext | Promise<TContext>;
  /** Default context resolver */
  contextResolver?: ContextResolver<any, TContext>;
  /** CORS handling for the endpoint */
  cors?: boolean | CorsOptions;
}

/**
 * Creates a lightweight, dedicated Next.js App Router handler for an MCP endpoint (`/api/mcp`).
 * Does not set up any REST routing. Automatically handles CORS, Streamable HTTP transport,
 * and direct 1:1 action tools or tool groups.
 *
 * @example
 * ```ts
 * // app/api/mcp/route.ts
 * import { createMcpHandler } from "mcp-multiplex/next";
 * import { allToolGroups } from "@/lib/mcp/actions";
 * import { resolveProjectContext } from "@/lib/server/auth";
 *
 * export const { GET, POST, OPTIONS } = createMcpHandler({
 *   tools: allToolGroups,
 *   serverName: "my-mcp-server",
 *   getContext: resolveProjectContext,
 *   cors: true,
 * });
 * ```
 */
export function createMcpHandler(options: McpHandlerOptions) {
  const serverName = options.serverName || "mcp-server";
  const serverVersion = options.serverVersion || "1.0.0";
  const compiledTools = prepareMcpTools(options.tools);
  const contextFn = options.getContext ?? options.getUser;

  const handleMcp = async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") {
      const preflight = handleCorsPreflight(options.cors);
      if (preflight) return preflight;
    }

    const user = contextFn ? await contextFn(request) : undefined;
    const server = new McpServer({ name: serverName, version: serverVersion });

    registerMcpTools(server, user, compiledTools, { contextResolver: options.contextResolver });

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);

    let parsedBody: unknown;
    if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS") {
      try {
        parsedBody = await request.clone().json();
      } catch {
        parsedBody = undefined;
      }
    }

    const response = await transport.handleRequest(request, { parsedBody });
    return applyCorsHeaders(response, options.cors);
  };

  return {
    GET: handleMcp,
    POST: handleMcp,
    OPTIONS: handleMcp,
    HEAD: handleMcp,
  };
}
