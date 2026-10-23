import { z } from "zod";
import type { ActionDefinition, CapabilityEffect, ToolGroupDefinition } from "./types.js";

export const INLINE_SCHEMA_LIMIT = 900;

export const EFFECT_ANNOTATIONS: Record<
  CapabilityEffect,
  { readOnlyHint: boolean; idempotentHint: boolean; destructiveHint: boolean }
> = {
  read: { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  write: { readOnlyHint: false, idempotentHint: false, destructiveHint: false },
  destructive: { readOnlyHint: false, idempotentHint: true, destructiveHint: true },
};

export const EFFECT_LABEL: Record<CapabilityEffect, string> = {
  read: "read",
  write: "write",
  destructive: "destructive",
};

/**
 * Serialize a Zod schema to JSON Schema (the input side, as callers send it).
 * Returns undefined for schemas that cannot be represented.
 */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> | undefined {
  try {
    return z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * Whether an action's input schema is too large to inline into `tools/list`. Such schemas are left
 * out of the tool's argument schema and returned to the caller when its arguments fail validation.
 */
export function isSchemaOnDemand(action: ActionDefinition): boolean {
  const json = toJsonSchema(action.input);
  return json !== undefined && JSON.stringify(json).length > INLINE_SCHEMA_LIMIT;
}

const passthroughArgs = z.record(z.string(), z.unknown());

/**
 * Builds a union schema for multiplexed tool args while relaxing strict validation
 * for documentation purposes (actual strict validation happens per action during execution).
 */
export function buildMultiplexedArgsSchema(actions: ActionDefinition[]): z.ZodType {
  const documented = actions
    .filter((action) => !isSchemaOnDemand(action))
    .map((action) => (action.input instanceof z.ZodObject ? action.input.loose() : action.input));

  // The open record keeps every call valid at the tool boundary; each action validates strictly itself
  const [first, ...rest] = documented;
  return first === undefined ? passthroughArgs : z.union([first, ...rest, passthroughArgs]);
}

/**
 * Formats a clean human and LLM-friendly description listing all multiplexed actions.
 */
export function buildMultiplexedDescription(group: ToolGroupDefinition, activeActions: ActionDefinition[]): string {
  const rows = activeActions.map((action) => {
    const onDemandNote = isSchemaOnDemand(action) ? " (input schema is returned if a call's args are invalid)" : "";
    return `• ${action.name} [${EFFECT_LABEL[action.effect]}]: ${action.description}${onDemandNote}`;
  });

  return `${group.summary}\n\nSelect an action and pass its input parameters inside \`args\`:\n${rows.join("\n")}`;
}
