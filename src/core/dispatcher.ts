import type { ActionDefinition, CapabilityError, ContextResolver, ExecutionResult } from "./types.js";

function formatZodError(err: any): string {
  if (err?.issues && Array.isArray(err.issues)) {
    return err.issues.map((i: any) => i.message || "Invalid input").join("; ");
  }
  return "Invalid input arguments.";
}

export function toDefaultCapabilityError(err: unknown): CapabilityError {
  if (typeof err === "object" && err !== null && "status" in err && "code" in err && "message" in err) {
    return err as CapabilityError;
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    status: 500,
    code: "internal_error",
    message,
  };
}

/**
 * Execute an action lifecycle in a standardized, runtime-agnostic manner.
 */
export async function executeAction<TContext = any, TInput = any, TOutput = any>(
  action: ActionDefinition<TContext, TInput, TOutput>,
  rawInput: unknown,
  user: any,
  fallbackContextResolver?: ContextResolver<any, TContext>,
): Promise<ExecutionResult<TOutput>> {
  // 1. Resolve context
  const resolver = action.context || fallbackContextResolver;
  let ctx: TContext;
  if (resolver) {
    try {
      ctx = await resolver.resolve(user);
    } catch (err) {
      const mapped = resolver.mapError?.(err);
      if (mapped) {
        return { ok: false, error: mapped };
      }
      return { ok: false, error: toDefaultCapabilityError(err) };
    }
  } else {
    ctx = user as TContext;
  }

  // 2. Validate input schema
  const parsed = await action.input.safeParseAsync(rawInput ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        status: 400,
        code: "invalid_input",
        message: formatZodError(parsed.error),
        details: parsed.error.issues,
      },
    };
  }

  // 3. Execute handler
  try {
    const data = await action.handler(ctx, parsed.data);
    return { ok: true, data };
  } catch (err) {
    const mapped = action.mapError?.(err);
    if (mapped) {
      return { ok: false, error: mapped };
    }
    return { ok: false, error: toDefaultCapabilityError(err) };
  }
}

export interface ActionDispatcher {
  execute: (actionName: string, rawInput: unknown, user?: any) => Promise<ExecutionResult<any>>;
  getAction: (actionName: string) => ActionDefinition | undefined;
  listActions: () => ActionDefinition[];
}

/**
 * Creates a standalone action dispatcher kernel for running actions anywhere (CLI, Queue, Custom RPC).
 */
export function createActionDispatcher(
  actions: ActionDefinition[],
  defaultContextResolver?: ContextResolver,
): ActionDispatcher {
  const map = new Map<string, ActionDefinition>(actions.map((a) => [a.name, a]));

  return {
    getAction: (name: string) => map.get(name),
    listActions: () => Array.from(map.values()),
    execute: async (actionName: string, rawInput: unknown, user?: any) => {
      const action = map.get(actionName);
      if (!action) {
        return {
          ok: false,
          error: {
            status: 404,
            code: "action_not_found",
            message: `Action '${actionName}' not found. Available actions: ${Array.from(map.keys()).join(", ")}`,
          },
        };
      }
      return await executeAction(action, rawInput, user, defaultContextResolver);
    },
  };
}
