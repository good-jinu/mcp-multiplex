import { type Context, Hono, type MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { executeAction } from "../core/dispatcher.js";
import { httpErrorBody, mergeHttpInput, parseJsonBody } from "../core/http.js";
import type { ActionDefinition, ContextResolver } from "../core/types.js";

export interface HonoAdapterOptions {
  /** Extract context from Hono Context. Defaults to c.get('user') */
  getContext?: (c: Context) => any;
  /** Extract user session from Hono Context (alias of getContext). Defaults to c.get('user') */
  getUser?: (c: Context) => any;
  /** Optional middleware(s) applied to all mounted routes */
  middleware?: MiddlewareHandler[];
  /** Default fallback context resolver */
  contextResolver?: ContextResolver;
}

/**
 * Creates a Hono router with actions mounted to their HTTP methods and paths.
 */
export function createHonoRoutes(actions: ActionDefinition[], options: HonoAdapterOptions = {}): Hono {
  const router = new Hono();
  const getCtx = options.getContext || options.getUser || ((c: Context) => c.get("user"));
  const middlewares = options.middleware || [];

  for (const action of actions.filter((a) => a.http)) {
    const http = action.http!;
    const method = http.method.toLowerCase();

    router.on(method.toUpperCase(), [http.path], ...middlewares, async (c: Context) => {
      let rawInput: unknown;
      if (http.parseInput) {
        rawInput = await http.parseInput(c);
      } else {
        let body: unknown = {};
        if (method !== "get") {
          const parsed = parseJsonBody(await c.req.text());
          if (!parsed.ok) return c.json(httpErrorBody(parsed.error), parsed.error.status as ContentfulStatusCode);
          body = parsed.body;
        }
        rawInput = mergeHttpInput(c.req.query(), body, c.req.param());
      }

      const result = await executeAction(action, rawInput, await getCtx(c), options.contextResolver);
      if (result.ok) {
        return c.json(result.data, 200);
      }
      return c.json(httpErrorBody(result.error), result.error.status as ContentfulStatusCode);
    });
  }

  return router;
}
