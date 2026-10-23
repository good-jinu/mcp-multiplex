import { defineAction } from "./action.js";
import { defineToolGroup } from "./group.js";
import type { ActionDefinition, MultiplexInstance, ToolGroupDefinition } from "./types.js";

/**
 * Creates a scoped multiplex instance bound to a specific execution context type.
 * All actions created through this instance will have their `ctx` handler argument
 * typed as `TContext` automatically without requiring per-action type annotations.
 *
 * @example
 * ```ts
 * interface ProjectContext {
 *   projectId: string;
 *   db: Database;
 * }
 *
 * export const m = initMultiplex<ProjectContext>();
 *
 * export const listItems = m.action({
 *   name: "list_items",
 *   effect: "read",
 *   input: z.object({ limit: z.number().default(20) }),
 *   handler: async (ctx, input) => {
 *     // ctx is automatically typed as ProjectContext!
 *     return ctx.db.items.findMany({ take: input.limit });
 *   },
 * });
 * ```
 */
export function initMultiplex<TContext = any>(): MultiplexInstance<TContext> {
  return {
    action: <TInput = any, TOutput = any>(definition: ActionDefinition<TContext, TInput, TOutput>) =>
      defineAction(definition),
    group: (definition: ToolGroupDefinition) => defineToolGroup(definition),
    toolGroup: (definition: ToolGroupDefinition) => defineToolGroup(definition),
  };
}
