import { type NextFunction, type Request, type Response, Router } from "express";
import { executeAction } from "../core/dispatcher.js";
import { httpErrorBody, mergeHttpInput } from "../core/http.js";
import type { ActionDefinition, ContextResolver } from "../core/types.js";

export interface ExpressAdapterOptions {
  /** Extract context from Express Request. Defaults to req.user */
  getContext?: (req: Request) => unknown;
  /** Extract user session from Express Request (alias of getContext). Defaults to req.user */
  getUser?: (req: Request) => unknown;
  /** Optional middleware(s) applied to all mounted routes (e.g. auth middleware) */
  middleware?: ((req: Request, res: Response, next: NextFunction) => void | Promise<void>)[];
  /** Default fallback context resolver */
  contextResolver?: ContextResolver;
}

/**
 * Creates an Express Router that automatically mounts actions with `http` configurations.
 * Requires a JSON body parser (e.g. `express.json()`) before the router for body input.
 */
export function createExpressRouter(actions: ActionDefinition[], options: ExpressAdapterOptions = {}): Router {
  const router = Router();
  const getCtx = options.getContext || options.getUser || ((req: Request) => (req as any).user);
  const middlewares = options.middleware || [];

  for (const action of actions.filter((a) => a.http)) {
    const http = action.http!;
    const method = http.method.toLowerCase() as "get" | "post" | "put" | "patch" | "delete";

    router[method](http.path, ...middlewares, async (req: Request, res: Response, next: NextFunction) => {
      // Express 4 does not catch rejected promises, so failures outside the action go to `next`
      try {
        const rawInput = http.parseInput ? await http.parseInput(req) : mergeHttpInput(req.query, req.body, req.params);
        const result = await executeAction(action, rawInput, await getCtx(req), options.contextResolver);
        if (result.ok) {
          res.status(200).json(result.data);
        } else {
          res.status(result.error.status).json(httpErrorBody(result.error));
        }
      } catch (err) {
        next(err);
      }
    });
  }

  return router;
}
