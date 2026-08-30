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
 * Serialize a Zod schema to JSON Schema.
 */
export function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> | undefined {
  try {
    if (typeof (z as any).toJSONSchema === "function") {
      return (z as any).toJSONSchema(schema, { io: "input", unrepresentable: "any" });
    }
  } catch {
    // Fallback if toJSONSchema throws
  }
  return undefined;
}

/**
 * Determines whether a schema is too large to inline directly into tools/list.
 */
export function isSchemaOnDemand(action: ActionDefinition): boolean {
  const json = toJsonSchema(action.input);
  if (!json) return false;
  return JSON.stringify(json).length > INLINE_SCHEMA_LIMIT;
}

const passthroughArgs = z.record(z.string(), z.unknown());

/**
 * Builds a union schema for multiplexed tool args while relaxing strict validation
 * for documentation purposes (actual strict validation happens per action during execution).
 */
export function buildMultiplexedArgsSchema(actions: ActionDefinition[]): z.ZodTypeAny {
  if (actions.length === 0) return passthroughArgs;

  const members: z.ZodTypeAny[] = [passthroughArgs];

  for (const action of actions) {
    if (!isSchemaOnDemand(action)) {
      const input = action.input as any;
      const looseInput = typeof input.loose === "function" ? input.loose() : input;
      members.push(looseInput);
    }
  }

  // Deduplicate schema instances
  const unique = members.filter((m, i, arr) => arr.indexOf(m) === i);
  return unique.length === 1 ? unique[0]! : z.union(unique as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
}

/**
 * Formats a clean human and LLM-friendly description listing all multiplexed actions.
 */
export function buildMultiplexedDescription(group: ToolGroupDefinition, activeActions: ActionDefinition[]): string {
  const rows = activeActions.map((action) => {
    const onDemandNote = isSchemaOnDemand(action) ? " (Input schema is deferred to on-demand discovery)" : "";
    return `• ${action.name} [${EFFECT_LABEL[action.effect]}]: ${action.description}${onDemandNote}`;
  });

  return `${group.summary}\n\nSelect an action and pass its input parameters inside \`args\`:\n${rows.join("\n")}`;
}
