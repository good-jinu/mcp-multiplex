import { executeAction } from "../core/dispatcher.js";
import { httpErrorBody, mergeHttpInput, parseJsonBody } from "../core/http.js";
import type { ActionDefinition, ContextResolver } from "../core/types.js";

export interface FetchAdapterOptions {
  /** Base path prefix (e.g. '/api') */
  basePath?: string;
  /** Extract user session/identity from standard Web Request */
  getUser?: (request: Request) => any | Promise<any>;
  /** Default context resolver */
  contextResolver?: ContextResolver;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function splitPath(path: string): string[] {
  return path.split("/").filter(Boolean);
}

/** Path params when `pathParts` matches `pattern` (e.g. "/issues/:id"), or undefined. */
function matchRoute(pattern: string[], pathParts: string[]): Record<string, string> | undefined {
  if (pattern.length !== pathParts.length) return undefined;

  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const expected = pattern[i]!;
    const actual = pathParts[i]!;
    if (expected.startsWith(":")) {
      try {
        params[expected.slice(1)] = decodeURIComponent(actual);
      } catch {
        return undefined; // malformed percent-encoding cannot match a parameter
      }
    } else if (expected !== actual) {
      return undefined;
    }
  }
  return params;
}

/**
 * Creates a universal Web Standard (Request -> Response) fetch handler for HTTP REST routes.
 */
export function createFetchHandler(actions: ActionDefinition[], options: FetchAdapterOptions = {}) {
  const routes = actions
    .filter((a) => a.http)
    .map((action) => ({ action, http: action.http!, pattern: splitPath(action.http!.path) }));
  const basePath = splitPath(options.basePath ?? "");

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const method = request.method.toLowerCase();
    const pathParts = splitPath(url.pathname);

    // The base path must match whole segments: "/api" serves "/api/x" but not "/apiary/x"
    if (basePath.some((segment, i) => pathParts[i] !== segment)) {
      return json({ error: "not_found", message: "Route not found" }, 404);
    }
    const routePath = pathParts.slice(basePath.length);

    for (const { action, http, pattern } of routes) {
      if (http.method.toLowerCase() !== method) continue;
      const params = matchRoute(pattern, routePath);
      if (!params) continue;

      let rawInput: unknown;
      if (http.parseInput) {
        rawInput = await http.parseInput(request);
      } else {
        let body: unknown = {};
        if (method !== "get" && method !== "head") {
          const parsed = parseJsonBody(await request.text());
          if (!parsed.ok) return json(httpErrorBody(parsed.error), parsed.error.status);
          body = parsed.body;
        }
        rawInput = mergeHttpInput(Object.fromEntries(url.searchParams), body, params);
      }

      const user = options.getUser ? await options.getUser(request) : undefined;
      const result = await executeAction(action, rawInput, user, options.contextResolver);
      return result.ok ? json(result.data, 200) : json(httpErrorBody(result.error), result.error.status);
    }

    return json({ error: "not_found", message: "Route not found" }, 404);
  };
}
