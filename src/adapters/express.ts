import { type NextFunction, type Request, type Response, Router } from "express";
import { executeAction } from "../core/dispatcher.js";
import type { ActionDefinition, ContextResolver } from "../core/types.js";

export interface ExpressAdapterOptions {
  /** Extract user session from Express Request. Defaults to req.user */
  getUser?: (req: Request) => unknown;
  /** Optional middleware(s) applied to all mounted routes (e.g. auth middleware) */
  middleware?: ((req: Request, res: Response, next: NextFunction) => void | Promise<void>)[];
  /** Default fallback context resolver */
  contextResolver?: ContextResolver;
}

/**
 * Creates an Express Router that automatically mounts actions with `http` configurations.
 */
export function createExpressRouter(actions: ActionDefinition[], options: ExpressAdapterOptions = {}): Router {
  const router = Router();
  const getUser = options.getUser || ((req: Request) => (req as any).user);
  const middlewares = options.middleware || [];

  const httpActions = actions.filter((a) => a.http);

  for (const action of httpActions) {
    const http = action.http!;
    const method = http.method.toLowerCase() as "get" | "post" | "put" | "patch" | "delete";

    router[method](http.path, ...middlewares, async (req: Request, res: Response) => {
      let rawInput: unknown;

      if (http.parseInput) {
        rawInput = http.parseInput(req);
      } else {
        const query = req.query || {};
        const params = req.params || {};
        const body = req.body || {};
        rawInput = { ...query, ...params, ...(typeof body === "object" && body !== null ? body : {}) };
      }

      const user = getUser(req);
      const result = await executeAction(action, rawInput, user, options.contextResolver);

      if (!result.ok) {
        res.status(result.error.status).json({
          error: result.error.code,
          message: result.error.message,
          details: result.error.details,
        });
        return;
      }

      res.status(200).json(result.data);
    });
  }

  return router;
}
