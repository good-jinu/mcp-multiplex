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
