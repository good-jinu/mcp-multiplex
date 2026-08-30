import { type Context, Hono, type MiddlewareHandler } from "hono";
import { executeAction } from "../core/dispatcher.js";
import type { ActionDefinition, ContextResolver } from "../core/types.js";

export interface HonoAdapterOptions {
  /** Extract user session from Hono Context. Defaults to c.get('user') */
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
  const getUser = options.getUser || ((c: Context) => c.get("user"));
  const middlewares = options.middleware || [];

  const httpActions = actions.filter((a) => a.http);

  for (const action of httpActions) {
    const http = action.http!;
    const method = http.method.toUpperCase();

    (router as any).on(method, http.path, ...middlewares, async (c: Context) => {
      let rawInput: unknown;

      if (http.parseInput) {
        rawInput = await http.parseInput(c);
      } else {
        const query = c.req.query() || {};
        const params = c.req.param() || {};
        let body: any = {};
        if (http.method.toLowerCase() !== "get") {
          try {
            body = await c.req.json();
          } catch {
            body = {};
          }
        }
        rawInput = { ...query, ...params, ...(typeof body === "object" && body !== null ? body : {}) };
      }

      const user = getUser(c);
      const result = await executeAction(action, rawInput, user, options.contextResolver);

      if (!result.ok) {
        return c.json(
          {
            error: result.error.code,
            message: result.error.message,
            details: result.error.details,
          },
          result.error.status as any,
        );
      }

      return c.json(result.data, 200);
    });
  }

  return router;
}
