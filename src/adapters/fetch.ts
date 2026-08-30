import { executeAction } from "../core/dispatcher.js";
import type { ActionDefinition, ContextResolver } from "../core/types.js";

export interface FetchAdapterOptions {
  /** Base path prefix (e.g. '/api') */
  basePath?: string;
  /** Extract user session/identity from standard Web Request */
  getUser?: (request: Request) => any | Promise<any>;
  /** Default context resolver */
  contextResolver?: ContextResolver;
}

function matchRoute(pattern: string, pathname: string): { matched: boolean; params: Record<string, string> } {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);

  if (patternParts.length !== pathParts.length) {
    return { matched: false, params: {} };
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const pPart = patternParts[i]!;
    const aPart = pathParts[i]!;
    if (pPart.startsWith(":")) {
      params[pPart.slice(1)] = decodeURIComponent(aPart);
    } else if (pPart !== aPart) {
      return { matched: false, params: {} };
    }
  }

  return { matched: true, params };
}

/**
 * Creates a universal Web Standard (Request -> Response) fetch handler for HTTP REST routes.
 */
export function createFetchHandler(actions: ActionDefinition[], options: FetchAdapterOptions = {}) {
  const httpActions = actions.filter((a) => a.http);
  const basePath = options.basePath?.replace(/\/+$/, "") || "";

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const method = request.method.toLowerCase();
    let pathname = url.pathname;

    if (basePath && pathname.startsWith(basePath)) {
      pathname = pathname.slice(basePath.length) || "/";
    }

    for (const action of httpActions) {
      const http = action.http!;
      if (http.method.toLowerCase() !== method) continue;

      const { matched, params } = matchRoute(http.path, pathname);
      if (!matched) continue;

      // Extract raw input
      let rawInput: any = {};
      if (http.parseInput) {
        rawInput = await http.parseInput(request);
      } else {
        const queryParams = Object.fromEntries(url.searchParams.entries());
        let body: any = {};
        if (method !== "get" && method !== "head") {
          try {
            body = await request.json();
          } catch {
            body = {};
          }
        }
        rawInput = { ...queryParams, ...params, ...(typeof body === "object" && body !== null ? body : {}) };
      }

      const user = options.getUser ? await options.getUser(request) : undefined;
      const result = await executeAction(action, rawInput, user, options.contextResolver);

      if (!result.ok) {
        return new Response(
          JSON.stringify({ error: result.error.code, message: result.error.message, details: result.error.details }),
          {
            status: result.error.status,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(JSON.stringify(result.data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "not_found", message: "Route not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  };
}
