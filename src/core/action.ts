import type { ActionDefinition } from "./types.js";

/**
 * Type-safe helper to define an action with automatic type inference
 * for context, input schema, and handler return value.
 */
export function defineAction<TContext = any, TInput = any, TOutput = any>(
  definition: ActionDefinition<TContext, TInput, TOutput>,
): ActionDefinition<TContext, TInput, TOutput> {
  return definition;
}

/** Whether an action may be offered to AI agents as part of an MCP tool. */
export function isExposedToMcp(action: ActionDefinition): boolean {
  return action.mcp !== false && action.agent !== false && !action.mcpExcluded;
}
